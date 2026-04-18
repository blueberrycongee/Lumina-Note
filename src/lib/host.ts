/**
 * Host facade — the renderer's single entry point for talking to the main
 * process. Replaces `src/lib/tauri.ts`. Low-level invoke/listen/Channel/
 * Resource live in `src/lib/hostBridge.ts`; this file imports them via the
 * aliased `@tauri-apps/api/core` specifier so existing
 * `vi.mock('@tauri-apps/api/core', ...)` tests keep working.
 */

import { invoke } from "@tauri-apps/api/core";
import type { SkillDetail, SkillInfo } from "@/types/skills";
import type { PluginEntry, PluginInfo } from "@/types/plugins";
import {
  readDir as tauriReadDir,
  rename as tauriRename,
} from "@tauri-apps/plugin-fs";

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

  const entries = await tauriReadDir(path);
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
  return tauriRename(oldPath, newPath);
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

export async function estimateDirSize(
  path: string,
): Promise<{ topLevelCount: number; isSystemDir: boolean; warning: boolean }> {
  return invoke("estimate_dir_size", { path });
}
