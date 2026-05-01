/**
 * Slash Command 扩展
 * 输入 / 时弹出命令菜单
 */

import { EditorView, ViewPlugin, ViewUpdate, WidgetType, Decoration, DecorationSet } from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";
import type { FilePartInput, Part } from "@opencode-ai/sdk/client";
import type { Translations } from "@/i18n";
import { getCurrentTranslations } from "@/stores/useLocaleStore";
import { getAIConfig } from "@/services/ai/ai";
import { waitForAIConfigSync } from "@/services/ai/config-sync";
import { getOpencodeClient, setDefaultDirectory } from "@/services/opencode/client";
import { resolveOpencodePromptModel } from "@/stores/useOpencodeAgent";
import { useAIStore } from "@/stores/useAIStore";
import { useFileStore } from "@/stores/useFileStore";
import { reportOperationError } from "@/lib/reportError";
import {
  isAtBlockStart,
  transformBlockType,
  getBlockAtPos,
} from "./blockOperations";

// ============ 类型定义 ============

export interface SlashCommand {
  id: string;
  label: string;
  icon: string;
  description: string;
  category: "ai" | "heading" | "list" | "block" | "insert";
  action: (view: EditorView, from: number, to: number) => void;
}

export type SlashAIAction =
  | "chat-insert"
  | "continue"
  | "rewrite-block"
  | "expand-block"
  | "summarize-block";

export function getSlashAIActionForCommandId(commandId: string): SlashAIAction | null {
  switch (commandId) {
    case "ai-chat":
      return "chat-insert";
    case "ai-continue":
      return "continue";
    case "ai-rewrite-block":
      return "rewrite-block";
    case "ai-expand-block":
      return "expand-block";
    case "ai-summarize-block":
      return "summarize-block";
    default:
      return null;
  }
}

function extractTextFromParts(parts: Part[]): string {
  const out: string[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      out.push(part.text);
    }
  }
  return out.join("").trim();
}

function stripMarkdownFence(text: string): string {
  const fenced = text.match(/^```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)\n```$/);
  if (fenced) return fenced[1].trim();
  return text;
}

function clampPos(view: EditorView, pos: number): number {
  return Math.max(0, Math.min(pos, view.state.doc.length));
}

function buildInlineContext(view: EditorView, insertPos: number): string {
  const doc = view.state.doc.toString();
  const safePos = clampPos(view, insertPos);
  const beforeLimit = 8000;
  const afterLimit = 4000;
  const beforeStart = Math.max(0, safePos - beforeLimit);
  const afterEnd = Math.min(doc.length, safePos + afterLimit);
  const before = doc.slice(beforeStart, safePos);
  const after = doc.slice(safePos, afterEnd);
  return [
    beforeStart > 0 ? "[Earlier note content omitted]" : "",
    "[Context before insertion]",
    before || "(empty)",
    "",
    "[INSERT_HERE]",
    "",
    "[Context after insertion]",
    after || "(empty)",
    afterEnd < doc.length ? "[Later note content omitted]" : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function resolveTargetRange(view: EditorView, pivotPos: number): { from: number; to: number } {
  const hasText = (from: number, to: number) =>
    view.state.doc.sliceString(from, to).trim().length > 0;
  const sel = view.state.selection.main;
  if (sel.from !== sel.to) {
    return { from: sel.from, to: sel.to };
  }
  const safePos = clampPos(view, pivotPos);
  const block = getBlockAtPos(view.state, safePos);
  if (block && block.to > block.from && hasText(block.from, block.to)) {
    return { from: block.from, to: block.to };
  }
  const line = view.state.doc.lineAt(safePos);
  if (line.from > 0) {
    const prevPos = line.from - 1;
    const prevBlock = getBlockAtPos(view.state, prevPos);
    if (prevBlock && prevBlock.to > prevBlock.from && hasText(prevBlock.from, prevBlock.to)) {
      return { from: prevBlock.from, to: prevBlock.to };
    }
    const prevLine = view.state.doc.lineAt(prevPos);
    if (hasText(prevLine.from, prevLine.to)) {
      return { from: prevLine.from, to: prevLine.to };
    }
  }
  return { from: line.from, to: line.to };
}

async function generateInlineAIMarkdown(
  view: EditorView,
  request: string,
  t: Translations,
  insertPos: number,
  onUpdate?: (text: string) => void,
): Promise<string | null> {
  const genericErrorMessage =
    (t.ai as { errors?: { sendGeneric?: string } })?.errors?.sendGeneric ||
    t.common.unknownError;
  const fileState = useFileStore.getState();
  const vaultPath = fileState.vaultPath || undefined;
  const currentFilePath = fileState.currentFile || undefined;
  const trimmedRequest = request.trim();
  if (!trimmedRequest) return null;

  const prompt = [
    "You are an inline Markdown writing assistant.",
    "Generate only the new Markdown text that should be inserted at [INSERT_HERE].",
    "Use the surrounding note as context only.",
    "Do not repeat, summarize, rewrite, or return the whole note unless the user explicitly asks for that.",
    "Return only the Markdown text to insert. Do not include explanations or code fences.",
    currentFilePath ? `Current note path: ${currentFilePath}` : "",
    "",
    "[User request]",
    trimmedRequest,
    "",
    buildInlineContext(view, insertPos),
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await waitForAIConfigSync();
    const cfg = getAIConfig();
    const selection = useAIStore.getState().runtimeModelSelection ?? {
      provider: cfg.provider,
      model: cfg.model,
      customModelId: cfg.customModelId,
      baseUrl: cfg.baseUrl,
    };
    const promptModel = resolveOpencodePromptModel(selection);
    const query = vaultPath ? { directory: vaultPath } : undefined;
    setDefaultDirectory(vaultPath ?? null);
    const client = await getOpencodeClient();

    const createRes = await client.session.create({
      body: { title: "Inline Insert" },
      query,
      throwOnError: true,
    });
    const sessionId = (createRes.data as { id?: string } | undefined)?.id;
    if (!sessionId) {
      throw new Error("Failed to create inline AI session");
    }

    try {
      const parts: Array<FilePartInput | { type: "text"; text: string }> = [
        { type: "text", text: prompt },
      ];
      const streamController = new AbortController();
      const stream = await client.event.subscribe({
        signal: streamController.signal,
      });

      let promptAccepted = false;
      let assistantMessageId: string | null = null;
      let streamingText = "";
      let sawDelta = false;
      const startedAt = Date.now();
      const timeoutMs = 120_000;

      const promptReq = client.session
        .promptAsync({
          path: { id: sessionId },
          body: {
            agent: "build",
            ...(promptModel ? { model: promptModel } : {}),
            parts,
          } as never,
          query,
          throwOnError: true,
        })
        .then(() => {
          promptAccepted = true;
        });

      for await (const evt of stream.stream) {
        const event = evt as unknown as {
          type: string;
          properties?: Record<string, unknown>;
        };
        const props = event.properties ?? {};
        const eventSessionId = props.sessionID as string | undefined;
        if (eventSessionId && eventSessionId !== sessionId) {
          continue;
        }

        if (event.type === "message.updated") {
          const info = props.info as
            | { id?: string; role?: string; sessionID?: string }
            | undefined;
          if (info?.sessionID === sessionId && info.role === "assistant" && info.id) {
            assistantMessageId = info.id;
          }
          continue;
        }

        if (event.type === "message.part.delta") {
          const messageId = props.messageID as string | undefined;
          const field = props.field as string | undefined;
          const delta = props.delta as string | undefined;
          if (!messageId || field !== "text" || !delta) {
            continue;
          }
          if (!assistantMessageId) {
            assistantMessageId = messageId;
          }
          if (assistantMessageId !== messageId) {
            continue;
          }
          sawDelta = true;
          streamingText += delta;
          onUpdate?.(streamingText);
          continue;
        }

        if (event.type === "message.part.updated" && !sawDelta) {
          const part = props.part as
            | { messageID?: string; type?: string; text?: string }
            | undefined;
          if (!part || part.type !== "text" || !part.messageID) {
            continue;
          }
          if (!assistantMessageId) {
            assistantMessageId = part.messageID;
          }
          if (assistantMessageId !== part.messageID) {
            continue;
          }
          streamingText = part.text ?? "";
          onUpdate?.(streamingText);
          continue;
        }

        const isIdle =
          (event.type === "session.idle" && eventSessionId === sessionId) ||
          (event.type === "session.status" &&
            eventSessionId === sessionId &&
            (props.status as { type?: string } | undefined)?.type === "idle");
        if (isIdle && promptAccepted) {
          break;
        }

        if (Date.now() - startedAt > timeoutMs) {
          throw new Error("Inline AI streaming timeout");
        }
      }

      streamController.abort();
      await promptReq;

      let rawText = streamingText;
      if (assistantMessageId) {
        try {
          const msg = await client.session.message({
            path: { id: sessionId, messageID: assistantMessageId },
            query,
            throwOnError: true,
          });
          const msgParts =
            ((msg.data as { parts?: Part[] } | undefined)?.parts ?? []) as Part[];
          const fullText = extractTextFromParts(msgParts);
          if (fullText.trim()) {
            rawText = fullText;
          }
        } catch {
          // Keep streamed text fallback.
        }
      }

      const insertText = stripMarkdownFence(rawText).trim();
      if (!insertText) {
        throw new Error("AI returned empty content");
      }
      onUpdate?.(insertText);
      return insertText;
    } finally {
      await client.session.delete({
        path: { id: sessionId },
        query,
      }).catch(() => undefined);
    }
  } catch (error) {
    reportOperationError({
      source: "slashCommand.runInlineAIMarkdownInsert",
      action: "Generate inline markdown with slash command",
      error,
      userMessage: genericErrorMessage,
      level: "warning",
      context: {
        currentFilePath,
      },
    });
    window.alert(genericErrorMessage);
    return null;
  }
}

async function runInlineAIMarkdownInsert(
  view: EditorView,
  insertPos: number,
  request: string,
  t: Translations,
): Promise<void> {
  const safePos = clampPos(view, insertPos);
  let inserted = "";
  const applyText = (next: string) => {
    view.dispatch({
      changes: {
        from: safePos,
        to: safePos + inserted.length,
        insert: next,
      },
      selection: { anchor: safePos + next.length },
    });
    inserted = next;
  };
  const insertText = await generateInlineAIMarkdown(view, request, t, safePos, applyText);
  if (!insertText) return;
  if (inserted !== insertText) {
    applyText(insertText);
  }
  view.focus();
}

export async function runSlashAIAction(
  view: EditorView,
  from: number,
  to: number,
  action: SlashAIAction,
  instruction?: string,
): Promise<void> {
  const t = getCurrentTranslations();
  const labels = t.editor?.slashMenu?.commands;
  const safeFrom = clampPos(view, from);
  const safeTo = clampPos(view, to);

  view.dispatch({
    changes: { from: safeFrom, to: safeTo, insert: "" },
    selection: { anchor: safeFrom },
  });

  const notePath = useFileStore.getState().currentFile || undefined;
  const noteName =
    notePath?.split(/[/\\]/).pop()?.replace(/\.md$/i, "") || t.common.untitled;
  const targetRange = resolveTargetRange(view, safeFrom);
  const targetText = view.state.doc.sliceString(targetRange.from, targetRange.to).trim();

  if (action === "chat-insert") {
    const req = instruction?.trim();
    if (!req) return;
    await runInlineAIMarkdownInsert(view, safeFrom, req, t);
    return;
  }

  if (action === "continue") {
    const continuePromptTemplate =
      labels?.aiContinuePrompt ||
      "Continue writing naturally from this point in the current note.";
    const continuePrompt = [
      continuePromptTemplate.replace("{name}", noteName),
      instruction?.trim() ? "" : null,
      instruction?.trim() ? "[User guidance]" : null,
      instruction?.trim() || null,
    ].filter(Boolean).join("\n");
    await runInlineAIMarkdownInsert(view, safeFrom, continuePrompt, t);
    return;
  }

  if (!targetText) {
    window.alert(t.common.empty);
    return;
  }

  if (action === "rewrite-block") {
    const rewritePromptTemplate =
      labels?.aiRewritePrompt ||
      "Rewrite the current block for clarity while preserving meaning.";
    const rewritePrompt = [
      rewritePromptTemplate.replace("{name}", noteName),
      instruction?.trim() ? "" : null,
      instruction?.trim() ? "[User guidance]" : null,
      instruction?.trim() || null,
      "",
      "[Block to rewrite]",
      targetText,
    ].filter((part): part is string => part !== null).join("\n");
    const rewritten = await generateInlineAIMarkdown(view, rewritePrompt, t, targetRange.from);
    if (!rewritten) return;
    view.dispatch({
      changes: { from: targetRange.from, to: targetRange.to, insert: rewritten },
      selection: { anchor: targetRange.from + rewritten.length },
    });
    view.focus();
    return;
  }

  if (action === "expand-block") {
    const expandPromptTemplate =
      labels?.aiExpandPrompt ||
      "Expand the current block with more detail while keeping the style consistent.";
    const expandPrompt = [
      expandPromptTemplate.replace("{name}", noteName),
      instruction?.trim() ? "" : null,
      instruction?.trim() ? "[User guidance]" : null,
      instruction?.trim() || null,
      "",
      "[Block to expand]",
      targetText,
    ].filter((part): part is string => part !== null).join("\n");
    const expanded = await generateInlineAIMarkdown(view, expandPrompt, t, targetRange.from);
    if (!expanded) return;
    view.dispatch({
      changes: { from: targetRange.from, to: targetRange.to, insert: expanded },
      selection: { anchor: targetRange.from + expanded.length },
    });
    view.focus();
    return;
  }

  const summarizePromptTemplate =
    labels?.aiSummarizePrompt ||
    "Summarize the current block into concise bullet points.";
  const summaryInstruction = [
    summarizePromptTemplate.replace("{name}", noteName),
    instruction?.trim() ? "" : null,
    instruction?.trim() ? "[User guidance]" : null,
    instruction?.trim() || null,
    "",
    "[Block to summarize]",
    targetText,
  ].filter((part): part is string => part !== null).join("\n");
  const summary = await generateInlineAIMarkdown(view, summaryInstruction, t, targetRange.to);
  if (!summary) return;
  const prefix = targetRange.to > 0 ? "\n\n" : "";
  const inserted = `${prefix}${summary}`;
  view.dispatch({
    changes: { from: targetRange.to, to: targetRange.to, insert: inserted },
    selection: { anchor: targetRange.to + inserted.length },
  });
  view.focus();
}

// ============ 命令注册 ============

export function getDefaultCommands(translations?: Translations): SlashCommand[] {
  const t = translations ?? getCurrentTranslations();
  const labels = t.editor?.slashMenu?.commands;
  const tableTemplate = labels?.tableTemplate || "| Col 1 | Col 2 | Col 3 |\n| --- | --- | --- |\n|  |  |  |";

  const transformOrInsert = (
    targetType: string,
    fallbackInsert: string,
    fallbackOffset: number
  ) => {
    return (view: EditorView, from: number, to: number) => {
      if (isAtBlockStart(view.state, from)) {
        const block = getBlockAtPos(view.state, from);
        if (block) {
          transformBlockType(view, block, targetType, from, to);
          return;
        }
      }
      view.dispatch({
        changes: { from, to, insert: fallbackInsert },
        selection: { anchor: from + fallbackOffset },
      });
    };
  };

  return [
  // AI 命令
  {
    id: "ai-chat",
    label: labels?.aiChat || "AI Chat",
    icon: "✨",
    description: labels?.aiChatDesc || "Open AI assistant chat",
    category: "ai",
    action: () => {
      // SlashMenu handles this command with an inline input field.
    },
  },
  {
    id: "ai-continue",
    label: labels?.aiContinue || "AI Continue",
    icon: "🪄",
    description: labels?.aiContinueDesc || "Continue writing with AI",
    category: "ai",
    action: () => {
      // SlashMenu handles this command with an inline input field.
    },
  },
  {
    id: "ai-rewrite-block",
    label: labels?.aiRewrite || "AI Rewrite Block",
    icon: "✍️",
    description: labels?.aiRewriteDesc || "Rewrite current block in place",
    category: "ai",
    action: () => {
      // SlashMenu handles this command with an inline input field.
    },
  },
  {
    id: "ai-expand-block",
    label: labels?.aiExpand || "AI Expand Block",
    icon: "➕",
    description: labels?.aiExpandDesc || "Expand current block",
    category: "ai",
    action: () => {
      // SlashMenu handles this command with an inline input field.
    },
  },
  {
    id: "ai-summarize-block",
    label: labels?.aiSummarize || "AI Summarize Block",
    icon: "📝",
    description: labels?.aiSummarizeDesc || "Summarize current block",
    category: "ai",
    action: () => {
      // SlashMenu handles this command with an inline input field.
    },
  },
  
  // 标题
  {
    id: "h1",
    label: labels?.heading1 || "Heading 1",
    icon: "H1",
    description: labels?.heading1Desc || "Large heading",
    category: "heading",
    action: transformOrInsert("ATXHeading1", "# ", 2),
  },
  {
    id: "h2",
    label: labels?.heading2 || "Heading 2",
    icon: "H2",
    description: labels?.heading2Desc || "Section heading",
    category: "heading",
    action: transformOrInsert("ATXHeading2", "## ", 3),
  },
  {
    id: "h3",
    label: labels?.heading3 || "Heading 3",
    icon: "H3",
    description: labels?.heading3Desc || "Subsection heading",
    category: "heading",
    action: transformOrInsert("ATXHeading3", "### ", 4),
  },
  
  // 列表
  {
    id: "bullet-list",
    label: labels?.bulletList || "Bullet List",
    icon: "•",
    description: labels?.bulletListDesc || "Bulleted list",
    category: "list",
    action: transformOrInsert("BulletList", "- ", 2),
  },
  {
    id: "numbered-list",
    label: labels?.numberedList || "Numbered List",
    icon: "1.",
    description: labels?.numberedListDesc || "Numbered list",
    category: "list",
    action: transformOrInsert("OrderedList", "1. ", 3),
  },
  {
    id: "task-list",
    label: labels?.taskList || "Task List",
    icon: "☐",
    description: labels?.taskListDesc || "Todo list",
    category: "list",
    action: (view, from, to) => {
      view.dispatch({
        changes: { from, to, insert: "- [ ] " },
        selection: { anchor: from + 6 },
      });
    },
  },
  
  // 块
  {
    id: "quote",
    label: labels?.quote || "Quote",
    icon: "❝",
    description: labels?.quoteDesc || "Blockquote",
    category: "block",
    action: transformOrInsert("Blockquote", "> ", 2),
  },
  {
    id: "code-block",
    label: labels?.codeBlock || "Code Block",
    icon: "</>",
    description: labels?.codeBlockDesc || "Code snippet",
    category: "block",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "```\n\n```" },
        selection: { anchor: from + 4 }
      });
    },
  },
  {
    id: "callout",
    label: labels?.callout || "Callout",
    icon: "💡",
    description: labels?.calloutDesc || "Callout block",
    category: "block",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "> [!note]\n> " },
        selection: { anchor: from + 12 }
      });
    },
  },
  {
    id: "math-block",
    label: labels?.mathBlock || "Math Block",
    icon: "∑",
    description: labels?.mathBlockDesc || "LaTeX block",
    category: "block",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "$$\n\n$$" },
        selection: { anchor: from + 3 }
      });
    },
  },
  
  // 插入
  {
    id: "table",
    label: labels?.table || "Table",
    icon: "▦",
    description: labels?.tableDesc || "Markdown table",
    category: "insert",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: tableTemplate },
        selection: { anchor: from + 2 }
      });
    },
  },
  {
    id: "divider",
    label: labels?.divider || "Divider",
    icon: "—",
    description: labels?.dividerDesc || "Horizontal divider",
    category: "insert",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "---\n" },
        selection: { anchor: from + 4 }
      });
    },
  },
  {
    id: "image",
    label: labels?.image || "Image",
    icon: "🖼",
    description: labels?.imageDesc || "Insert image",
    category: "insert",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "![]()" },
        selection: { anchor: from + 4 }
      });
    },
  },
  {
    id: "link",
    label: labels?.link || "Link",
    icon: "🔗",
    description: labels?.linkDesc || "Insert link",
    category: "insert",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "[]()" },
        selection: { anchor: from + 1 }
      });
    },
  },
];
}

// ============ State Effects ============

export const showSlashMenu = StateEffect.define<{ pos: number; filter: string }>();
export const hideSlashMenu = StateEffect.define<void>();
export const updateSlashFilter = StateEffect.define<string>();

interface SlashMenuState {
  active: boolean;
  pos: number;      // "/" 的位置
  filter: string;   // "/" 后面的过滤文本
}

export const slashMenuField = StateField.define<SlashMenuState>({
  create: () => ({ active: false, pos: 0, filter: "" }),
  update(state, tr) {
    for (const effect of tr.effects) {
      if (effect.is(showSlashMenu)) {
        return { active: true, pos: effect.value.pos, filter: effect.value.filter };
      }
      if (effect.is(hideSlashMenu)) {
        return { active: false, pos: 0, filter: "" };
      }
      if (effect.is(updateSlashFilter)) {
        return { ...state, filter: effect.value };
      }
    }
    
    // 文档变化时，检查是否应该关闭菜单
    if (state.active && tr.docChanged) {
      const head = tr.state.selection.main.head;
      // 如果光标不再在 "/" 之后，关闭菜单
      if (head <= state.pos) {
        return { active: false, pos: 0, filter: "" };
      }
      // 更新 filter
      const text = tr.state.doc.sliceString(state.pos, head);
      if (!text.startsWith("/")) {
        return { active: false, pos: 0, filter: "" };
      }
      return { ...state, filter: text.slice(1) };
    }
    
    return state;
  },
});

// ============ 输入处理 ============

export const slashCommandPlugin = ViewPlugin.fromClass(
  class {
    constructor(readonly view: EditorView) {}
    
    update(update: ViewUpdate) {
      const nextMenuState = update.state.field(slashMenuField, false);
      const prevMenuState = update.startState.field(slashMenuField, false);
      if (
        nextMenuState?.active !== prevMenuState?.active ||
        nextMenuState?.filter !== prevMenuState?.filter ||
        nextMenuState?.pos !== prevMenuState?.pos
      ) {
        window.dispatchEvent(new CustomEvent("slash-menu-state", {
          detail: {
            active: nextMenuState?.active ?? false,
            filter: nextMenuState?.filter ?? "",
            pos: nextMenuState?.pos ?? 0,
          }
        }));
      }

      // 检测是否输入了 "/"
      if (update.docChanged && !update.state.field(slashMenuField).active) {
        for (const tr of update.transactions) {
          tr.changes.iterChanges((_fromA, _toA, fromB, toB, inserted) => {
            const text = inserted.toString();
            if (text === "/" && fromB === toB - 1) {
              // 检查是否在行首或空格后
              const line = update.state.doc.lineAt(fromB);
              const before = update.state.doc.sliceString(line.from, fromB);
              if (before.trim() === "" || before.endsWith(" ")) {
                // 显示菜单
                setTimeout(() => {
                  this.view.dispatch({
                    effects: showSlashMenu.of({ pos: fromB, filter: "" })
                  });
                  // 通知 React 组件
                  const coords = this.view.coordsAtPos(fromB);
                  if (coords) {
                    window.dispatchEvent(new CustomEvent("slash-menu-show", {
                      detail: { x: coords.left, y: coords.bottom, pos: fromB }
                    }));
                  }
                }, 0);
              }
            }
          });
        }
      }
    }
  }
);

// ============ 占位符 ============

// Renders the empty-document placeholder. Strings can embed `{kbd}` to mark
// where a small kbd-styled chip should be inserted (the chip itself always
// renders the literal "/"). This converts a plain italic line into a real
// affordance: the slash key reads as a key rather than punctuation, which
// is the only signal new users get that the slash menu exists.
class PlaceholderWidget extends WidgetType {
  constructor(readonly text: string) { super(); }

  eq(other: PlaceholderWidget) {
    return other.text === this.text;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-placeholder";
    span.style.cssText = `
      color: hsl(var(--muted-foreground) / 0.55);
      pointer-events: none;
      position: absolute;
      left: 28px;
      display: inline-flex;
      align-items: center;
      gap: 0.35em;
    `;

    const segments = this.text.split("{kbd}");
    if (segments.length === 1) {
      span.textContent = this.text;
      span.style.fontStyle = "italic";
      return span;
    }

    segments.forEach((segment, i) => {
      if (segment) {
        const text = document.createElement("span");
        text.textContent = segment.replace(/^\s+|\s+$/g, " ").trim();
        text.style.cssText = "font-style: italic;";
        span.appendChild(text);
      }
      if (i < segments.length - 1) {
        const kbd = document.createElement("kbd");
        kbd.textContent = "/";
        kbd.style.cssText = `
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 0.85em;
          font-style: normal;
          padding: 0 0.4em;
          line-height: 1.4;
          border-radius: 4px;
          background: hsl(var(--muted) / 0.8);
          color: hsl(var(--foreground) / 0.7);
          border: 1px solid hsl(var(--border) / 0.6);
          box-shadow: inset 0 -1px 0 hsl(var(--border) / 0.4);
        `;
        span.appendChild(kbd);
      }
    });

    return span;
  }

  ignoreEvent() { return true; }
}

export function placeholderExtension(text: string) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      
      update(update: ViewUpdate) {
        if (update.docChanged || update.focusChanged) {
          this.decorations = this.build(update.view);
        }
      }
      
      build(view: EditorView): DecorationSet {
        const doc = view.state.doc;
        // 只在文档为空时显示
        if (doc.length === 0 || (doc.length === 1 && doc.toString() === "")) {
          return Decoration.set([
            Decoration.widget({
              widget: new PlaceholderWidget(text),
              side: 1,
            }).range(0)
          ]);
        }
        return Decoration.none;
      }
    },
    { decorations: v => v.decorations }
  );
}

// ============ 导出 ============

export const slashCommandExtensions = [
  slashMenuField,
  slashCommandPlugin,
];
