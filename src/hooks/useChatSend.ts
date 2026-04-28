/**
 * 统一的消息发送 Hook
 * 处理 @ 引用文件的读取、显示消息构建、发送逻辑
 */

import { useCallback } from "react";
import { readFile } from "@/lib/host";
import { getCurrentTranslations } from "@/stores/useLocaleStore";
import { reportOperationError } from "@/lib/reportError";
import type { MessageAttachment } from "@/services/llm";
import type { QuoteRange, QuoteReference } from "@/types/chat";

export interface ReferencedFile {
  path: string;
  name: string;
  isFolder: boolean;
}

export interface SendOptions {
  message: string;
  referencedFiles: ReferencedFile[];
}

export interface ProcessedMessage {
  displayMessage: string; // 用于前端显示（仅用户输入文本）
  fullMessage: string; // 发送给 AI（包含文件完整内容）
  fileContext: string; // 引用文件的内容（用于上下文）
  quoteContext: string; // 引用片段的结构化上下文（用于模型）
  attachments: MessageAttachment[];
}

const MEDIA_OR_BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".avif",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".tar",
  ".7z",
  ".mp3",
  ".mp4",
  ".mov",
  ".wav",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
]);

const MAX_INLINE_FILE_CHARS = 120_000;
const MAX_TOTAL_INLINE_FILE_CHARS = 240_000;

function fileExtension(file: ReferencedFile): string {
  const name = (file.path || file.name).toLowerCase();
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx) : "";
}

function shouldInlineReferencedFile(file: ReferencedFile): boolean {
  return !MEDIA_OR_BINARY_EXTENSIONS.has(fileExtension(file));
}

function looksLikeBinaryText(content: string): boolean {
  if (!content) return false;
  if (content.includes("\u0000")) return true;
  const sample = content.slice(0, 4096);
  const replacementChars = (sample.match(/\uFFFD/g) ?? []).length;
  return replacementChars > Math.max(8, sample.length * 0.02);
}

function buildPathOnlyFileContext(fileHeader: string, file: ReferencedFile): string {
  return [
    `--- ${fileHeader} ---`,
    `Path: ${file.path}`,
    "Content not inlined because this is a binary or media file. Use the path directly when a tool needs this file.",
  ].join("\n");
}

function truncateInlineContent(content: string, remainingBudget: number): {
  content: string;
  truncated: boolean;
} {
  const limit = Math.max(0, Math.min(MAX_INLINE_FILE_CHARS, remainingBudget));
  if (content.length <= limit) return { content, truncated: false };
  return { content: content.slice(0, limit), truncated: true };
}

function summarizeQuoteText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "Quoted content";
  return normalized.length > 72 ? `${normalized.slice(0, 72)}...` : normalized;
}

function formatQuoteRange(range?: QuoteRange): string | undefined {
  if (!range) return undefined;
  if (range.kind === "line") {
    return range.startLine === range.endLine
      ? `L${range.startLine}`
      : `L${range.startLine}-${range.endLine}`;
  }
  if (range.kind === "offset") {
    return `${range.startOffset}-${range.endOffset}`;
  }
  if (range.kind === "pdf") {
    return `P${range.page}`;
  }
  if (range.kind === "diagram") {
    return range.elementCount > 0 ? `Elements:${range.elementCount}` : "Canvas";
  }
  return undefined;
}

function buildQuoteContext(quotes: QuoteReference[]): string {
  return quotes
    .map((quote, index) => {
      const locator = quote.locator || formatQuoteRange(quote.range);
      const lines = [`[QUOTE ${index + 1}]`, `source: ${quote.source}`];
      if (quote.sourcePath) lines.push(`path: ${quote.sourcePath}`);
      if (locator) lines.push(`locator: ${locator}`);
      if (quote.range) lines.push(`range: ${JSON.stringify(quote.range)}`);
      lines.push(`summary: ${quote.summary || summarizeQuoteText(quote.text)}`);
      if (quote.sourcePath) {
        lines.push("(read the file above if you need the full content)");
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

/**
 * 处理消息和引用文件，构建显示消息和完整消息
 */
export async function processMessageWithFiles(
  message: string,
  referencedFiles: ReferencedFile[],
  quotedSelections: QuoteReference[] = [],
): Promise<ProcessedMessage> {
  const t = getCurrentTranslations();
  const fileAttachments: MessageAttachment[] = referencedFiles
    .filter((f) => !f.isFolder)
    .map((f) => ({
      type: "file",
      name: f.name,
      path: f.path,
    }));
  const quoteAttachments: MessageAttachment[] = quotedSelections.map(
    (quote) => ({
      type: "quote",
      text: quote.text,
      source: quote.source,
      sourcePath: quote.sourcePath,
      summary: quote.summary || summarizeQuoteText(quote.text),
      locator: quote.locator || formatQuoteRange(quote.range),
      range: quote.range,
    }),
  );
  const attachments: MessageAttachment[] = [
    ...fileAttachments,
    ...quoteAttachments,
  ];

  const trimmedMessage = message.trim();
  const displayMessage = trimmedMessage;

  // 读取引用文件的内容（用于发送给 AI）
  const fileContextEntries: string[] = [];
  let inlineBudgetUsed = 0;
  for (const file of referencedFiles) {
    if (!file.isFolder) {
      const fileHeader = t.ai.fileContextLabel.replace("{name}", file.name);
      if (!shouldInlineReferencedFile(file)) {
        fileContextEntries.push(buildPathOnlyFileContext(fileHeader, file));
        continue;
      }

      try {
        const content = await readFile(file.path);
        if (looksLikeBinaryText(content)) {
          fileContextEntries.push(buildPathOnlyFileContext(fileHeader, file));
          continue;
        }
        const remainingBudget = MAX_TOTAL_INLINE_FILE_CHARS - inlineBudgetUsed;
        if (remainingBudget <= 0) {
          fileContextEntries.push(
            [
              `--- ${fileHeader} ---`,
              `Path: ${file.path}`,
              "Content omitted because referenced file context is already at the inline size limit.",
            ].join("\n"),
          );
          continue;
        }
        const truncated = truncateInlineContent(content, remainingBudget);
        inlineBudgetUsed += truncated.content.length;
        fileContextEntries.push(
          [
            `--- ${fileHeader} ---`,
            truncated.content,
            truncated.truncated
              ? `\n[Truncated: file content exceeded ${MAX_INLINE_FILE_CHARS} characters or the total inline reference budget.]`
              : "",
          ].join("\n"),
        );
      } catch (e) {
        reportOperationError({
          source: "useChatSend.processMessageWithFiles",
          action: "Read referenced file for chat",
          error: e,
          level: "warning",
          context: { path: file.path, name: file.name },
        });
      }
    }
  }
  const fileContext = fileContextEntries.join("\n\n");
  const quoteContext = buildQuoteContext(quotedSelections);

  const fullSections = [
    trimmedMessage,
    quoteContext ? `[Quoted references]\n${quoteContext}` : "",
    fileContext ? `${t.ai.fileContextTag}\n${fileContext}` : "",
  ].filter(Boolean);
  const fullMessage = fullSections.join("\n\n");

  return {
    displayMessage,
    fullMessage,
    fileContext,
    quoteContext,
    attachments,
  };
}

/**
 * Hook: 提供统一的消息处理函数
 */
export function useChatSend() {
  const processMessage = useCallback(
    async (
      message: string,
      referencedFiles: ReferencedFile[],
      quotedSelections: QuoteReference[] = [],
    ): Promise<ProcessedMessage> => {
      return processMessageWithFiles(
        message,
        referencedFiles,
        quotedSelections,
      );
    },
    [],
  );

  return { processMessage };
}
