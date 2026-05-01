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
  icon:
    | "aiChat"
    | "aiContinue"
    | "aiRewrite"
    | "aiExpand"
    | "aiSummarize"
    | "heading1"
    | "heading2"
    | "heading3"
    | "bulletList"
    | "orderedList"
    | "taskList"
    | "blockquote"
    | "codeBlock"
    | "callout"
    | "mathBlock"
    | "table"
    | "divider"
    | "image"
    | "link";
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

export type SlashAIStageId =
  | "understanding"
  | "reading-context"
  | "preparing-context"
  | "generating"
  | "ready";

const slashAIStageOrder: SlashAIStageId[] = [
  "understanding",
  "reading-context",
  "preparing-context",
  "generating",
  "ready",
];

export interface SlashAIProgress {
  stage: SlashAIStageId;
  status: "active" | "done" | "error";
}

export interface SlashAIGenerationCallbacks {
  onProgress?: (progress: SlashAIProgress) => void;
  signal?: AbortSignal;
}

export interface SlashAIResult {
  text: string;
  from: number;
  to: number;
}

export interface SlashAIInlinePreviewLabels {
  previewTitle: string;
  generating: string;
  insert: string;
  cancel: string;
  regenerate: string;
  stages: Record<SlashAIStageId, string>;
}

export type SlashAIInlinePreviewStageStatus = "pending" | SlashAIProgress["status"];

export interface SlashAIInlinePreview {
  id: string;
  status: "running" | "preview";
  anchor: number;
  result?: SlashAIResult;
  commandLabel: string;
  labels: SlashAIInlinePreviewLabels;
  stageStatuses: Record<SlashAIStageId, SlashAIInlinePreviewStageStatus>;
}

export class SlashAIAbortError extends Error {
  constructor() {
    super("Inline AI generation aborted");
    this.name = "SlashAIAbortError";
  }
}

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

function emitSlashAIProgress(
  callbacks: SlashAIGenerationCallbacks | undefined,
  progress: SlashAIProgress,
) {
  callbacks?.onProgress?.(progress);
}

function throwIfSlashAIAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new SlashAIAbortError();
  }
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
  callbacks?: SlashAIGenerationCallbacks,
): Promise<string | null> {
  const genericErrorMessage =
    (t.ai as { errors?: { sendGeneric?: string } })?.errors?.sendGeneric ||
    t.common.unknownError;
  const fileState = useFileStore.getState();
  const vaultPath = fileState.vaultPath || undefined;
  const currentFilePath = fileState.currentFile || undefined;
  const trimmedRequest = request.trim();
  if (!trimmedRequest) return null;
  throwIfSlashAIAborted(callbacks?.signal);
  emitSlashAIProgress(callbacks, { stage: "understanding", status: "active" });

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
    emitSlashAIProgress(callbacks, { stage: "understanding", status: "done" });
    emitSlashAIProgress(callbacks, { stage: "reading-context", status: "active" });
    await waitForAIConfigSync();
    throwIfSlashAIAborted(callbacks?.signal);
    emitSlashAIProgress(callbacks, { stage: "reading-context", status: "done" });
    emitSlashAIProgress(callbacks, { stage: "preparing-context", status: "active" });
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
    throwIfSlashAIAborted(callbacks?.signal);

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
      emitSlashAIProgress(callbacks, { stage: "preparing-context", status: "done" });
      emitSlashAIProgress(callbacks, { stage: "generating", status: "active" });
      const parts: Array<FilePartInput | { type: "text"; text: string }> = [
        { type: "text", text: prompt },
      ];
      const streamController = new AbortController();
      const abortStream = () => streamController.abort();
      callbacks?.signal?.addEventListener("abort", abortStream, { once: true });
      const stream = await client.event.subscribe({
        signal: streamController.signal,
      });

      let promptAccepted = false;
      let assistantMessageId: string | null = null;
      let latestTextPart = "";
      let sawDelta = false;
      const messageRoles = new Map<string, string>();
      const pendingTextDeltas = new Map<string, string>();
      const startedAt = Date.now();
      const timeoutMs = 120_000;

      const acceptAssistantMessageId = (messageId: string) => {
        if (!assistantMessageId) {
          assistantMessageId = messageId;
        }
        return assistantMessageId === messageId;
      };

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

      try {
        for await (const evt of stream.stream) {
          throwIfSlashAIAborted(callbacks?.signal);
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
            if (info?.sessionID === sessionId && info.id && info.role) {
              messageRoles.set(info.id, info.role);
              if (info.role === "assistant") {
                acceptAssistantMessageId(info.id);
                pendingTextDeltas.delete(info.id);
              } else {
                pendingTextDeltas.delete(info.id);
              }
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
            const role = messageRoles.get(messageId);
            if (!role) {
              pendingTextDeltas.set(
                messageId,
                `${pendingTextDeltas.get(messageId) ?? ""}${delta}`,
              );
              continue;
            }
            if (role !== "assistant") {
              continue;
            }
            if (acceptAssistantMessageId(messageId)) {
              sawDelta = true;
            }
            continue;
          }

          if (event.type === "message.part.updated" && !sawDelta) {
            const part = props.part as
              | { messageID?: string; type?: string; text?: string }
              | undefined;
            if (!part || part.type !== "text" || !part.messageID) {
              continue;
            }
            const role = messageRoles.get(part.messageID);
            if (role !== "assistant") {
              continue;
            }
            if (!assistantMessageId) {
              assistantMessageId = part.messageID;
            }
            if (assistantMessageId !== part.messageID) {
              continue;
            }
            latestTextPart = part.text ?? "";
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
      } finally {
        callbacks?.signal?.removeEventListener("abort", abortStream);
      }

      streamController.abort();
      await promptReq;
      throwIfSlashAIAborted(callbacks?.signal);

      let rawText = latestTextPart;
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
      emitSlashAIProgress(callbacks, { stage: "generating", status: "done" });
      emitSlashAIProgress(callbacks, { stage: "ready", status: "done" });
      return insertText;
    } finally {
      await client.session.delete({
        path: { id: sessionId },
        query,
      }).catch(() => undefined);
    }
  } catch (error) {
    if (error instanceof SlashAIAbortError || callbacks?.signal?.aborted) {
      throw new SlashAIAbortError();
    }
    emitSlashAIProgress(callbacks, { stage: "generating", status: "error" });
    reportOperationError({
      source: "slashCommand.generateInlineAIMarkdown",
      action: "Generate inline markdown with slash command",
      error,
      userMessage: genericErrorMessage,
      level: "warning",
      context: {
        currentFilePath,
      },
    });
    throw new Error(genericErrorMessage);
  }
}

export function applySlashAIResult(view: EditorView, result: SlashAIResult): void {
  const from = clampPos(view, result.from);
  const to = clampPos(view, Math.max(result.from, result.to));
  view.dispatch({
    changes: { from, to, insert: result.text },
    selection: { anchor: from + result.text.length },
    effects: clearSlashAIInlinePreview.of(),
  });
  view.focus();
}

export async function runSlashAIAction(
  view: EditorView,
  from: number,
  to: number,
  action: SlashAIAction,
  instruction?: string,
  callbacks?: SlashAIGenerationCallbacks,
): Promise<SlashAIResult | null> {
  const t = getCurrentTranslations();
  const labels = t.editor?.slashMenu?.commands;
  const inlineAI = t.editor?.slashMenu?.inlineAI;
  const safeFrom = clampPos(view, from);
  const safeTo = clampPos(view, to);
  const originalSelection = view.state.selection.main;
  const originalSelectionRange =
    originalSelection.from !== originalSelection.to
      ? { from: originalSelection.from, to: originalSelection.to }
      : null;

  const removeSlashTransaction = view.state.update({
    changes: { from: safeFrom, to: safeTo, insert: "" },
    selection: { anchor: safeFrom },
  });
  const selectedRange = originalSelectionRange
    ? {
        from: removeSlashTransaction.changes.mapPos(originalSelectionRange.from),
        to: removeSlashTransaction.changes.mapPos(originalSelectionRange.to),
      }
    : null;
  view.dispatch(removeSlashTransaction);

  const notePath = useFileStore.getState().currentFile || undefined;
  const noteName =
    notePath?.split(/[/\\]/).pop()?.replace(/\.md$/i, "") || t.common.untitled;
  const targetRange =
    selectedRange &&
    selectedRange.from !== selectedRange.to &&
    view.state.doc.sliceString(selectedRange.from, selectedRange.to).trim()
      ? selectedRange
      : resolveTargetRange(view, safeFrom);
  const targetText = view.state.doc.sliceString(targetRange.from, targetRange.to).trim();

  if (action === "chat-insert") {
    const req = instruction?.trim();
    if (!req) return null;
    const text = await generateInlineAIMarkdown(view, req, t, safeFrom, callbacks);
    return text ? { text, from: safeFrom, to: safeFrom } : null;
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
    const text = await generateInlineAIMarkdown(
      view,
      continuePrompt,
      t,
      safeFrom,
      callbacks,
    );
    return text ? { text, from: safeFrom, to: safeFrom } : null;
  }

  if (!targetText) {
    throw new Error(inlineAI?.emptyTarget || t.common.empty);
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
    const text = await generateInlineAIMarkdown(
      view,
      rewritePrompt,
      t,
      targetRange.from,
      callbacks,
    );
    return text ? { text, from: targetRange.from, to: targetRange.to } : null;
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
    const text = await generateInlineAIMarkdown(
      view,
      expandPrompt,
      t,
      targetRange.from,
      callbacks,
    );
    return text ? { text, from: targetRange.from, to: targetRange.to } : null;
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
  const summary = await generateInlineAIMarkdown(
    view,
    summaryInstruction,
    t,
    targetRange.to,
    callbacks,
  );
  if (!summary) return null;
  const prefix = targetRange.to > 0 ? "\n\n" : "";
  const inserted = `${prefix}${summary}`;
  return { text: inserted, from: targetRange.to, to: targetRange.to };
}

// ============ 命令注册 ============

export function getDefaultCommands(translations?: Translations): SlashCommand[] {
  const t = translations ?? getCurrentTranslations();
  const labels = t.editor?.slashMenu?.commands;
  const tableTemplate = (labels?.tableTemplate || "| Col 1 | Col 2 | Col 3 |\n| --- | --- | --- |\n|  |  |  |")
    .replace(/\\n/g, "\n");

  const insertMarkdownBlock = (
    view: EditorView,
    from: number,
    to: number,
    template: string,
    cursorOffset: number,
  ) => {
    const state = view.state;
    const line = state.doc.lineAt(from);
    const toLine = state.doc.lineAt(to);
    const textBefore = state.doc.sliceString(line.from, from);
    const hasContentBefore = textBefore.trim().length > 0;
    const hasContentAfter = state.doc.sliceString(to, toLine.to).trim().length > 0;
    const changeFrom = hasContentBefore
      ? from - (textBefore.match(/\s*$/)?.[0].length ?? 0)
      : from;
    const prefix = hasContentBefore ? "\n\n" : "";
    const suffix = hasContentAfter ? "\n\n" : "";
    const insert = `${prefix}${template}${suffix}`;
    view.dispatch({
      changes: { from: changeFrom, to, insert },
      selection: { anchor: changeFrom + prefix.length + cursorOffset },
    });
  };

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
      insertMarkdownBlock(view, from, to, fallbackInsert, fallbackOffset);
    };
  };

  return [
  // AI 命令
  {
    id: "ai-chat",
    label: labels?.aiChat || "AI Chat",
    icon: "aiChat",
    description: labels?.aiChatDesc || "Open AI assistant chat",
    category: "ai",
    action: () => {
      // SlashMenu handles this command with an inline input field.
    },
  },
  {
    id: "ai-continue",
    label: labels?.aiContinue || "AI Continue",
    icon: "aiContinue",
    description: labels?.aiContinueDesc || "Continue writing with AI",
    category: "ai",
    action: () => {
      // SlashMenu handles this command with an inline input field.
    },
  },
  {
    id: "ai-rewrite-block",
    label: labels?.aiRewrite || "AI Rewrite Block",
    icon: "aiRewrite",
    description: labels?.aiRewriteDesc || "Rewrite current block in place",
    category: "ai",
    action: () => {
      // SlashMenu handles this command with an inline input field.
    },
  },
  {
    id: "ai-expand-block",
    label: labels?.aiExpand || "AI Expand Block",
    icon: "aiExpand",
    description: labels?.aiExpandDesc || "Expand current block",
    category: "ai",
    action: () => {
      // SlashMenu handles this command with an inline input field.
    },
  },
  {
    id: "ai-summarize-block",
    label: labels?.aiSummarize || "AI Summarize Block",
    icon: "aiSummarize",
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
    icon: "heading1",
    description: labels?.heading1Desc || "Large heading",
    category: "heading",
    action: transformOrInsert("ATXHeading1", "# ", 2),
  },
  {
    id: "h2",
    label: labels?.heading2 || "Heading 2",
    icon: "heading2",
    description: labels?.heading2Desc || "Section heading",
    category: "heading",
    action: transformOrInsert("ATXHeading2", "## ", 3),
  },
  {
    id: "h3",
    label: labels?.heading3 || "Heading 3",
    icon: "heading3",
    description: labels?.heading3Desc || "Subsection heading",
    category: "heading",
    action: transformOrInsert("ATXHeading3", "### ", 4),
  },
  
  // 列表
  {
    id: "bullet-list",
    label: labels?.bulletList || "Bullet List",
    icon: "bulletList",
    description: labels?.bulletListDesc || "Bulleted list",
    category: "list",
    action: transformOrInsert("BulletList", "- ", 2),
  },
  {
    id: "numbered-list",
    label: labels?.numberedList || "Numbered List",
    icon: "orderedList",
    description: labels?.numberedListDesc || "Numbered list",
    category: "list",
    action: transformOrInsert("OrderedList", "1. ", 3),
  },
  {
    id: "task-list",
    label: labels?.taskList || "Task List",
    icon: "taskList",
    description: labels?.taskListDesc || "Todo list",
    category: "list",
    action: (view, from, to) => {
      insertMarkdownBlock(view, from, to, "- [ ] ", 6);
    },
  },
  
  // 块
  {
    id: "quote",
    label: labels?.quote || "Quote",
    icon: "blockquote",
    description: labels?.quoteDesc || "Blockquote",
    category: "block",
    action: transformOrInsert("Blockquote", "> ", 2),
  },
  {
    id: "code-block",
    label: labels?.codeBlock || "Code Block",
    icon: "codeBlock",
    description: labels?.codeBlockDesc || "Code snippet",
    category: "block",
    action: (view, from, to) => {
      insertMarkdownBlock(view, from, to, "```\n\n```", 4);
    },
  },
  {
    id: "callout",
    label: labels?.callout || "Callout",
    icon: "callout",
    description: labels?.calloutDesc || "Callout block",
    category: "block",
    action: (view, from, to) => {
      insertMarkdownBlock(view, from, to, "> [!note]\n> ", 12);
    },
  },
  {
    id: "math-block",
    label: labels?.mathBlock || "Math Block",
    icon: "mathBlock",
    description: labels?.mathBlockDesc || "LaTeX block",
    category: "block",
    action: (view, from, to) => {
      insertMarkdownBlock(view, from, to, "$$\n\n$$", 3);
    },
  },
  
  // 插入
  {
    id: "table",
    label: labels?.table || "Table",
    icon: "table",
    description: labels?.tableDesc || "Markdown table",
    category: "insert",
    action: (view, from, to) => {
      insertMarkdownBlock(view, from, to, tableTemplate, 2);
    },
  },
  {
    id: "divider",
    label: labels?.divider || "Divider",
    icon: "divider",
    description: labels?.dividerDesc || "Horizontal divider",
    category: "insert",
    action: (view, from, to) => {
      insertMarkdownBlock(view, from, to, "---\n", 4);
    },
  },
  {
    id: "image",
    label: labels?.image || "Image",
    icon: "image",
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
    icon: "link",
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
export const showSlashAIInlinePreview = StateEffect.define<SlashAIInlinePreview>();
export const clearSlashAIInlinePreview = StateEffect.define<void>();

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

class SlashAIInlinePreviewWidget extends WidgetType {
  constructor(readonly preview: SlashAIInlinePreview) {
    super();
  }

  eq(other: SlashAIInlinePreviewWidget) {
    return (
      other.preview.id === this.preview.id &&
      other.preview.status === this.preview.status &&
      other.preview.anchor === this.preview.anchor &&
      other.preview.result?.text === this.preview.result?.text &&
      other.preview.result?.from === this.preview.result?.from &&
      other.preview.result?.to === this.preview.result?.to &&
      JSON.stringify(other.preview.stageStatuses) === JSON.stringify(this.preview.stageStatuses)
    );
  }

  toDOM() {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-slash-ai-inline-preview";
    wrapper.style.cssText =
      this.preview.status === "running"
        ? `
          box-sizing: border-box;
          margin: 8px 0 10px;
          color: hsl(var(--muted-foreground));
          font-size: 12px;
          line-height: 1.5;
        `
        : `
          box-sizing: border-box;
          margin: 10px 0 12px;
          color: hsl(var(--foreground));
        `;

    const currentStage =
      slashAIStageOrder.find((stage) => this.preview.stageStatuses[stage] === "active") ??
      slashAIStageOrder.findLast((stage) => this.preview.stageStatuses[stage] === "done") ??
      "understanding";

    if (this.preview.status === "running") {
      const statusRow = document.createElement("div");
      statusRow.style.cssText = `
        position: relative;
        display: inline-flex;
        max-width: min(520px, 100%);
        align-items: center;
        gap: 8px;
        overflow: hidden;
        border-left: 2px solid hsl(var(--primary) / 0.34);
        padding: 5px 9px 5px 10px;
        background: linear-gradient(
          90deg,
          hsl(var(--primary) / 0.055),
          hsl(var(--muted) / 0.11) 48%,
          hsl(var(--primary) / 0.04)
        );
        color: hsl(var(--muted-foreground));
      `;

      const pulse = document.createElement("span");
      pulse.style.cssText = `
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: hsl(var(--primary) / 0.72);
        box-shadow: 0 0 0 4px hsl(var(--primary) / 0.08);
        flex: 0 0 auto;
      `;

      const label = document.createElement("span");
      label.textContent = this.preview.labels.stages[currentStage];
      label.style.cssText = `
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `;

      const ellipsis = document.createElement("span");
      ellipsis.textContent = "...";
      ellipsis.style.cssText = "letter-spacing: 1px; color: hsl(var(--foreground) / 0.42);";

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = this.preview.labels.cancel;
      cancel.dataset.action = "cancel";
      cancel.style.cssText = `
        margin-left: 6px;
        border: 0;
        background: transparent;
        color: hsl(var(--muted-foreground));
        font-size: 12px;
        cursor: pointer;
        padding: 0 2px;
      `;
      cancel.addEventListener("mousedown", (event) => event.preventDefault());
      cancel.addEventListener("click", (event) => {
        event.preventDefault();
        window.dispatchEvent(
          new CustomEvent("slash-ai-inline-preview-action", {
            detail: { id: this.preview.id, action: "cancel" },
          }),
        );
      });

      statusRow.append(pulse, label, ellipsis, cancel);
      wrapper.appendChild(statusRow);
      return wrapper;
    }

    const body = document.createElement("section");
    body.style.cssText = `
      overflow: hidden;
      border-left: 2px solid hsl(var(--primary) / 0.30);
      padding-left: 12px;
    `;

    const text = document.createElement("pre");
    text.textContent = this.preview.result?.text ?? "";
    text.style.cssText = `
      margin: 0;
      max-height: 260px;
      overflow: auto;
      white-space: pre-wrap;
      padding: 8px 0 9px;
      color: hsl(var(--foreground) / 0.68);
      font-family: inherit;
      font-size: 0.95em;
      line-height: 1.7;
    `;

    const footer = document.createElement("div");
    footer.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 3px 0 0;
    `;

    const makeButton = (label: string, action: "accept" | "cancel" | "regenerate", primary = false) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.dataset.action = action;
      button.style.cssText = primary
        ? `
          height: 26px;
          padding: 0 10px;
          border: 1px solid hsl(var(--primary) / 0.92);
          border-radius: 6px;
          background: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        `
        : `
          height: 26px;
          padding: 0 6px;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: hsl(var(--muted-foreground));
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
        `;
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        window.dispatchEvent(
          new CustomEvent("slash-ai-inline-preview-action", {
            detail: { id: this.preview.id, action },
          }),
        );
      });
      return button;
    };

    footer.append(
      makeButton(this.preview.labels.insert, "accept", true),
      makeButton(this.preview.labels.regenerate, "regenerate"),
      makeButton(this.preview.labels.cancel, "cancel"),
    );
    body.append(text, footer);
    wrapper.appendChild(body);
    return wrapper;
  }

  ignoreEvent() {
    return false;
  }
}

export const slashAIInlinePreviewField = StateField.define<SlashAIInlinePreview | null>({
  create: () => null,
  update(preview, tr) {
    let next = preview;
    if (next && tr.docChanged) {
      const mappedAnchor = tr.changes.mapPos(next.anchor);
      next = {
        ...next,
        anchor: mappedAnchor,
        result: next.result
          ? {
              ...next.result,
              from: tr.changes.mapPos(next.result.from),
              to: tr.changes.mapPos(next.result.to),
            }
          : undefined,
      };
    }
    for (const effect of tr.effects) {
      if (effect.is(showSlashAIInlinePreview)) {
        next = effect.value;
      }
      if (effect.is(clearSlashAIInlinePreview)) {
        next = null;
      }
    }
    return next;
  },
  provide: (field) =>
    EditorView.decorations.from(field, (preview) => {
      if (!preview) return Decoration.none;
      const result = preview.result;
      const safeFrom = result ? Math.max(0, Math.min(result.from, result.to)) : preview.anchor;
      const safeTo = result ? Math.max(result.from, result.to) : preview.anchor;
      const decorations = [
        Decoration.widget({
          widget: new SlashAIInlinePreviewWidget(preview),
          block: true,
          side: 1,
        }).range(preview.anchor),
      ];
      if (result && safeTo > safeFrom) {
        decorations.push(
          Decoration.mark({
            attributes: {
              style:
                "background: hsl(var(--primary) / 0.055); text-decoration: underline; text-decoration-style: dashed; text-decoration-color: hsl(var(--primary) / 0.35); text-underline-offset: 3px;",
            },
          }).range(safeFrom, safeTo),
        );
      }
      return Decoration.set(decorations, true);
    }),
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
  slashAIInlinePreviewField,
  slashCommandPlugin,
];
