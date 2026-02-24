import type { MessageContent, TextContent } from "@/services/llm";

export type ExportConversationMode = "chat" | "agent";
export type ExportMessageRole = "user" | "assistant";

export interface RawConversationMessage {
  id?: string;
  role: "user" | "assistant" | "system" | "tool";
  content: MessageContent;
}

export interface ExportMessage {
  id: string;
  role: ExportMessageRole;
  content: string;
  order: number;
}

interface MarkdownBuildOptions {
  title: string;
  modeLabel: string;
  messages: ExportMessage[];
  roleLabels: {
    user: string;
    assistant: string;
  };
}

const AGENT_USER_SKIP_PATTERNS = [
  "<tool_result",
  "<tool_error",
  "你的响应没有包含有效的工具调用",
  "请使用 <thinking> 标签分析错误原因",
  "系统错误:",
  "系统拒绝执行",
  "用户拒绝了工具调用",
];

const TOOL_LINE_PATTERN = /^(?:🔧|✅|❌)\s+\w+\s*:/;

function getTextFromContent(content: MessageContent): string {
  if (typeof content === "string") {
    return content;
  }

  return content
    .filter((item) => item.type === "text")
    .map((item) => (item as TextContent).text)
    .join("\n");
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function shouldSkipAgentUserMessage(content: string): boolean {
  return AGENT_USER_SKIP_PATTERNS.some((pattern) => content.includes(pattern));
}

function cleanAgentUserMessage(content: string): string {
  const cleaned = content
    .replace(/<task>([\s\S]*?)<\/task>/g, "$1")
    .replace(/<current_note[^>]*>[\s\S]*?<\/current_note>/g, "")
    .replace(/<related_notes[^>]*>[\s\S]*?<\/related_notes>/g, "");

  return normalizeText(cleaned);
}

function stripAgentAssistantMarkup(content: string): string {
  if (TOOL_LINE_PATTERN.test(content.trim())) {
    return "";
  }

  let output = content;

  output = output.replace(/<thinking>([\s\S]*?)<\/thinking>/g, "");
  output = output.replace(/<tool_result[^>]*>([\s\S]*?)<\/tool_result>/g, "");
  output = output.replace(/<tool_error[^>]*>([\s\S]*?)<\/tool_error>/g, "");
  output = output.replace(/<attempt_completion_result>([\s\S]*?)<\/attempt_completion_result>/g, "$1");
  output = output.replace(/<attempt_completion>([\s\S]*?)<\/attempt_completion>/g, (_whole, inner: string) => {
    const resultMatch = inner.match(/<result>([\s\S]*?)<\/result>/);
    return resultMatch ? resultMatch[1] : inner;
  });

  output = output.replace(/<\/?[a-zA-Z_][\w:-]*[^>]*>/g, " ");
  output = decodeHtmlEntities(output);

  return normalizeText(output);
}

function makeMessageId(mode: ExportConversationMode, msg: RawConversationMessage, index: number): string {
  if (msg.id && msg.id.trim()) {
    return `${mode}-${msg.id}`;
  }
  return `${mode}-${index}-${msg.role}`;
}

export function buildChatExportMessages(messages: RawConversationMessage[]): ExportMessage[] {
  const result: ExportMessage[] = [];

  messages.forEach((msg, index) => {
    if (msg.role !== "user" && msg.role !== "assistant") {
      return;
    }

    const content = normalizeText(getTextFromContent(msg.content));
    if (!content) {
      return;
    }

    result.push({
      id: makeMessageId("chat", msg, index),
      role: msg.role,
      content,
      order: index,
    });
  });

  return result;
}

export function buildAgentExportMessages(messages: RawConversationMessage[]): ExportMessage[] {
  const result: ExportMessage[] = [];

  messages.forEach((msg, index) => {
    if (msg.role === "tool" || msg.role === "system") {
      return;
    }

    const raw = getTextFromContent(msg.content);
    if (!raw.trim()) {
      return;
    }

    if (msg.role === "user") {
      if (shouldSkipAgentUserMessage(raw)) {
        return;
      }
      const content = cleanAgentUserMessage(raw);
      if (!content) {
        return;
      }
      result.push({
        id: makeMessageId("agent", msg, index),
        role: "user",
        content,
        order: index,
      });
      return;
    }

    if (msg.role === "assistant") {
      const content = stripAgentAssistantMarkup(raw);
      if (!content) {
        return;
      }
      result.push({
        id: makeMessageId("agent", msg, index),
        role: "assistant",
        content,
        order: index,
      });
    }
  });

  return result;
}

export function buildConversationExportMarkdown(options: MarkdownBuildOptions): string {
  const { title, modeLabel, messages, roleLabels } = options;
  const lines: string[] = [
    `# ${title}`,
    "",
    modeLabel,
    "",
  ];

  messages.forEach((message) => {
    const roleLabel = message.role === "user" ? roleLabels.user : roleLabels.assistant;
    lines.push(`## ${roleLabel}`);
    lines.push("");
    lines.push(message.content);
    lines.push("");
  });

  return `${lines.join("\n").trim()}\n`;
}

export function sanitizeExportFileName(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "conversation";
  }

  return trimmed
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || "conversation";
}
