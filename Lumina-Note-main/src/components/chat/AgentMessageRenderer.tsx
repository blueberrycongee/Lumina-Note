/**
 * Agent 消息渲染组件
 * 
 * Render agent output as a strict timeline:
 * - Thinking blocks (collapsible)
 * - Tool calls/results (collapsible)
 * - Text segments (Markdown)
 */

import { useState, useMemo, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocaleStore, getCurrentTranslations } from '@/stores/useLocaleStore';
import { parseMarkdown } from "@/services/markdown/markdown";
import type { ImageContent, MessageAttachment, MessageContent } from "@/services/llm";
import { useTimeout } from "@/hooks/useTimeout";
import { DiffView } from "@/components/effects/DiffView";
import { useAIStore, type PendingDiff } from "@/stores/useAIStore";
import { useFileStore } from "@/stores/useFileStore";
import { saveFile } from "@/lib/tauri";
import { getImagesFromContent, getTextFromContent, getUserMessageDisplay } from "./messageContentUtils";
import { AssistantDiagramPanels } from "./AssistantDiagramPanels";
import { getDiagramAttachmentFilePaths } from "./diagramAttachmentUtils";
import { UserMessageBubbleContent } from "./UserMessageBubbleContent";
import {
  ChevronRight,
  ChevronDown,
  Wrench,
  Brain,
  Check,
  X,
  Loader2,
  Bot,
  Copy,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

// ============ 类型定义 ============

interface ToolCallInfo {
  name: string;
  params: string;
  result?: string;
  success?: boolean;
}

type AgentMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: MessageContent;
  attachments?: MessageAttachment[];
  agent?: string;
  id?: string;
};

type TimelinePart =
  | { type: "text"; content: string }
  | { type: "thinking"; content: string }
  | { type: "tool"; tool: ToolCallInfo }
  | { type: "diff"; diff: PendingDiff };

// ============ 解析函数 ============

const IGNORED_TAGS = new Set([
  "task",
  "current_note",
  "related_notes",
  "result",
  "directory",
  "recursive",
  "paths",
  "path",
  "content",
  "edits",
  "search",
  "replace",
]);

function parseTagAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /(\w+)="([^"]*)"/g;
  let match;
  while ((match = attrRegex.exec(raw)) !== null) {
    attrs[match[1]] = decodeHtmlEntities(match[2]);
  }
  return attrs;
}

function pushTextPart(parts: TimelinePart[], text: string, includeText: boolean) {
  if (!includeText) return;
  const cleaned = text.replace(/<\|end_of_thinking\|>/g, "");
  if (cleaned.trim().length === 0) return;
  parts.push({ type: "text", content: cleaned });
}

function appendPartsFromContent(
  content: string,
  parts: TimelinePart[],
  lastToolCall: { current: ToolCallInfo | null },
  includeText: boolean
) {
  const trimmed = content.trim();

  // Rust Agent 格式：🔧 tool_name: {...}
  const rustToolMatch = trimmed.match(/^🔧\s*(\w+)\s*:\s*([\s\S]+)$/);
  if (rustToolMatch) {
    const tool = {
      name: rustToolMatch[1],
      params: formatToolParams(rustToolMatch[2]),
    };
    parts.push({ type: "tool", tool });
    lastToolCall.current = tool;
    return;
  }

  // Rust Agent 格式：✅ 结果... 或 ❌ 错误...
  const rustSuccessMatch = trimmed.match(/^✅\s*(\w+)\s*:\s*([\s\S]+)$/);
  if (rustSuccessMatch) {
    const toolName = rustSuccessMatch[1];
    const result = rustSuccessMatch[2].trim();
    if (lastToolCall.current && lastToolCall.current.name === toolName) {
      lastToolCall.current.result = result;
      lastToolCall.current.success = true;
    } else {
      parts.push({
        type: "tool",
        tool: { name: toolName, params: "", result, success: true },
      });
    }
    lastToolCall.current = null;
    return;
  }
  if (trimmed.startsWith("✅")) {
    const result = trimmed.slice(1).trim();
    if (lastToolCall.current) {
      lastToolCall.current.result = result;
      lastToolCall.current.success = true;
    } else {
      parts.push({
        type: "tool",
        tool: { name: "tool", params: "", result, success: true },
      });
    }
    lastToolCall.current = null;
    return;
  }

  const rustErrorMatch = trimmed.match(/^❌\s*(\w+)\s*:\s*([\s\S]+)$/);
  if (rustErrorMatch) {
    const toolName = rustErrorMatch[1];
    const result = rustErrorMatch[2].trim();
    if (lastToolCall.current && lastToolCall.current.name === toolName) {
      lastToolCall.current.result = result;
      lastToolCall.current.success = false;
    } else {
      parts.push({
        type: "tool",
        tool: { name: toolName, params: "", result, success: false },
      });
    }
    lastToolCall.current = null;
    return;
  }
  if (trimmed.startsWith("❌")) {
    const result = trimmed.slice(1).trim();
    if (lastToolCall.current) {
      lastToolCall.current.result = result;
      lastToolCall.current.success = false;
    } else {
      parts.push({
        type: "tool",
        tool: { name: "tool", params: "", result, success: false },
      });
    }
    lastToolCall.current = null;
    return;
  }

  const tagRegex = /<([a-zA-Z_][\w-]*)([^>]*)>([\s\S]*?)<\/\1>/g;
  let lastIndex = 0;
  let match;

  while ((match = tagRegex.exec(content)) !== null) {
    const leadingText = content.slice(lastIndex, match.index);
    pushTextPart(parts, leadingText, includeText);

    const tagName = match[1];
    const tagNameLower = tagName.toLowerCase();
    const attrsRaw = match[2] ?? "";
    const inner = match[3] ?? "";

    if (tagNameLower === "thinking") {
      const thinkingText = inner.trim();
      if (thinkingText.length > 0) {
        parts.push({ type: "thinking", content: thinkingText });
      }
    } else if (tagNameLower === "tool_result" || tagNameLower === "tool_error") {
      const attrs = parseTagAttributes(attrsRaw);
      const name = attrs.name ?? lastToolCall.current?.name ?? tagName;
      const paramsRaw = attrs.params ?? lastToolCall.current?.params ?? "";
      const params = paramsRaw ? formatToolParams(paramsRaw) : "";
      const result = inner.trim();
      const success = tagNameLower === "tool_result";
      if (lastToolCall.current && lastToolCall.current.name === name) {
        if (params && !lastToolCall.current.params) {
          lastToolCall.current.params = params;
        }
        lastToolCall.current.result = result;
        lastToolCall.current.success = success;
      } else {
        parts.push({
          type: "tool",
          tool: { name, params, result, success },
        });
      }
      lastToolCall.current = null;
    } else if (tagNameLower === "attempt_completion_result") {
      pushTextPart(parts, inner, includeText);
    } else if (tagNameLower === "attempt_completion") {
      const resultMatch = inner.match(/<result>([\s\S]*?)<\/result>/);
      const resultText = resultMatch ? resultMatch[1] : inner;
      pushTextPart(parts, resultText, includeText);
    } else if (!IGNORED_TAGS.has(tagNameLower)) {
      const tool = {
        name: tagName,
        params: formatToolParams(inner),
      };
      parts.push({ type: "tool", tool });
      lastToolCall.current = tool;
    }

    lastIndex = tagRegex.lastIndex;
  }

  const trailingText = content.slice(lastIndex);
  pushTextPart(parts, trailingText, includeText);
}

function formatMarkdownContent(content: string): string {
  let output = content;
  const newlineCount = (output.match(/\n/g) || []).length;
  const contentLength = output.length;
  if (contentLength > 100 && newlineCount < contentLength / 200) {
    output = output
      .replace(/(?<!^|\n)(#{1,6}\s)/g, "\n\n$1")
      .replace(/(?<!^|\n)(\|[^|]+\|)/g, "\n$1")
      .replace(/(?<!^|\n)(\*\*[^*]+\*\*)/g, "\n$1")
      .replace(/(?<!^|\n)([\u{1F300}-\u{1F9FF}]\s)/gu, "\n\n$1")
      .replace(/(?<!^|\n)(\d+\.\s)/g, "\n$1")
      .replace(/(?<!^|\n)(-\s+\*\*)/g, "\n$1")
      .replace(/(---)/g, "\n$1\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return output;
}

/**
 * 格式化工具参数为可读形式
 */
function formatToolParams(params: string): string {
  const t = getCurrentTranslations().agentMessage;
  const trimmed = params.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const parts: string[] = [];
      const filePath = parsed.filePath ?? parsed.path;
      if (typeof filePath === "string" && filePath) {
        parts.push(`${t.file}: ${filePath}`);
      }
      const directory = parsed.directory ?? parsed.dir;
      if (typeof directory === "string" && directory) {
        parts.push(`${t.directory}: ${directory}`);
      }
      if (typeof parsed.url === "string") {
        parts.push(`${t.url}: ${parsed.url}`);
      }
      if (typeof parsed.query === "string") {
        parts.push(`${t.query}: ${parsed.query}`);
      }
      if (typeof parsed.pattern === "string") {
        parts.push(`${t.pattern}: ${parsed.pattern}`);
      }
      if (parts.length > 0) {
        return parts.join(" | ");
      }
      return JSON.stringify(parsed).slice(0, 100);
    } catch {
      // fall through to legacy parsing
    }
  }
  const parts: string[] = [];

  const dirMatch = params.match(/<directory>([^<]*)<\/directory>/);
  if (dirMatch) parts.push(`${t.directory}: ${dirMatch[1] || "/"}`);

  const recursiveMatch = params.match(/<recursive>([^<]*)<\/recursive>/);
  if (recursiveMatch) parts.push(`${t.recursive}: ${recursiveMatch[1]}`);

  const pathsMatch = params.match(/<paths>([^<]*)<\/paths>/);
  if (pathsMatch) parts.push(`${t.paths}: ${pathsMatch[1]}`);

  const pathMatch = params.match(/<path>([^<]*)<\/path>/);
  if (pathMatch) parts.push(`${t.file}: ${pathMatch[1]}`);

  if (parts.length > 0) {
    return parts.join(" | ");
  }

  return params.replace(/<[^>]+>/g, " ").trim().slice(0, 100);
}

/**
 * 生成工具摘要 - 优先显示参数信息
 */
function getToolSummary(name: string, params: string, result?: string): string {
  const t = getCurrentTranslations().agentMessage;
  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // 优先从参数中提取关键信息
  if (name === "list") {
    const dirMatch = params.match(new RegExp(`${escapeRegExp(t.directory)}:\\s*([^\\s|]+)`));
    if (dirMatch) return `${t.directory}: ${dirMatch[1] || "/"}`;
  }
  if (name === "read") {
    const fileMatch = params.match(new RegExp(`${escapeRegExp(t.file)}:\\s*([^\\s|]+)`));
    if (fileMatch) return `${t.file}: ${fileMatch[1]}`;
  }
  if (name === "write" || name === "edit") {
    const fileMatch = params.match(new RegExp(`${escapeRegExp(t.file)}:\\s*([^\\s|]+)`));
    if (fileMatch) return `${t.file}: ${fileMatch[1]}`;
  }
  if (name === "grep" || name === "glob" || name === "fetch") {
    // 搜索工具显示搜索关键词
    return params.slice(0, 30) + (params.length > 30 ? "..." : "");
  }

  // 如果没有匹配到，显示参数摘要
  if (params) {
    return params.slice(0, 40) + (params.length > 40 ? "..." : "");
  }

  // 最后回退到结果
  if (result) {
    return result.length > 50 ? result.slice(0, 50) + "..." : result;
  }

  return t.executing;
}

/**
 * 解码 HTML 实体（用于匹配后端转义的 params）
 */
function decodeHtmlEntities(str: string): string {
  return str.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

function parseToolMessage(content: string): { tool: ToolCallInfo; isStart: boolean } | null {
  const match = content.match(/^(🔧|✅|❌)\s+(\w+):\s*([\s\S]*)$/);
  if (!match) return null;
  const symbol = match[1];
  const name = match[2];
  const payload = match[3].trim();
  if (symbol === "🔧") {
    return { tool: { name, params: formatToolParams(payload) }, isStart: true };
  }
  return {
    tool: {
      name,
      params: "",
      result: payload,
      success: symbol === "✅",
    },
    isStart: false,
  };
}

/**
 * 判断 user 消息是否应该跳过（工具结果、系统提示等）
 */
function shouldSkipUserMessage(content: string): boolean {
  return content.includes("<tool_result") ||
    content.includes("<tool_error") ||
    content.includes("你的响应没有包含有效的工具调用") ||
    content.includes("请使用 <thinking> 标签分析错误原因") ||
    content.includes("系统错误:") ||
    content.includes("系统拒绝执行") ||
    content.includes("用户拒绝了工具调用");
}

/**
 * 清理 user 消息显示内容
 */
function cleanUserMessage(content: string): string {
  return content
    .replace(/<task>([\s\S]*?)<\/task>/g, "$1")
    .replace(/<current_note[^>]*>[\s\S]*?<\/current_note>/g, "")
    .replace(/<related_notes[^>]*>[\s\S]*?<\/related_notes>/g, "")
    .trim();
}

// ============ 子组件 ============

/**
 * 思考块折叠组件
 */
export const ThinkingCollapsible = memo(function ThinkingCollapsible({
  thinking,
  t,
  status = "done",
}: {
  thinking: string;
  t: any;
  status?: "thinking" | "done";
}) {
  const [expanded, setExpanded] = useState(false);
  const title = status === "thinking"
    ? t.agentMessage.thinking
    : (t.agentMessage.thinkingDone || t.agentMessage.thinking);

  return (
    <div className="text-xs text-muted-foreground/70">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 hover:text-muted-foreground transition-colors py-0.5"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Brain size={12} />
        <span>{title}</span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pl-5 py-1 text-[11px] text-muted-foreground/60 whitespace-pre-wrap border-l border-muted-foreground/20 ml-1.5">
              {thinking || t.agentMessage.thinkingWaiting}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

/**
 * 工具调用折叠卡片
 */
const ToolCallCollapsible = memo(function ToolCallCollapsible({ tool, t }: { tool: ToolCallInfo, t: any }) {
  const [expanded, setExpanded] = useState(false);
  const isComplete = tool.result !== undefined;
  const summary = getToolSummary(tool.name, tool.params, tool.result);

  return (
    <div className="text-xs text-muted-foreground/70">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 hover:text-muted-foreground transition-colors py-0.5 w-full text-left"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Wrench size={12} />
        <span className="font-medium">{tool.name}</span>

        {/* 状态图标 */}
        {isComplete ? (
          tool.success ? (
            <Check size={12} className="text-green-500/70" />
          ) : (
            <X size={12} className="text-red-500/70" />
          )
        ) : (
          <Loader2 size={12} className="animate-spin" />
        )}

        {/* 摘要 */}
        <span className="truncate flex-1 opacity-70">{summary}</span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pl-5 py-1 space-y-1 border-l border-muted-foreground/20 ml-1.5">
              {tool.params && (
                <div>
                  <div className="text-[10px] text-muted-foreground/50 mb-0.5">{t.agentMessage.params}:</div>
                  <pre className="text-[10px] bg-muted/30 p-1.5 rounded overflow-x-auto">
                    {tool.params}
                  </pre>
                </div>
              )}
              {tool.result && (
                <div>
                  <div className="text-[10px] text-muted-foreground/50 mb-0.5">{t.agentMessage.result}:</div>
                  <pre className="text-[10px] bg-muted/30 p-1.5 rounded overflow-x-auto max-h-32 overflow-y-auto">
                    {tool.result}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// ============ 主组件 ============

interface AgentMessageRendererProps {
  messages: AgentMessage[];
  isRunning: boolean;
  className?: string;
  // 超时检测（LLM 请求级别）
  llmRequestStartTime?: number | null;
  onRetryTimeout?: () => void;
}

// 超时阈值：2 分钟
const TIMEOUT_THRESHOLD_MS = 2 * 60 * 1000;

/**
 * Agent 消息列表渲染器
 * 
 * 核心逻辑：将消息按"轮次"分组并按时间顺序渲染
 * - 每轮以用户消息开始
 * - assistant/user 内部系统消息按原始顺序展开为时间线片段
 */
export const AgentMessageRenderer = memo(function AgentMessageRenderer({
  messages,
  isRunning,
  className = "",
  llmRequestStartTime,
  onRetryTimeout,
}: AgentMessageRendererProps) {

  // 使用可复用的超时检测 hook
  const { isTimeout: isLongRunning } = useTimeout(llmRequestStartTime ?? null, {
    threshold: TIMEOUT_THRESHOLD_MS,
    enabled: isRunning,
  });

  const { pendingDiff, setPendingDiff, clearPendingEdits, diffResolver } = useAIStore();
  const openFile = useFileStore((state) => state.openFile);
  const { t } = useLocaleStore();

  const handleAcceptDiff = useCallback(async () => {
    if (!pendingDiff) return;

    try {
      await saveFile(pendingDiff.filePath, pendingDiff.modified);
      clearPendingEdits();
      await openFile(pendingDiff.filePath, false, true);

      if (diffResolver) {
        diffResolver(true);
      }
    } catch (error) {
      console.error("Failed to apply edit:", error);
      alert(t.ai.applyEditFailed.replace('{error}', String(error)));
    }
  }, [pendingDiff, clearPendingEdits, openFile, diffResolver, t]);

  const handleRejectDiff = useCallback(() => {
    setPendingDiff(null);
    clearPendingEdits();

    if (diffResolver) {
      diffResolver(false);
    }
  }, [setPendingDiff, clearPendingEdits, diffResolver]);

  // 按轮次分组计算数据（只计算数据，不创建 JSX）
  const rounds = useMemo(() => {
    const result: Array<{
      userIdx: number;
      userContent: string;
      userAttachments: MessageAttachment[];
      userImages: ImageContent[];
      diagramPaths: string[];
      parts: TimelinePart[];
      roundKey: string;
      hasAIContent: boolean;
    }> = [];
    let pendingDiffInserted = false;

    // 找到所有用户消息的索引
    const userMessageIndices: number[] = [];
    messages.forEach((msg, idx) => {
      if (msg.role === "user" && !shouldSkipUserMessage(getTextFromContent(msg.content))) {
        userMessageIndices.push(idx);
      }
    });

    userMessageIndices.forEach((userIdx, roundIndex) => {
      const userMsg = messages[userIdx];
      const normalizedUserMessage = getUserMessageDisplay(userMsg.content, userMsg.attachments);
      const userImages = getImagesFromContent(userMsg.content);
      const displayContent = cleanUserMessage(normalizedUserMessage.text);

      if (!displayContent && normalizedUserMessage.attachments.length === 0 && userImages.length === 0) return;

      const nextUserIdx = userMessageIndices[roundIndex + 1] ?? messages.length;
      const parts: TimelinePart[] = [];
      const lastToolCall = { current: null as ToolCallInfo | null };
      let lastEditNoteIndex = -1;

      for (let msgIdx = userIdx + 1; msgIdx < nextUserIdx; msgIdx++) {
        const msg = messages[msgIdx];
        const content = getTextFromContent(msg.content);

        if (msg.role === "assistant") {
          appendPartsFromContent(content, parts, lastToolCall, true);
          continue;
        }

        if (msg.role === "tool") {
          const parsed = parseToolMessage(content);
          if (parsed) {
            if (!parsed.isStart && lastToolCall.current && lastToolCall.current.name === parsed.tool.name && !lastToolCall.current.result) {
              lastToolCall.current.result = parsed.tool.result;
              lastToolCall.current.success = parsed.tool.success;
            } else {
              parts.push({ type: "tool", tool: parsed.tool });
              if (parsed.isStart) {
                lastToolCall.current = parsed.tool;
              }
            }
          }
          continue;
        }

        if (msg.role === "user" && shouldSkipUserMessage(content)) {
          appendPartsFromContent(content, parts, lastToolCall, false);
        }
      }

      if (pendingDiff && !pendingDiffInserted) {
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (part.type === "tool" && part.tool.name === "edit") {
            lastEditNoteIndex = i;
          }
        }

        if (lastEditNoteIndex >= 0) {
          parts.splice(lastEditNoteIndex + 1, 0, { type: "diff", diff: pendingDiff });
          pendingDiffInserted = true;
        } else if (roundIndex === userMessageIndices.length - 1) {
          parts.push({ type: "diff", diff: pendingDiff });
          pendingDiffInserted = true;
        }
      }

      // 使用用户消息索引作为稳定且唯一的 key
      const roundKey = `round-${userIdx}`;

      // 判断是否有 AI 回复内容
      const hasAIContent = parts.length > 0;

      result.push({
        userIdx,
        userContent: displayContent,
        userAttachments: normalizedUserMessage.attachments,
        userImages,
        diagramPaths: getDiagramAttachmentFilePaths(normalizedUserMessage.attachments),
        parts,
        roundKey,
        hasAIContent,
      });
    });

    return result;
  }, [messages, pendingDiff]);

  return (
    <div className={className}>
      {rounds.map((round) => (
        <div key={round.roundKey}>
          {/* 用户消息 */}
          <div className="flex justify-end mb-4">
            <div className="max-w-[80%] bg-muted text-foreground rounded-2xl rounded-tr-sm px-4 py-2.5">
              <UserMessageBubbleContent
                text={round.userContent}
                attachments={round.userAttachments}
                images={round.userImages}
              />
            </div>
          </div>

          {/* AI 回复 - 只有在有内容时才显示 */}
          {round.hasAIContent && (
            <div className="flex gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center shrink-0">
                <Bot size={16} className="text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                {round.diagramPaths.length > 0 && (
                  <AssistantDiagramPanels filePaths={round.diagramPaths} />
                )}
                {(() => {
                  let lastTextIndex = -1;
                  for (let i = 0; i < round.parts.length; i++) {
                    if (round.parts[i].type === "text") {
                      lastTextIndex = i;
                    }
                  }

                  return round.parts.map((part, partIndex) => {
                  const key = `${round.roundKey}-part-${partIndex}`;
                  if (part.type === "thinking") {
                    return (
                      <ThinkingCollapsible
                        key={key}
                        thinking={part.content}
                        t={t}
                        status="done"
                      />
                    );
                  }
                  if (part.type === "tool") {
                    return <ToolCallCollapsible key={key} tool={part.tool} t={t} />;
                  }
                  if (part.type === "diff") {
                    return (
                      <div
                        key={key}
                        className="border border-border rounded-lg overflow-hidden bg-background/70"
                      >
                        <DiffView
                          fileName={part.diff.fileName}
                          original={part.diff.original}
                          modified={part.diff.modified}
                          description={part.diff.description}
                          onAccept={handleAcceptDiff}
                          onReject={handleRejectDiff}
                        />
                      </div>
                    );
                  }
                  if (part.type === "text") {
                    const isFinalText = partIndex === lastTextIndex;
                    return (
                      <div
                        key={key}
                        className={
                          isFinalText
                            ? "prose dark:prose-invert max-w-none leading-relaxed text-base font-medium"
                            : "prose prose-sm dark:prose-invert max-w-none leading-relaxed"
                        }
                        dangerouslySetInnerHTML={{
                          __html: parseMarkdown(formatMarkdownContent(part.content)),
                        }}
                      />
                    );
                  }
                  return null;
                });
                })()}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* 超时提示 */}
      {isRunning && isLongRunning && onRetryTimeout && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-600 dark:text-amber-400 text-sm mt-2"
        >
          <AlertTriangle size={16} className="shrink-0" />
          <span>{t.agentMessage.timeoutWarning}</span>
          <button
            onClick={onRetryTimeout}
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 rounded-md transition-colors font-medium"
          >
            <RefreshCw size={14} />
            <span>{t.agentMessage.interruptRetry}</span>
          </button>
        </motion.div>
      )}
    </div>
  );
});

/**
 * 复制按钮组件
 */
export function CopyButton({ text }: { text: string }) {
  const { t } = useLocaleStore();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      title={t.agentMessage.copy}
    >
      {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
    </button>
  );
}

export default AgentMessageRenderer;
