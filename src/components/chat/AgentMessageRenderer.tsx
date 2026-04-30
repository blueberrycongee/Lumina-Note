/**
 * Agent 消息渲染组件
 *
 * Render agent output as a strict timeline:
 * - Thinking blocks (collapsible)
 * - Tool calls/results (collapsible)
 * - Text segments (Markdown)
 */

import {
  useState,
  useMemo,
  useCallback,
  useEffect,
  memo,
  type MouseEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useLocaleStore,
  getCurrentTranslations,
} from "@/stores/useLocaleStore";
import { parseMarkdown } from "@/services/markdown/markdown";
import type { Part as OpencodePart } from "@opencode-ai/sdk/client";
import type {
  ImageContent,
  MessageAttachment,
  MessageContent,
} from "@/services/llm";
import { useTimeout } from "@/hooks/useTimeout";
import { DiffView } from "@/components/effects/DiffView";
import { useAIStore, type PendingDiff } from "@/stores/useAIStore";
import { useFileStore } from "@/stores/useFileStore";
import { readBinaryFileBase64, saveFile } from "@/lib/host";
import { join } from "@/lib/path";
import { getImageMimeType } from "@/services/assets/editorImages";
import {
  getImagesFromContent,
  getTextFromContent,
  getUserMessageDisplay,
} from "./messageContentUtils";
import { AssistantDiagramPanels } from "./AssistantDiagramPanels";
import { getDiagramAttachmentFilePaths } from "./diagramAttachmentUtils";
import { UserMessageBubbleContent } from "./UserMessageBubbleContent";
import { getPromptFromPromptLink } from "./promptLinks";
import {
  ChevronRight,
  ChevronDown,
  Wrench,
  Brain,
  Check,
  X,
  Loader2,
  Copy,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

// ============ 类型定义 ============

interface PartTime {
  start: number;
  end?: number;
}

export interface ToolCallInfo {
  name: string;
  params: string;
  title?: string;
  result?: string;
  success?: boolean;
  // Populated only on the opencode path (state.time on ToolStateRunning /
  // Completed / Error). Lets WorkSession show "took 0:42" on finished
  // sessions even after remount, since the data is in rawParts.
  time?: PartTime;
}

export interface GeneratedImageInfo {
  absolutePath?: string;
  relativePath?: string;
  provider?: string;
  providerLabel?: string;
  model?: string;
  markdown?: string;
}

type AgentMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: MessageContent;
  attachments?: MessageAttachment[];
  agent?: string;
  id?: string;
  /**
   * Opencode structured parts. When present the renderer skips the legacy
   * `🔧 name:` / `<thinking>` string-parsing pipeline and maps parts directly
   * to timeline entries.
   */
  rawParts?: OpencodePart[];
};

interface ThinkingItem {
  content: string;
  status?: "streaming" | "done";
  time?: PartTime;
}

type WorkItem =
  | {
      type: "thinking";
      content: string;
      status?: "streaming" | "done";
      time?: PartTime;
    }
  | { type: "thinking_group"; items: ThinkingItem[] }
  | { type: "tool"; tool: ToolCallInfo }
  | { type: "tool_group"; tools: ToolCallInfo[] };

type TimelinePart =
  | { type: "text"; content: string }
  | {
      type: "thinking";
      content: string;
      status?: "streaming" | "done";
      time?: PartTime;
    }
  | { type: "thinking_group"; items: ThinkingItem[] }
  | { type: "tool"; tool: ToolCallInfo }
  | { type: "tool_group"; tools: ToolCallInfo[] }
  | { type: "image_generation_progress"; tool: ToolCallInfo }
  | { type: "generated_image"; image: GeneratedImageInfo }
  | { type: "work_session"; items: WorkItem[] }
  | { type: "diff"; diff: PendingDiff };

const DIRECT_IMAGE_GENERATING_PREFIX = "__lumina_image_generating__:";
const GENERATED_IMAGE_PREFIX = "__lumina_generated_image__:";

export function makeImageGeneratingMarker(providerLabel: string): string {
  return `${DIRECT_IMAGE_GENERATING_PREFIX}${providerLabel}`;
}

export function parseImageGeneratingMarker(content: string): string | null {
  if (!content.startsWith(DIRECT_IMAGE_GENERATING_PREFIX)) return null;
  const provider = content.slice(DIRECT_IMAGE_GENERATING_PREFIX.length).trim();
  return provider || null;
}

export function makeGeneratedImageMarker(image: GeneratedImageInfo): string {
  return `${GENERATED_IMAGE_PREFIX}${encodeURIComponent(JSON.stringify(image))}`;
}

export function parseGeneratedImageMarker(
  content: string,
): GeneratedImageInfo | null {
  if (!content.startsWith(GENERATED_IMAGE_PREFIX)) return null;
  const payload = content.slice(GENERATED_IMAGE_PREFIX.length).trim();
  if (!payload) return null;
  try {
    return normalizeGeneratedImageInfo(JSON.parse(decodeURIComponent(payload)));
  } catch {
    return null;
  }
}

// Threshold above which a run of consecutive tool calls is folded into one
// outer ToolGroupCollapsible. Two tools in a row aren't worth the extra layer.
const TOOL_GROUP_THRESHOLD = 3;
// Reasoning chunks pile up faster than tools and each one is just a button
// row, so collapse at 2.
const THINKING_GROUP_THRESHOLD = 2;

function collapseConsecutiveTools(parts: TimelinePart[]): TimelinePart[] {
  const out: TimelinePart[] = [];
  let run: ToolCallInfo[] = [];
  const flush = () => {
    if (run.length === 0) return;
    if (run.length >= TOOL_GROUP_THRESHOLD) {
      out.push({ type: "tool_group", tools: run });
    } else {
      for (const tool of run) out.push({ type: "tool", tool });
    }
    run = [];
  };
  for (const part of parts) {
    if (part.type === "tool") {
      run.push(part.tool);
    } else {
      flush();
      out.push(part);
    }
  }
  flush();
  return out;
}

function collapseConsecutiveThinking(parts: TimelinePart[]): TimelinePart[] {
  const out: TimelinePart[] = [];
  let run: ThinkingItem[] = [];
  const flush = () => {
    if (run.length === 0) return;
    if (run.length >= THINKING_GROUP_THRESHOLD) {
      out.push({ type: "thinking_group", items: run });
    } else {
      for (const item of run) {
        out.push({
          type: "thinking",
          content: item.content,
          status: item.status,
          time: item.time,
        });
      }
    }
    run = [];
  };
  for (const part of parts) {
    if (part.type === "thinking") {
      run.push({ content: part.content, status: part.status, time: part.time });
    } else {
      flush();
      out.push(part);
    }
  }
  flush();
  return out;
}

// Bundle every consecutive non-text/non-diff timeline entry into a single
// outer WorkSession. The user only ever sees one quiet "Working · mm:ss"
// line per phase; thinking and tool details live inside, behind a click.
function bundleWorkSessions(parts: TimelinePart[]): TimelinePart[] {
  const out: TimelinePart[] = [];
  let run: WorkItem[] = [];
  const flush = () => {
    if (run.length === 0) return;
    out.push({ type: "work_session", items: run });
    run = [];
  };
  for (const part of parts) {
    if (
      part.type === "thinking" ||
      part.type === "thinking_group" ||
      part.type === "tool" ||
      part.type === "tool_group"
    ) {
      run.push(part);
    } else {
      flush();
      out.push(part);
    }
  }
  flush();
  return out;
}

function countWorkSteps(items: WorkItem[]): number {
  let n = 0;
  for (const item of items) {
    if (item.type === "thinking") n += 1;
    else if (item.type === "thinking_group") n += item.items.length;
    else if (item.type === "tool") n += 1;
    else if (item.type === "tool_group") n += item.tools.length;
  }
  return n;
}

function isWorkSessionInProgress(items: WorkItem[]): boolean {
  return items.some((item) => {
    if (item.type === "thinking") return item.status === "streaming";
    if (item.type === "thinking_group")
      return item.items.some((t) => t.status === "streaming");
    if (item.type === "tool") return item.tool.result === undefined;
    if (item.type === "tool_group")
      return item.tools.some((t) => t.result === undefined);
    return false;
  });
}

/**
 * Walk every WorkItem and collect (min start, max end) across the embedded
 * opencode timestamps. Used to render "took 0:42" durably even after the
 * component remounts — the timestamps live in rawParts so they survive.
 *
 * Returns null start if no item carries time info (e.g., legacy non-opencode
 * messages); callers fall back to step-count-only display in that case.
 */
function getSessionTimeRange(items: WorkItem[]): {
  start: number | null;
  end: number | null;
  hasPending: boolean;
} {
  let start: number | null = null;
  let end: number | null = null;
  let hasPending = false;
  const ingest = (time: PartTime | undefined) => {
    if (!time) return;
    if (start === null || time.start < start) start = time.start;
    if (time.end !== undefined) {
      if (end === null || time.end > end) end = time.end;
    } else {
      hasPending = true;
    }
  };
  for (const item of items) {
    if (item.type === "thinking") ingest(item.time);
    else if (item.type === "thinking_group")
      item.items.forEach((i) => ingest(i.time));
    else if (item.type === "tool") ingest(item.tool.time);
    else if (item.type === "tool_group")
      item.tools.forEach((tool) => ingest(tool.time));
  }
  return { start, end, hasPending };
}

export function isPendingImageGenerationTool(tool: ToolCallInfo): boolean {
  return tool.name === "generate_image" && tool.result === undefined;
}

export function getImageGenerationProviderLabel(
  tool: ToolCallInfo,
): string | null {
  if (tool.title) {
    const label = tool.title
      .replace(/^Generating with\s+/i, "")
      .replace(/[.…]+$/g, "")
      .trim();
    if (label) return label;
  }
  const providerMatch = tool.params.match(/"provider"\s*:\s*"([^"]+)"/);
  if (providerMatch?.[1]) return providerMatch[1];
  const modelMatch = tool.params.match(/"model_id"\s*:\s*"([^"]+)"/);
  if (modelMatch?.[1]) return modelMatch[1];
  return null;
}

function getPendingImageGenerationTool(
  part: TimelinePart,
): ToolCallInfo | null {
  if (part.type === "tool" && isPendingImageGenerationTool(part.tool)) {
    return part.tool;
  }
  if (part.type === "tool_group") {
    return part.tools.find(isPendingImageGenerationTool) ?? null;
  }
  return null;
}

function insertImageGenerationProgressParts(
  parts: TimelinePart[],
): TimelinePart[] {
  const out: TimelinePart[] = [];
  for (const part of parts) {
    out.push(part);
    const pendingImageTool = getPendingImageGenerationTool(part);
    if (pendingImageTool) {
      out.push({ type: "image_generation_progress", tool: pendingImageTool });
    }
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(
  record: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeGeneratedImageInfo(
  value: unknown,
): GeneratedImageInfo | null {
  if (!isRecord(value)) return null;
  const absolutePath = stringValue(value, "absolutePath");
  const relativePath = stringValue(value, "relativePath");
  if (!absolutePath && !relativePath) return null;
  const markdown =
    stringValue(value, "markdown") ??
    (relativePath ? `![](${relativePath})` : undefined);
  return {
    absolutePath,
    relativePath,
    provider: stringValue(value, "provider"),
    providerLabel: stringValue(value, "providerLabel"),
    model: stringValue(value, "model"),
    markdown,
  };
}

function cleanGeneratedPath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/^`|`$/g, "").trim() || undefined;
}

function parseGeneratedRelativePath(output: string): string | undefined {
  const markdownMatch = output.match(/!\[\]\(([^)]+)\)/);
  if (markdownMatch?.[1]) return cleanGeneratedPath(markdownMatch[1]);
  const savedMatch = output.match(/(?:Generated and saved|Path):\s*([^\n]+)/i);
  return cleanGeneratedPath(savedMatch?.[1]);
}

function parseGeneratedModel(output: string): string | undefined {
  const providerLine = output.match(/^Provider:\s*(.+)$/im)?.[1];
  const modelMatch = providerLine?.match(/\(([^)]+)\)/);
  return modelMatch?.[1]?.trim() || undefined;
}

function cleanGeneratingTitle(title: string | undefined): string | undefined {
  if (!title) return undefined;
  return (
    title
      .replace(/^Generating with\s+/i, "")
      .replace(/[.…]+$/g, "")
      .trim() || undefined
  );
}

function extractGeneratedImageInfo(
  name: string,
  state: {
    status?: string;
    output?: string;
    title?: string;
    metadata?: Record<string, unknown>;
  },
): GeneratedImageInfo | null {
  if (name !== "generate_image" || state.status !== "completed") return null;
  const metadata = isRecord(state.metadata) ? state.metadata : undefined;
  const output = state.output ?? "";
  return normalizeGeneratedImageInfo({
    absolutePath: stringValue(metadata, "absolutePath"),
    relativePath:
      stringValue(metadata, "vaultRelativePath") ??
      stringValue(metadata, "relativePath") ??
      parseGeneratedRelativePath(output),
    provider: stringValue(metadata, "provider"),
    providerLabel:
      cleanGeneratingTitle(state.title) ??
      stringValue(metadata, "model") ??
      stringValue(metadata, "provider"),
    model: stringValue(metadata, "model") ?? parseGeneratedModel(output),
  });
}

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

function pushTextPart(
  parts: TimelinePart[],
  text: string,
  includeText: boolean,
) {
  if (!includeText) return;
  const cleaned = text.replace(/<\|end_of_thinking\|>/g, "");
  if (cleaned.trim().length === 0) return;
  parts.push({ type: "text", content: cleaned });
}

function appendPartsFromContent(
  content: string,
  parts: TimelinePart[],
  lastToolCall: { current: ToolCallInfo | null },
  includeText: boolean,
) {
  const trimmed = content.trim();

  // Legacy text-event format: 🔧 tool_name: {...}
  const legacyToolMatch = trimmed.match(/^🔧\s*(\w+)\s*:\s*([\s\S]+)$/);
  if (legacyToolMatch) {
    const tool = {
      name: legacyToolMatch[1],
      params: formatToolParams(legacyToolMatch[2]),
    };
    parts.push({ type: "tool", tool });
    lastToolCall.current = tool;
    return;
  }

  // Legacy text-event format: ✅ result... or ❌ error...
  const legacySuccessMatch = trimmed.match(/^✅\s*(\w+)\s*:\s*([\s\S]+)$/);
  if (legacySuccessMatch) {
    const toolName = legacySuccessMatch[1];
    const result = legacySuccessMatch[2].trim();
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

  const legacyErrorMatch = trimmed.match(/^❌\s*(\w+)\s*:\s*([\s\S]+)$/);
  if (legacyErrorMatch) {
    const toolName = legacyErrorMatch[1];
    const result = legacyErrorMatch[2].trim();
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
    } else if (
      tagNameLower === "tool_result" ||
      tagNameLower === "tool_error"
    ) {
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

function getGeneratedImageCopyText(image: GeneratedImageInfo): string {
  if (image.markdown?.trim()) return image.markdown.trim();
  if (image.relativePath?.trim()) return `![](${image.relativePath.trim()})`;
  return image.absolutePath?.trim() ?? "";
}

function getAssistantCopyText(parts: TimelinePart[]): string {
  const chunks: string[] = [];

  for (const part of parts) {
    if (part.type === "text") {
      const generatingProvider = parseImageGeneratingMarker(part.content);
      if (generatingProvider) continue;

      const generatedImage = parseGeneratedImageMarker(part.content);
      if (generatedImage) {
        chunks.push(getGeneratedImageCopyText(generatedImage));
        continue;
      }

      chunks.push(part.content.trim());
      continue;
    }

    if (part.type === "generated_image") {
      chunks.push(getGeneratedImageCopyText(part.image));
    }
  }

  return chunks.filter(Boolean).join("\n\n");
}

const ATTACHABLE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

function inferImageMime(
  src: string,
): "image/png" | "image/jpeg" | "image/gif" | "image/webp" {
  const lower = src.toLowerCase().split(/[?#]/)[0];
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

/**
 * Click delegation for assistant message bodies: when the user clicks an
 * `<img class="markdown-image">` rendered inside the message, fetch the
 * image bytes, encode as base64, and dispatch a `lumina:attach-image`
 * event. ChatInput listens for that event and adds the image to its
 * `attachedImages` chip row — same UX as drag-drop / paperclip / paste.
 *
 * Use case: the agent generated an image, you want to iterate. Click
 * the image, type "make it darker", send. The new request carries the
 * previous frame as a reference image.
 */
async function attachClickedImage(img: HTMLImageElement): Promise<void> {
  // currentSrc reflects what the browser actually loaded (including
  // resolved relative paths). Fall back to src for older browsers.
  const url = img.currentSrc || img.src;
  if (!url) return;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(
        `[chat] failed to fetch image for attach: HTTP ${res.status}`,
      );
      return;
    }
    const blob = await res.blob();
    const mimeFromBlob = blob.type;
    const mediaType = ATTACHABLE_MIME.has(mimeFromBlob)
      ? (mimeFromBlob as
          | "image/png"
          | "image/jpeg"
          | "image/gif"
          | "image/webp")
      : inferImageMime(url);
    const dataUrl: string = await new Promise(
      (resolveDataUrl, rejectReader) => {
        const reader = new FileReader();
        reader.onerror = () => rejectReader(reader.error);
        reader.onload = () => resolveDataUrl(reader.result as string);
        reader.readAsDataURL(blob);
      },
    );
    const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
    window.dispatchEvent(
      new CustomEvent("lumina:attach-image", {
        detail: { data: base64, mediaType, preview: dataUrl },
      }),
    );
  } catch (err) {
    console.warn("[chat] attachClickedImage threw:", err);
  }
}

const handleAssistantContentClick = (e: MouseEvent<HTMLDivElement>): void => {
  const target = e.target as HTMLElement | null;
  if (!target || target.tagName !== "IMG") return;
  if (!target.classList.contains("markdown-image")) return;
  e.preventDefault();
  e.stopPropagation();
  void attachClickedImage(target as HTMLImageElement);
};

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

  return params
    .replace(/<[^>]+>/g, " ")
    .trim()
    .slice(0, 100);
}

/**
 * 生成工具摘要 - 优先显示参数信息
 */
function getToolSummary(name: string, params: string, result?: string): string {
  const t = getCurrentTranslations().agentMessage;
  const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // 优先从参数中提取关键信息
  if (name === "list") {
    const dirMatch = params.match(
      new RegExp(`${escapeRegExp(t.directory)}:\\s*([^\\s|]+)`),
    );
    if (dirMatch) return `${t.directory}: ${dirMatch[1] || "/"}`;
  }
  if (name === "read") {
    const fileMatch = params.match(
      new RegExp(`${escapeRegExp(t.file)}:\\s*([^\\s|]+)`),
    );
    if (fileMatch) return `${t.file}: ${fileMatch[1]}`;
  }
  if (name === "write" || name === "edit") {
    const fileMatch = params.match(
      new RegExp(`${escapeRegExp(t.file)}:\\s*([^\\s|]+)`),
    );
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

/**
 * Map opencode's structured Part[] onto the TimelinePart[] we already render.
 * Boundary-only parts (step-start / step-finish / snapshot) are dropped —
 * they don't produce UI. Tool state discriminates pending/running/completed
 * /error so we drive the existing ToolCallCollapsible spinner + check/X.
 */
function timelineFromOpencodeParts(rawParts: OpencodePart[]): TimelinePart[] {
  const out: TimelinePart[] = [];
  for (const part of rawParts) {
    switch (part.type) {
      case "text": {
        const text = (part as { text?: string }).text ?? "";
        if (text.trim().length === 0) continue;
        out.push({ type: "text", content: text });
        break;
      }
      case "reasoning": {
        const text = (part as { text?: string }).text ?? "";
        if (text.length === 0) continue;
        const time = (part as { time?: { start?: number; end?: number } }).time;
        const status: "streaming" | "done" =
          time && time.end === undefined ? "streaming" : "done";
        const reasoningTime: PartTime | undefined =
          time && typeof time.start === "number"
            ? { start: time.start, end: time.end }
            : undefined;
        out.push({
          type: "thinking",
          content: text,
          status,
          time: reasoningTime,
        });
        break;
      }
      case "tool": {
        const toolPart = part as {
          tool?: string;
          state?: {
            status?: string;
            input?: Record<string, unknown>;
            output?: string;
            error?: string;
            title?: string;
            metadata?: Record<string, unknown>;
            time?: { start?: number; end?: number };
          };
        };
        const state = toolPart.state ?? {};
        const name = toolPart.tool ?? "tool";
        const params = state.input
          ? formatToolParams(JSON.stringify(state.input))
          : "";
        let result: string | undefined;
        let success: boolean | undefined;
        if (state.status === "completed") {
          result = state.output ?? state.title ?? "";
          success = true;
        } else if (state.status === "error") {
          result = state.error ?? "";
          success = false;
        }
        const stateTime = state.time;
        const toolTime: PartTime | undefined =
          stateTime && typeof stateTime.start === "number"
            ? { start: stateTime.start, end: stateTime.end }
            : undefined;
        out.push({
          type: "tool",
          tool: {
            name,
            params,
            title: state.title,
            result,
            success,
            time: toolTime,
          },
        });
        const generatedImage = extractGeneratedImageInfo(name, state);
        if (generatedImage) {
          out.push({ type: "generated_image", image: generatedImage });
        }
        break;
      }
      default:
        // step-start / step-finish / snapshot / file / agent / subtask / etc.
        // Either pure boundary markers or features we haven't ported yet.
        break;
    }
  }
  return out;
}

function parseToolMessage(
  content: string,
): { tool: ToolCallInfo; isStart: boolean } | null {
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
  return (
    content.includes("<tool_result") ||
    content.includes("<tool_error") ||
    content.includes("你的响应没有包含有效的工具调用") ||
    content.includes("请使用 <thinking> 标签分析错误原因") ||
    content.includes("系统错误:") ||
    content.includes("系统拒绝执行") ||
    content.includes("用户拒绝了工具调用")
  );
}

/**
 * 清理 user 消息显示内容
 */
export function cleanUserMessage(content: string): string {
  return content
    .replace(
      /^Use the image-gen skill to generate an image\.\n[\s\S]*?User prompt:\n/,
      "",
    )
    .replace(
      /^Use the image-gen skill to generate an image\.\n(?:Use the configured image provider `[^`]+` \([^)]+\) unless the user explicitly asks for another configured provider\.\n)?Refine the user's prompt for visual clarity, infer the aspect ratio, use relevant vault reference images when useful, then call generate_image\.\nUser prompt:\n/,
      "",
    )
    .replace(
      /^Use the image-gen skill to generate an image\.\n(?:The configured image provider available for this request is `[^`]+` \([^)]+\)\. Use only this provider\. Do not switch to Google, Seedream, ByteDance, or any other provider unless Lumina explicitly lists it as configured\.\n)?A Chinese-language prompt does not mean the image must render Chinese text\. Only choose a text-rendering-specialized provider if that provider is configured\.\nRefine the user's prompt for visual clarity, infer the aspect ratio, use relevant vault reference images when useful, then call generate_image\.\nUser prompt:\n/,
      "",
    )
    .replace(
      /^Use the image-gen skill to generate an image\. User prompt:\n/,
      "",
    )
    .replace(/<task>([\s\S]*?)<\/task>/g, "$1")
    .replace(/<current_note[^>]*>[\s\S]*?<\/current_note>/g, "")
    .replace(/<related_notes[^>]*>[\s\S]*?<\/related_notes>/g, "")
    .replace(/\n\n\[Quoted references\][\s\S]*$/g, "")
    .replace(
      /\n\n\[(User referenced file content|用户引用的文件内容|使用者引用的檔案內容|ユーザーが参照したファイル内容)\][\s\S]*$/g,
      "",
    )
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
  const title =
    status === "thinking"
      ? t.agentMessage.thinking
      : t.agentMessage.thinkingDone || t.agentMessage.thinking;

  return (
    <div className="text-xs text-muted-foreground">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 hover:text-foreground transition-colors py-0.5"
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
            <div className="pl-5 py-1 text-xs text-muted-foreground whitespace-pre-wrap border-l border-border ml-1.5">
              {thinking || t.agentMessage.thinkingWaiting}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * 连续思考块的外层折叠
 */
const ThinkingGroupCollapsible = memo(function ThinkingGroupCollapsible({
  items,
  t,
}: {
  items: ThinkingItem[];
  t: any;
}) {
  const [expanded, setExpanded] = useState(false);
  const anyStreaming = items.some((item) => item.status === "streaming");
  const title = anyStreaming
    ? t.agentMessage.thinking
    : t.agentMessage.thinkingGroup ||
      t.agentMessage.thinkingDone ||
      t.agentMessage.thinking;

  return (
    <div className="text-xs text-muted-foreground">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 hover:text-foreground transition-colors py-0.5 w-full text-left"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Brain size={12} />
        <span className="font-medium">{title}</span>
        <span className="truncate flex-1">· {items.length}</span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pl-5 py-1 space-y-2 border-l border-border ml-1.5">
              {items.map((item, i) => (
                <div
                  key={i}
                  className="text-xs text-muted-foreground whitespace-pre-wrap"
                >
                  {item.content || t.agentMessage.thinkingWaiting}
                </div>
              ))}
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
const ToolCallCollapsible = memo(function ToolCallCollapsible({
  tool,
  t,
}: {
  tool: ToolCallInfo;
  t: any;
}) {
  const [expanded, setExpanded] = useState(false);
  const isComplete = tool.result !== undefined;
  const summary = getToolSummary(tool.name, tool.params, tool.result);

  return (
    <div className="text-xs text-muted-foreground">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 hover:text-foreground transition-colors py-0.5 w-full text-left"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Wrench size={12} />
        <span className="font-medium">{tool.name}</span>

        {/* 状态图标 */}
        {isComplete ? (
          tool.success ? (
            <Check size={12} className="text-success" />
          ) : (
            <X size={12} className="text-destructive" />
          )
        ) : (
          <Loader2 size={12} className="animate-spin" />
        )}

        {/* 摘要 */}
        <span className="truncate flex-1">{summary}</span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pl-5 py-1 space-y-1 border-l border-border ml-1.5">
              {tool.params && (
                <div>
                  <div className="text-xs text-muted-foreground/70 mb-0.5">
                    {t.agentMessage.params}:
                  </div>
                  <pre className="text-xs bg-muted/30 p-1.5 rounded overflow-x-auto">
                    {tool.params}
                  </pre>
                </div>
              )}
              {tool.result && (
                <div>
                  <div className="text-xs text-muted-foreground/70 mb-0.5">
                    {t.agentMessage.result}:
                  </div>
                  <pre className="text-xs bg-muted/30 p-1.5 rounded overflow-x-auto max-h-32 overflow-y-auto">
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

/**
 * 连续工具调用的外层折叠
 */
const ToolGroupCollapsible = memo(function ToolGroupCollapsible({
  tools,
  t,
}: {
  tools: ToolCallInfo[];
  t: any;
}) {
  const [expanded, setExpanded] = useState(false);
  const allDone = tools.every((tool) => tool.result !== undefined);
  const anyFailed = tools.some(
    (tool) => tool.result !== undefined && tool.success === false,
  );
  const tally = useMemo(() => {
    const map = new Map<string, number>();
    for (const tool of tools) {
      map.set(tool.name, (map.get(tool.name) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
      .join(", ");
  }, [tools]);

  return (
    <div className="text-xs text-muted-foreground">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 hover:text-foreground transition-colors py-0.5 w-full text-left"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Wrench size={12} />
        <span className="font-medium">{t.agentMessage.toolGroup}</span>
        {!allDone ? (
          <Loader2 size={12} className="animate-spin" />
        ) : anyFailed ? (
          <X size={12} className="text-destructive" />
        ) : (
          <Check size={12} className="text-success" />
        )}
        <span className="truncate flex-1">
          · {tools.length} ({tally})
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pl-5 py-1 space-y-1 border-l border-border ml-1.5">
              {tools.map((tool, i) => (
                <ToolCallCollapsible key={i} tool={tool} t={t} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

const ImageGenerationProgress = memo(function ImageGenerationProgress({
  providerLabel,
  elapsedLabel,
  t,
}: {
  providerLabel?: string | null;
  elapsedLabel?: string | null;
  t: any;
}) {
  const messages =
    Array.isArray(t.agentMessage.imageGeneratingMessages) &&
    t.agentMessage.imageGeneratingMessages.length > 0
      ? t.agentMessage.imageGeneratingMessages
      : [t.agentMessage.imageGeneratingDescription];
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (messages.length <= 1) return;
    const id = window.setInterval(() => {
      setMessageIndex((idx) => (idx + 1) % messages.length);
    }, 2400);
    return () => window.clearInterval(id);
  }, [messages.length]);

  const activeMessage = messages[messageIndex % messages.length];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.99 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="image-generation-progress relative mb-4 w-full max-w-[28rem] overflow-hidden rounded-[1.7rem] aspect-square min-h-[14rem]"
      role="status"
      aria-live="polite"
    >
      <div className="image-generation-dotfield" aria-hidden />
      <div className="image-generation-fade" aria-hidden />
      <div className="relative z-10 flex h-full flex-col p-6 sm:p-7">
        <div className="flex min-w-0 flex-wrap items-start gap-2">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeMessage}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
              className="min-w-[12rem] flex-1 break-words text-base font-semibold leading-snug tracking-[-0.02em] text-foreground/75 sm:text-lg"
            >
              {activeMessage}
            </motion.div>
          </AnimatePresence>
          {providerLabel && (
            <span className="rounded-full border border-foreground/10 bg-background/65 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur">
              {providerLabel}
            </span>
          )}
        </div>
        <div className="mt-auto">
          {elapsedLabel && (
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground/75">
              <span className="streaming-dot" aria-hidden />
              <span>{elapsedLabel}</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
});

const ImageGenerationToolProgress = memo(function ImageGenerationToolProgress({
  tool,
  t,
  llmRequestStartTime,
  isRunning,
}: {
  tool: ToolCallInfo;
  t: any;
  llmRequestStartTime?: number | null;
  isRunning?: boolean;
}) {
  const start =
    tool.time?.start ??
    (llmRequestStartTime != null ? llmRequestStartTime : null);
  const showLive = !!isRunning && start != null;
  const [elapsed, setElapsed] = useState(() =>
    showLive
      ? Math.max(0, Math.floor((Date.now() - (start as number)) / 1000))
      : 0,
  );

  useEffect(() => {
    if (!showLive) return;
    const startedAt = start as number;
    const tick = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [showLive, start]);

  return (
    <ImageGenerationProgress
      providerLabel={getImageGenerationProviderLabel(tool)}
      elapsedLabel={
        showLive
          ? formatElapsed(elapsed)
          : isRunning
            ? t.agentMessage.working
            : null
      }
      t={t}
    />
  );
});

const GeneratedImageCard = memo(function GeneratedImageCard({
  image,
  vaultPath,
  t,
}: {
  image: GeneratedImageInfo;
  vaultPath: string | null;
  t: any;
}) {
  const sourcePath = useMemo(() => {
    if (image.absolutePath) return image.absolutePath;
    if (vaultPath && image.relativePath)
      return join(vaultPath, image.relativePath);
    return null;
  }, [image.absolutePath, image.relativePath, vaultPath]);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setError(null);
    if (!sourcePath) {
      setError(t.agentMessage.imageGeneratedMissingPath);
      return;
    }

    const load = async () => {
      try {
        const base64 = await readBinaryFileBase64(sourcePath);
        if (cancelled) return;
        const dataUrl = `data:${getImageMimeType(sourcePath)};base64,${base64}`;
        await new Promise<void>((resolve) => {
          const probe = new Image();
          probe.onload = () => resolve();
          probe.onerror = () => resolve();
          probe.src = dataUrl;
        });
        if (cancelled) return;
        setSrc(dataUrl);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [sourcePath, t.agentMessage.imageGeneratedMissingPath]);

  const providerLabel =
    image.providerLabel ??
    image.model ??
    image.provider ??
    t.agentMessage.imageGeneratedTitle;
  const title = t.ai.imageDirect.successTitle.replace(
    "{provider}",
    providerLabel,
  );

  const handleImageClick = useCallback(
    (event: MouseEvent<HTMLImageElement>) => {
      event.preventDefault();
      event.stopPropagation();
      void attachClickedImage(event.currentTarget);
    },
    [],
  );

  return (
    <motion.figure
      layout
      initial={{ opacity: 0, y: 10, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={
        src
          ? "mb-4 inline-block max-w-[28rem] align-top"
          : "mb-4 w-full max-w-[28rem]"
      }
    >
      <div
        className={
          src
            ? "relative inline-block max-w-full align-top"
            : "relative min-h-[14rem]"
        }
      >
        {src ? (
          <motion.img
            src={src}
            alt={title}
            title={t.agentMessage.imageGeneratedReuseHint}
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="block h-auto max-h-[50vh] max-w-full cursor-pointer rounded-[1.25rem] object-contain"
            onClick={handleImageClick}
          />
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-[1.35rem] bg-muted/35 p-6 text-center text-sm text-muted-foreground">
            <AlertTriangle size={20} />
            <span>{t.editor.imageLoadFailed}</span>
            <span className="max-w-full truncate text-xs opacity-70">
              {error}
            </span>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center rounded-[1.35rem] bg-muted/35 text-muted-foreground">
            <Loader2 size={22} className="animate-spin" />
          </div>
        )}
      </div>
    </motion.figure>
  );
});

/**
 * WorkSession：每轮里所有非文本/非 diff 的中间步骤的统一外壳。
 *
 * 设计要点：
 * - 默认折叠。用户只看到一行：呼吸点 + "Working · 0:42"（进行中）
 *   或 check + "5 步骤"（已完成）。
 * - 点开后展示组内的 ThinkingCollapsible / ToolCallCollapsible /
 *   分组折叠 —— 那些原本就独立可折叠的卡片留在原位，只是被一层
 *   外壳收起来不再明晃晃地堆在主流中。
 * - "进行中" 推断自里面的条目：任一思考还在 streaming 或工具还没
 *   出 result，整段就视为进行中。
 */
const WorkSession = memo(function WorkSession({
  items,
  t,
  llmRequestStartTime,
  isRunning,
}: {
  items: WorkItem[];
  t: any;
  llmRequestStartTime?: number | null;
  isRunning?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const stepCount = countWorkSteps(items);
  const inProgress = isWorkSessionInProgress(items);
  const timeRange = getSessionTimeRange(items);

  // For the live tick, prefer the earliest item's start (more accurate than
  // llmRequestStartTime, which represents the whole turn) and fall back to
  // llmRequestStartTime if no item carries timing data yet.
  const liveStart =
    timeRange.start ??
    (llmRequestStartTime != null ? llmRequestStartTime : null);
  const showLive = inProgress && !!isRunning && liveStart != null;

  const [elapsed, setElapsed] = useState(() =>
    showLive
      ? Math.max(0, Math.floor((Date.now() - (liveStart as number)) / 1000))
      : 0,
  );
  useEffect(() => {
    if (!showLive) return;
    const start = liveStart as number;
    const tick = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [showLive, liveStart]);

  // Once the session is fully done, derive duration from item timestamps.
  // Survives remount / scroll because the data lives in rawParts, unlike
  // the live useState clock.
  const finalDurationSec =
    !inProgress && timeRange.start !== null && timeRange.end !== null
      ? Math.max(0, Math.floor((timeRange.end - timeRange.start) / 1000))
      : null;

  const stepsLabel = (t.agentMessage.steps as string).replace(
    "{count}",
    String(stepCount),
  );

  let headerLabel: string;
  if (showLive) {
    headerLabel = `${t.agentMessage.working} · ${formatElapsed(elapsed)}`;
  } else if (finalDurationSec !== null) {
    headerLabel = `${formatElapsed(finalDurationSec)} · ${stepsLabel}`;
  } else {
    headerLabel = stepsLabel;
  }

  return (
    <div className="text-xs text-muted-foreground">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 hover:text-foreground transition-colors py-0.5 w-full text-left"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {showLive ? (
          <span className="streaming-dot" aria-hidden />
        ) : inProgress ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Check size={12} className="text-success" />
        )}
        <span>{headerLabel}</span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pl-5 py-1 space-y-1 border-l border-border ml-1.5">
              {items.map((item, i) => {
                const key = `work-${i}`;
                if (item.type === "thinking") {
                  return (
                    <ThinkingCollapsible
                      key={key}
                      thinking={item.content}
                      t={t}
                      status={item.status === "streaming" ? "thinking" : "done"}
                    />
                  );
                }
                if (item.type === "thinking_group") {
                  return (
                    <ThinkingGroupCollapsible
                      key={key}
                      items={item.items}
                      t={t}
                    />
                  );
                }
                if (item.type === "tool") {
                  return (
                    <ToolCallCollapsible key={key} tool={item.tool} t={t} />
                  );
                }
                if (item.type === "tool_group") {
                  return (
                    <ToolGroupCollapsible key={key} tools={item.tools} t={t} />
                  );
                }
                return null;
              })}
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
  onPromptLinkClick?: (prompt: string) => void;
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
  onPromptLinkClick,
  llmRequestStartTime,
  onRetryTimeout,
}: AgentMessageRendererProps) {
  // 使用可复用的超时检测 hook
  const { isTimeout: isLongRunning } = useTimeout(llmRequestStartTime ?? null, {
    threshold: TIMEOUT_THRESHOLD_MS,
    enabled: isRunning,
  });

  const handlePromptLinkClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!onPromptLinkClick) return;
      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || !event.currentTarget.contains(anchor)) return;

      const prompt = getPromptFromPromptLink(anchor);
      if (!prompt) return;

      event.preventDefault();
      event.stopPropagation();
      onPromptLinkClick(prompt);
    },
    [onPromptLinkClick],
  );

  const { pendingDiff, setPendingDiff, clearPendingEdits, diffResolver } =
    useAIStore();
  const openFile = useFileStore((state) => state.openFile);
  const vaultPath = useFileStore((state) => state.vaultPath);
  const { t } = useLocaleStore();

  const handleAcceptDiff = useCallback(async () => {
    if (!pendingDiff) return;

    try {
      await saveFile(pendingDiff.filePath, pendingDiff.modified);
      clearPendingEdits();
      await openFile(pendingDiff.filePath, {
        addToHistory: false,
        forceReload: true,
      });

      if (diffResolver) {
        diffResolver(true);
      }
    } catch (error) {
      console.error("Failed to apply edit:", error);
      alert(t.ai.applyEditFailed.replace("{error}", String(error)));
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
      assistantCopyText: string;
      roundKey: string;
      hasAIContent: boolean;
    }> = [];
    let pendingDiffInserted = false;

    // 找到所有用户消息的索引
    const userMessageIndices: number[] = [];
    messages.forEach((msg, idx) => {
      if (
        msg.role === "user" &&
        !shouldSkipUserMessage(getTextFromContent(msg.content))
      ) {
        userMessageIndices.push(idx);
      }
    });

    userMessageIndices.forEach((userIdx, roundIndex) => {
      const userMsg = messages[userIdx];
      const normalizedUserMessage = getUserMessageDisplay(
        userMsg.content,
        userMsg.attachments,
      );
      const userImages = getImagesFromContent(userMsg.content);
      const displayContent = cleanUserMessage(normalizedUserMessage.text);

      if (
        !displayContent &&
        normalizedUserMessage.attachments.length === 0 &&
        userImages.length === 0
      )
        return;

      const nextUserIdx = userMessageIndices[roundIndex + 1] ?? messages.length;
      const parts: TimelinePart[] = [];
      const lastToolCall = { current: null as ToolCallInfo | null };
      let lastEditNoteIndex = -1;

      for (let msgIdx = userIdx + 1; msgIdx < nextUserIdx; msgIdx++) {
        const msg = messages[msgIdx];
        const content = getTextFromContent(msg.content);

        // Opencode-backed path: messages carry structured rawParts. Map them
        // 1:1 to timeline entries and skip the legacy string/emoji parsing
        // entirely, which otherwise produces zero entries (opencode never
        // emits `🔧 name:` prefixes).
        if (msg.rawParts && msg.rawParts.length > 0) {
          parts.push(...timelineFromOpencodeParts(msg.rawParts));
          continue;
        }

        if (msg.role === "assistant") {
          appendPartsFromContent(content, parts, lastToolCall, true);
          continue;
        }

        if (msg.role === "tool") {
          const parsed = parseToolMessage(content);
          if (parsed) {
            if (
              !parsed.isStart &&
              lastToolCall.current &&
              lastToolCall.current.name === parsed.tool.name &&
              !lastToolCall.current.result
            ) {
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
          parts.splice(lastEditNoteIndex + 1, 0, {
            type: "diff",
            diff: pendingDiff,
          });
          pendingDiffInserted = true;
        } else if (roundIndex === userMessageIndices.length - 1) {
          parts.push({ type: "diff", diff: pendingDiff });
          pendingDiffInserted = true;
        }
      }

      // 使用用户消息索引作为稳定且唯一的 key
      const roundKey = `round-${userIdx}`;

      // 三层折叠（外层 → 内层）：
      // 1. 同类聚合：工具≥3 / 思考≥2 合并成对应分组
      // 2. WorkSession：所有非文本/非 diff 的中间步骤打包成一个折叠条
      //    这样用户默认只看到一条 "Working · mm:ss"，点开才看分组，
      //    分组再点开看条目，条目再点开看正文（参数/思考内容）。
      // pendingDiff 在前面已插入，会自然把 work_session 切成前后两段。
      let collapsedParts = collapseConsecutiveTools(parts);
      collapsedParts = collapseConsecutiveThinking(collapsedParts);
      collapsedParts = insertImageGenerationProgressParts(collapsedParts);
      collapsedParts = bundleWorkSessions(collapsedParts);

      // 判断是否有 AI 回复内容
      const hasAIContent = collapsedParts.length > 0;

      result.push({
        userIdx,
        userContent: displayContent,
        userAttachments: normalizedUserMessage.attachments,
        userImages,
        diagramPaths: getDiagramAttachmentFilePaths(
          normalizedUserMessage.attachments,
        ),
        parts: collapsedParts,
        assistantCopyText: getAssistantCopyText(collapsedParts),
        roundKey,
        hasAIContent,
      });
    });

    return result;
  }, [messages, pendingDiff]);

  return (
    <div className={className} onClick={handlePromptLinkClick}>
      <AnimatePresence initial={false}>
        {rounds.map((round) => (
          <motion.div
            key={round.roundKey}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0.9, 0.1, 1] }}
            layout="position"
          >
            {/* 用户消息 */}
            <div className="flex justify-end mb-5">
              <div className="flex max-w-[80%] flex-col items-end gap-1">
                <div className="rounded-ui-xl rounded-tr-ui-sm border border-border/60 bg-muted px-4 py-3 text-[15px] leading-relaxed text-foreground">
                  <UserMessageBubbleContent
                    text={round.userContent}
                    attachments={round.userAttachments}
                    images={round.userImages}
                  />
                </div>
                {round.userContent.trim().length > 0 && (
                  <CopyButton
                    text={round.userContent}
                    className="opacity-70 hover:opacity-100"
                  />
                )}
              </div>
            </div>

            {/* AI 回复 - 只有在有内容时才显示 */}
            {round.hasAIContent && (
              <div className="flex gap-3 mb-6">
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
                      if (part.type === "work_session") {
                        return (
                          <WorkSession
                            key={key}
                            items={part.items}
                            t={t}
                            llmRequestStartTime={llmRequestStartTime}
                            isRunning={isRunning}
                          />
                        );
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
                      if (part.type === "generated_image") {
                        return (
                          <GeneratedImageCard
                            key={key}
                            image={part.image}
                            vaultPath={vaultPath}
                            t={t}
                          />
                        );
                      }
                      if (part.type === "image_generation_progress") {
                        return (
                          <ImageGenerationToolProgress
                            key={key}
                            tool={part.tool}
                            t={t}
                            llmRequestStartTime={llmRequestStartTime}
                            isRunning={isRunning}
                          />
                        );
                      }
                      if (part.type === "text") {
                        const generatingProvider = parseImageGeneratingMarker(
                          part.content,
                        );
                        if (generatingProvider) {
                          return (
                            <ImageGenerationProgress
                              key={key}
                              providerLabel={generatingProvider}
                              elapsedLabel={
                                isRunning ? t.agentMessage.working : null
                              }
                              t={t}
                            />
                          );
                        }
                        const generatedImage = parseGeneratedImageMarker(
                          part.content,
                        );
                        if (generatedImage) {
                          return (
                            <GeneratedImageCard
                              key={key}
                              image={generatedImage}
                              vaultPath={vaultPath}
                              t={t}
                            />
                          );
                        }
                        const isFinalText = partIndex === lastTextIndex;
                        return (
                          <div
                            key={key}
                            onClick={handleAssistantContentClick}
                            className={[
                              "chat-attach-images",
                              isFinalText
                                ? "prose dark:prose-invert max-w-none leading-relaxed text-base font-medium"
                                : "prose prose-sm dark:prose-invert max-w-none leading-relaxed",
                            ].join(" ")}
                            dangerouslySetInnerHTML={{
                              __html: parseMarkdown(
                                formatMarkdownContent(part.content),
                              ),
                            }}
                          />
                        );
                      }
                      return null;
                    });
                  })()}
                  {round.assistantCopyText.trim().length > 0 && (
                    <div className="flex items-center">
                      <CopyButton
                        text={round.assistantCopyText}
                        className="opacity-70 hover:opacity-100"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* 超时提示 */}
      {isRunning && isLongRunning && onRetryTimeout && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 px-3 py-2 bg-warning/10 border border-warning/30 rounded-lg text-warning text-sm mt-2"
        >
          <AlertTriangle size={16} className="shrink-0" />
          <span>{t.agentMessage.timeoutWarning}</span>
          <button
            onClick={onRetryTimeout}
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-warning/20 hover:bg-warning/30 rounded-md transition-colors font-medium"
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
export function CopyButton({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const { t } = useLocaleStore();
  const [copied, setCopied] = useState(false);

  const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.warn("Failed to copy message:", error);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${className}`}
      title={t.agentMessage.copy}
      aria-label={t.agentMessage.copy}
    >
      {copied ? (
        <Check size={14} className="text-success" />
      ) : (
        <Copy size={14} />
      )}
    </button>
  );
}

export default AgentMessageRenderer;
