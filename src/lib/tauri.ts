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
};

export type TypesettingTextLayout = {
  lines: TypesettingTextLine[];
};

export async function getTypesettingPreviewPageMm(): Promise<TypesettingPreviewPageMm> {
  return invoke<TypesettingPreviewPageMm>("typesetting_preview_page_mm");
}

export async function getTypesettingFixtureFontPath(): Promise<string | null> {
  return invoke<string | null>("typesetting_fixture_font_path");
}

export async function getTypesettingLayoutText(params: {
  text: string;
  fontPath: string;
  maxWidth: number;
  lineHeight: number;
}): Promise<TypesettingTextLayout> {
  return invoke<TypesettingTextLayout>("typesetting_layout_text", {
    text: params.text,
    font_path: params.fontPath,
    max_width: params.maxWidth,
    line_height: params.lineHeight,
  });
}

export async function getTypesettingExportPdfBase64(): Promise<string> {
  return invoke<string>("typesetting_export_pdf_base64");
}

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
