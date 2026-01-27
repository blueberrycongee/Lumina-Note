import { invoke } from "@tauri-apps/api/core";
import {
  exists as tauriExists,
  readDir as tauriReadDir,
  rename as tauriRename,
} from "@tauri-apps/plugin-fs";

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  isDirectory?: boolean; // Alias
  children: FileEntry[] | null;
}

/**
 * Read file content from disk
 */
export async function readFile(path: string): Promise<string> {
  return invoke<string>("read_file", { path });
}

/**
 * Save file content to disk
 */
export async function saveFile(path: string, content: string): Promise<void> {
  return invoke("save_file", { path, content });
}

/**
 * Write binary file to disk (for images, etc.)
 */
export async function writeBinaryFile(path: string, data: Uint8Array): Promise<void> {
  return invoke("write_binary_file", { path, data: Array.from(data) });
}

/**
 * Read binary file and return as base64 string
 */
export async function readBinaryFileBase64(path: string): Promise<string> {
  return invoke<string>("read_binary_file_base64", { path });
}

export type TypesettingPreviewBoxMm = {
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
};

export type TypesettingPreviewPageMm = {
  page: TypesettingPreviewBoxMm;
  body: TypesettingPreviewBoxMm;
  header: TypesettingPreviewBoxMm;
  footer: TypesettingPreviewBoxMm;
};

export type TypesettingTextLine = {
  start: number;
  end: number;
  width: number;
  x_offset: number;
  y_offset: number;
  start_byte: number;
  end_byte: number;
};

export type TypesettingTextLayout = {
  lines: TypesettingTextLine[];
};

export type TypesettingParagraphAlign = "left" | "right" | "center" | "justify";

export const isTauriAvailable = (): boolean => {
  if (typeof window === "undefined") return false;
  const tauriInvoke = (window as typeof window & {
    __TAURI__?: { core?: { invoke?: (...args: unknown[]) => unknown } };
  }).__TAURI__?.core?.invoke;
  return typeof tauriInvoke === "function";
};

const invokeTypesetting = async <T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> => {
  if (!isTauriAvailable()) {
    throw new Error("Tauri invoke unavailable");
  }
  try {
    return await invoke<T>(command, args);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Typesetting command ${command} failed: ${message}`);
  }
};

export async function getTypesettingPreviewPageMm(): Promise<TypesettingPreviewPageMm> {
  return invokeTypesetting<TypesettingPreviewPageMm>(
    "typesetting_preview_page_mm",
  );
}

export async function getTypesettingFixtureFontPath(): Promise<string | null> {
  return invokeTypesetting<string | null>("typesetting_fixture_font_path");
}

export async function getTypesettingLayoutText(params: {
  text: string;
  fontPath: string;
  maxWidth: number;
  lineHeight: number;
  fontSize?: number;
  align?: TypesettingParagraphAlign;
  firstLineIndent?: number;
  spaceBefore?: number;
  spaceAfter?: number;
  fontFamily?: string;
  tabStops?: number[];
  defaultTabStop?: number;
}): Promise<TypesettingTextLayout> {
  const clampPositiveInt = (value: number, fallback: number) => {
    if (!Number.isFinite(value)) return fallback;
    const rounded = Math.round(value);
    return rounded > 0 ? rounded : fallback;
  };
  const clampInt = (value: number, fallback: number) => {
    if (!Number.isFinite(value)) return fallback;
    return Math.round(value);
  };

  const {
    text,
    fontPath,
    maxWidth,
    lineHeight,
    fontSize,
    align = "left",
    firstLineIndent = 0,
    spaceBefore = 0,
    spaceAfter = 0,
    fontFamily,
    tabStops,
    defaultTabStop,
  } = params;
  void tabStops;
  void defaultTabStop;
  const safeMaxWidth = clampPositiveInt(maxWidth, 1);
  const safeLineHeight = clampPositiveInt(lineHeight, 1);
  const safeFirstLineIndent = clampInt(firstLineIndent, 0);
  const safeSpaceBefore = clampInt(spaceBefore, 0);
  const safeSpaceAfter = clampInt(spaceAfter, 0);
  if (!isTauriAvailable()) {
    return layoutTextInBrowser({
      text,
      maxWidth: safeMaxWidth,
      lineHeight: safeLineHeight,
      fontSize: fontSize ?? 16,
      align,
      firstLineIndent: safeFirstLineIndent,
      spaceBefore: safeSpaceBefore,
      spaceAfter: safeSpaceAfter,
      fontFamily,
    });
  }
  const args: Record<string, unknown> = {
    text,
    fontPath,
    maxWidth: safeMaxWidth,
    lineHeight: safeLineHeight,
    align,
    firstLineIndent: safeFirstLineIndent,
    spaceBefore: safeSpaceBefore,
    spaceAfter: safeSpaceAfter,
  };
  if (fontSize !== undefined) {
    args.fontSize = fontSize;
  }
  return invokeTypesetting<TypesettingTextLayout>("typesetting_layout_text", args);
}

export async function getTypesettingExportPdfBase64(): Promise<string> {
  return invokeTypesetting<string>("typesetting_export_pdf_base64");
}

const buildTokens = (text: string): string[] => {
  if (!text) return [];
  const hasCjk = /[\u4e00-\u9fff]/.test(text);
  const rawTokens = hasCjk
    ? Array.from(text)
    : text.split(/(\s+)/).filter((token) => token.length > 0);
  const tokens: string[] = [];
  for (const token of rawTokens) {
    if (token.includes("\n")) {
      const parts = token.split(/(\n)/);
      for (const part of parts) {
        if (part === "") continue;
        tokens.push(part);
      }
    } else {
      tokens.push(token);
    }
  }
  return tokens;
};

const layoutTextInBrowser = async (params: {
  text: string;
  maxWidth: number;
  lineHeight: number;
  fontSize: number;
  align: TypesettingParagraphAlign;
  firstLineIndent: number;
  spaceBefore: number;
  spaceAfter: number;
  fontFamily?: string;
}): Promise<TypesettingTextLayout> => {
  if (typeof document === "undefined") {
    return { lines: [] };
  }

  const {
    text,
    maxWidth,
    lineHeight,
    fontSize,
    align,
    firstLineIndent,
    spaceBefore,
    fontFamily,
  } = params;
  const canvas = document.createElement("canvas");
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext("2d");
  } catch {
    return { lines: [] };
  }
  if (!ctx) {
    return { lines: [] };
  }
  ctx.font = `${fontSize}px ${fontFamily ?? "sans-serif"}`;

  const encoder = new TextEncoder();
  const tokens = buildTokens(text);
  const lines: TypesettingTextLine[] = [];
  let current = "";
  let currentWidth = 0;
  let lineIndex = 0;
  let lineStartByte = 0;
  let lineBytes = 0;
  let cursorBytes = 0;

  const pushLine = (lineText: string, lineWidth: number) => {
    if (lineText.length === 0) return;
    const indent = lineIndex === 0 ? firstLineIndent : 0;
    const available = Math.max(0, maxWidth - indent);
    let xOffset = indent;
    if (align === "center") {
      xOffset = indent + Math.max(0, (available - lineWidth) / 2);
    } else if (align === "right") {
      xOffset = indent + Math.max(0, available - lineWidth);
    }
    const yOffset = Math.max(0, spaceBefore) + lineIndex * lineHeight;
    lines.push({
      start: 0,
      end: 0,
      width: Math.round(lineWidth),
      x_offset: Math.round(xOffset),
      y_offset: Math.round(yOffset),
      start_byte: lineStartByte,
      end_byte: lineStartByte + lineBytes,
    });
    lineIndex += 1;
    current = "";
    currentWidth = 0;
    lineStartByte = cursorBytes;
    lineBytes = 0;
  };

  for (const token of tokens) {
    if (token === "\n") {
      pushLine(current, currentWidth);
      const tokenBytes = encoder.encode(token).length;
      cursorBytes += tokenBytes;
      lineStartByte = cursorBytes;
      lineBytes = 0;
      continue;
    }

    const tokenWidth = ctx.measureText(token).width;
    const indent = lineIndex === 0 ? firstLineIndent : 0;
    const available = Math.max(0, maxWidth - indent);
    if (current.length > 0 && currentWidth + tokenWidth > available) {
      pushLine(current, currentWidth);
    }
    current += token;
    currentWidth += tokenWidth;
    const tokenBytes = encoder.encode(token).length;
    cursorBytes += tokenBytes;
    lineBytes += tokenBytes;
  }

  if (current.length > 0) {
    pushLine(current, currentWidth);
  }

  return { lines };
};

/**
 * List directory contents (recursive, .md files only)
 */
export async function listDirectory(path: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>("list_directory", { path });
}

/**
 * Create a new file
 */
export async function createFile(path: string): Promise<void> {
  return invoke("create_file", { path });
}

/**
 * Delete a file or directory
 */
export async function deleteFile(path: string): Promise<void> {
  return invoke("delete_file", { path });
}

/**
 * Rename/move a file
 */
export async function renameFile(
  oldPath: string,
  newPath: string
): Promise<void> {
  return invoke("rename_file", { oldPath, newPath });
}

// ============ Additional exports for Agent system ============

/**
 * Write content to a file (alias for saveFile)
 */
export async function writeFile(path: string, content: string): Promise<void> {
  return saveFile(path, content);
}

/**
 * Check if a file or directory exists
 */
export async function exists(path: string): Promise<boolean> {
  return tauriExists(path);
}

/**
 * Create a directory
 */
export async function createDir(
  path: string,
  _options?: { recursive?: boolean }
): Promise<void> {
  // 使用自定义 Rust 命令而非 tauri-plugin-fs，避免 scope 限制
  return invoke("create_dir", { path });
}

/**
 * Read directory contents
 */
export async function readDir(
  path: string,
  options?: { recursive?: boolean }
): Promise<FileEntry[]> {
  // Use our custom list_directory for recursive, or tauri-fs for non-recursive
  if (options?.recursive) {
    return listDirectory(path);
  }
  
  const entries = await tauriReadDir(path);
  return entries.map((entry) => ({
    name: entry.name,
    path: `${path}/${entry.name}`,
    is_dir: entry.isDirectory,
    isDirectory: entry.isDirectory,
    children: null,
  }));
}

/**
 * Rename/move a file or directory
 */
export async function rename(oldPath: string, newPath: string): Promise<void> {
  return tauriRename(oldPath, newPath);
}

/**
 * Move a file to a target folder
 * Returns the new path of the moved file
 */
export async function moveFile(sourcePath: string, targetFolder: string): Promise<string> {
  return invoke<string>("move_file", { source: sourcePath, targetFolder });
}

/**
 * Move a folder to a target folder
 * Returns the new path of the moved folder
 */
export async function moveFolder(sourcePath: string, targetFolder: string): Promise<string> {
  return invoke<string>("move_folder", { source: sourcePath, targetFolder });
}

/**
 * Open a new window
 */
export async function openNewWindow(): Promise<void> {
  return invoke("open_new_window");
}

/**
 * Start file system watcher for a directory
 * Emits "fs:change" events when files are created, modified, or deleted
 */
export async function startFileWatcher(watchPath: string): Promise<void> {
  return invoke("start_file_watcher", { watchPath });
}
