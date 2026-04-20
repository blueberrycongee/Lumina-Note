/**
 * Host facade — the renderer's single entry point for talking to the main
 * process. Low-level invoke/listen/Channel/Resource live in
 * `src/lib/hostBridge.ts`, which is the alias target for the last
 * `@tauri-apps/*` identifiers that transitive code still references.
 */

import { invoke } from "./hostBridge";
import type { SkillDetail, SkillInfo } from "@/types/skills";
import type { PluginEntry, PluginInfo } from "@/types/plugins";

// Re-export bridge primitives so call sites that imported from
// `@/lib/tauri` (isTauriAvailable, getVersion, listen, Channel, Resource, ...)
// keep a single `@/lib/host` entry point.
export {
  invoke,
  isTauri,
  isTauriAvailable,
  listen,
  getVersion,
  transformCallback,
  Channel,
  Resource,
  SERIALIZE_TO_IPC_FN,
} from "./hostBridge";
export type { InvokeArgs, TauriInternals, UnlistenFn } from "./hostBridge";

// ── File system helpers (formerly src/lib/tauri.ts) ───────────────────────

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  isDirectory?: boolean;
  size?: number | null;
  modified_at?: number | null;
  created_at?: number | null;
  children: FileEntry[] | null;
}

export type DialogFilter = {
  name: string;
  extensions: string[];
};

export type OpenDialogOptions = {
  filters?: DialogFilter[];
  multiple?: boolean;
  directory?: boolean;
  defaultPath?: string;
  title?: string;
};

export async function readFile(path: string): Promise<string> {
  return invoke<string>("read_file", { path });
}

export async function saveFile(path: string, content: string): Promise<void> {
  return invoke("save_file", { path, content });
}

export async function writeBinaryFile(
  path: string,
  data: Uint8Array,
): Promise<void> {
  return invoke("write_binary_file", { path, data: Array.from(data) });
}

export async function readBinaryFileBase64(path: string): Promise<string> {
  return invoke<string>("read_binary_file_base64", { path });
}

export async function listDirectory(path: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>("list_directory", { path });
}

export async function createFile(path: string): Promise<void> {
  return invoke("create_file", { path });
}

export async function deleteFile(path: string): Promise<void> {
  return invoke("delete_file", { path });
}

export async function renameFile(
  oldPath: string,
  newPath: string,
): Promise<void> {
  return invoke("rename_file", { oldPath, newPath });
}

export async function writeFile(path: string, content: string): Promise<void> {
  return saveFile(path, content);
}

export async function exists(path: string): Promise<boolean> {
  return invoke<boolean>("path_exists", { path });
}

export async function openDialog(
  options: OpenDialogOptions = {},
): Promise<string | string[] | null> {
  return invoke<string | string[] | null>("plugin:dialog|open", { options });
}

export async function createDir(
  path: string,
  options?: { recursive?: boolean },
): Promise<void> {
  if (options?.recursive) {
    const alreadyExists = await invoke<boolean>("path_exists", { path });
    if (alreadyExists) return;
  }
  return invoke("create_dir", { path });
}

export async function readDir(
  path: string,
  options?: { recursive?: boolean },
): Promise<FileEntry[]> {
  if (options?.recursive) {
    return listDirectory(path);
  }

  const entries = await invoke<Array<{ name: string; isDirectory: boolean }>>(
    "plugin:fs|read_dir",
    { path },
  );
  return entries.map((entry) => ({
    name: entry.name,
    path: `${path}/${entry.name}`,
    is_dir: entry.isDirectory,
    isDirectory: entry.isDirectory,
    size: null,
    modified_at: null,
    created_at: null,
    children: null,
  }));
}

export async function rename(oldPath: string, newPath: string): Promise<void> {
  return invoke("plugin:fs|rename", { from: oldPath, to: newPath });
}

// ── plugin-fs-compatible helpers (binary/text IO + stat) ──────────────────
export interface FileStat {
  size: number;
  mtime: Date | null;
  atime: Date | null;
  birthtime: Date | null;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
}

export async function readBinaryFile(path: string): Promise<Uint8Array> {
  const raw = await invoke<number[] | Uint8Array>("plugin:fs|read_file", { path });
  return raw instanceof Uint8Array ? raw : new Uint8Array(raw);
}

export async function writeTextFile(
  path: string,
  contents: string,
): Promise<void> {
  return invoke("plugin:fs|write_text_file", { path, contents });
}

export async function fsStat(path: string): Promise<FileStat> {
  const raw = await invoke<{
    size: number;
    mtime: string | number | null;
    atime: string | number | null;
    birthtime: string | number | null;
    isFile: boolean;
    isDirectory: boolean;
    isSymlink: boolean;
  }>("plugin:fs|stat", { path });
  const toDate = (v: string | number | null): Date | null => {
    if (v == null) return null;
    const d = typeof v === "number" ? new Date(v) : new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  };
  return {
    size: raw.size,
    mtime: toDate(raw.mtime),
    atime: toDate(raw.atime),
    birthtime: toDate(raw.birthtime),
    isFile: raw.isFile,
    isDirectory: raw.isDirectory,
    isSymlink: raw.isSymlink,
  };
}

// ── plugin-dialog save ────────────────────────────────────────────────────
export type SaveDialogOptions = {
  filters?: DialogFilter[];
  defaultPath?: string;
  title?: string;
};

export async function saveDialog(
  options: SaveDialogOptions = {},
): Promise<string | null> {
  return invoke<string | null>("plugin:dialog|save", { options });
}

// ── plugin-os ─────────────────────────────────────────────────────────────
export async function platform(): Promise<NodeJS.Platform> {
  return invoke<NodeJS.Platform>("plugin:os|platform");
}

// ── plugin-process ────────────────────────────────────────────────────────
export async function relaunch(): Promise<void> {
  return invoke("plugin:process|relaunch");
}

export async function setWindowSize(
  width: number,
  height: number,
): Promise<void> {
  return invoke("plugin:window|set_size", { width, height });
}

// ── plugin-shell ──────────────────────────────────────────────────────────
export async function openExternal(url: string): Promise<void> {
  return invoke("plugin:shell|open", { path: url });
}

// ── plugin-updater ────────────────────────────────────────────────────────
export interface UpdateCheckResult {
  available: boolean;
  version: string;
  body: string | null;
  date: string | null;
  /**
   * Legacy Tauri handle; only populated when running under Tauri. Electron
   * drives installs through the resumable IPCs (`startResumableInstall`) so
   * this function is never called at runtime on Electron.
   */
  downloadAndInstall: (
    onEvent?: (e: {
      event: string;
      data?: { contentLength?: number; chunkLength?: number };
    }) => void,
    options?: { timeout?: number },
  ) => Promise<void>;
}
export type Update = UpdateCheckResult;

// ── Window controls ──────────────────────────────────────────────────────
// Stubs that match @tauri-apps/api/window's surface. All consumers gate
// their usage with isTauri(), which returns false in the Electron renderer,
// so these methods are never actually executed today. They exist purely to
// keep imports resolvable without pulling @tauri-apps/api as a dep.
export interface HostWindow {
  isMaximized(): Promise<boolean>;
  onResized(cb: () => void): Promise<() => void>;
  startDragging(): Promise<void>;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
}
export type Window = HostWindow;

export function getCurrentWindow(): HostWindow {
  return {
    async isMaximized() { return false; },
    async onResized() { return () => {}; },
    async startDragging() { /* no-op */ },
    async minimize() { /* no-op */ },
    async toggleMaximize() { /* no-op */ },
    async close() { /* no-op */ },
  };
}

export async function check(
  _options?: { timeout?: number },
): Promise<Update | null> {
  const result = await invoke<
    | { available: boolean; version: string; body: string | null; date: string | null }
    | null
  >("plugin:updater|check");
  if (!result) return null;
  return {
    ...result,
    available: result.available ?? true,
    async downloadAndInstall() {
      // Legacy Tauri fallback — no-op on Electron. Resumable IPCs handle installs.
      throw new Error(
        "downloadAndInstall is not available on Electron; use startResumableInstall instead.",
      );
    },
  };
}

export async function moveFile(
  sourcePath: string,
  targetFolder: string,
): Promise<string> {
  return invoke<string>("move_file", { source: sourcePath, targetFolder });
}

export async function moveFolder(
  sourcePath: string,
  targetFolder: string,
): Promise<string> {
  return invoke<string>("move_folder", { source: sourcePath, targetFolder });
}

export async function showInExplorer(path: string): Promise<void> {
  return invoke("show_in_explorer", { path });
}

export async function openNewWindow(): Promise<void> {
  return invoke("open_new_window");
}

// ── Agent skills ──────────────────────────────────────────────────────────

export async function listAgentSkills(
  workspacePath?: string,
): Promise<SkillInfo[]> {
  return invoke("agent_list_skills", { workspace_path: workspacePath });
}

export async function readAgentSkill(
  name: string,
  workspacePath?: string,
): Promise<SkillDetail> {
  return invoke("agent_read_skill", { name, workspace_path: workspacePath });
}

// ── Plugin ecosystem ──────────────────────────────────────────────────────

export async function listPlugins(
  workspacePath?: string,
): Promise<PluginInfo[]> {
  return invoke("plugin_list", { workspacePath });
}

export async function readPluginEntry(
  pluginId: string,
  workspacePath?: string,
): Promise<PluginEntry> {
  return invoke("plugin_read_entry", { pluginId, workspacePath });
}

export async function getWorkspacePluginDir(): Promise<string> {
  return invoke("plugin_get_workspace_dir");
}

export async function scaffoldWorkspaceExamplePlugin(): Promise<string> {
  return invoke("plugin_scaffold_example");
}

export async function scaffoldWorkspaceThemePlugin(): Promise<string> {
  return invoke("plugin_scaffold_theme");
}

export async function scaffoldWorkspaceUiOverhaulPlugin(): Promise<string> {
  return invoke("plugin_scaffold_ui_overhaul");
}

// ── Misc ──────────────────────────────────────────────────────────────────

export async function startFileWatcher(watchPath: string): Promise<void> {
  return invoke("start_file_watcher", { watchPath });
}

// ── plugin:path helpers (formerly @tauri-apps/api/path) ────────────────────
export async function homeDir(): Promise<string> {
  return invoke<string>("plugin:path|home_dir");
}

export async function tempDir(): Promise<string> {
  return invoke<string>("plugin:path|temp_dir");
}

export async function join(...parts: string[]): Promise<string> {
  return invoke<string>("plugin:path|join", { parts });
}

export async function estimateDirSize(
  path: string,
): Promise<{ topLevelCount: number; isSystemDir: boolean; warning: boolean }> {
  return invoke("estimate_dir_size", { path });
}
