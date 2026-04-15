import fs from "fs";
import path from "path";
import { shell } from "electron";

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  isDirectory: boolean;
  size: number | null;
  modified_at: number | null;
  created_at: number | null;
  children: FileEntry[] | null;
}

// Directories to always skip during recursive listing (aligned with Tauri side)
const IGNORED_DIRS = new Set(["node_modules", "target", ".git"]);

function shouldSkipEntry(name: string): boolean {
  if (IGNORED_DIRS.has(name)) return true;
  // Skip hidden files/dirs, but keep .lumina (app config)
  if (name.startsWith(".") && name !== ".lumina") return true;
  return false;
}

async function listDirRecursive(dirPath: string): Promise<FileEntry[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch (err: unknown) {
    // Gracefully handle permission errors and EMFILE — return empty instead of crashing
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EPERM" || code === "EACCES" || code === "EMFILE") {
      return [];
    }
    throw err;
  }

  const result: FileEntry[] = [];
  for (const entry of entries) {
    if (shouldSkipEntry(entry.name)) continue;

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const children = await listDirRecursive(fullPath);
      result.push({
        name: entry.name,
        path: fullPath,
        is_dir: true,
        isDirectory: true,
        size: null,
        modified_at: null,
        created_at: null,
        children,
      });
    } else {
      let stat: fs.Stats | null = null;
      try {
        stat = await fs.promises.stat(fullPath);
      } catch {}
      result.push({
        name: entry.name,
        path: fullPath,
        is_dir: false,
        isDirectory: false,
        size: stat?.size ?? null,
        modified_at: stat ? Math.floor(stat.mtimeMs) : null,
        created_at: stat ? Math.floor(stat.birthtimeMs) : null,
        children: null,
      });
    }
  }

  // Sort: directories first, then files, alphabetically
  result.sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return result;
}

export const fsHandlers: Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
> = {
  async read_file({ path: p }) {
    return fs.promises.readFile(p as string, "utf-8");
  },

  async save_file({ path: p, content }) {
    await fs.promises.writeFile(p as string, content as string, "utf-8");
  },

  async write_binary_file({ path: p, data }) {
    const bytes = data as number[];
    await fs.promises.writeFile(p as string, Buffer.from(bytes));
  },

  async read_binary_file_base64({ path: p }) {
    const buf = await fs.promises.readFile(p as string);
    return buf.toString("base64");
  },

  async list_directory({ path: p }) {
    return listDirRecursive(p as string);
  },

  async create_file({ path: p }) {
    await fs.promises.mkdir(path.dirname(p as string), { recursive: true });
    await fs.promises.writeFile(p as string, "", "utf-8");
  },

  async delete_file({ path: p }) {
    await fs.promises.rm(p as string, { recursive: true, force: true });
  },

  async rename_file({ oldPath, newPath }) {
    await fs.promises.rename(oldPath as string, newPath as string);
  },

  async path_exists({ path: p }) {
    try {
      await fs.promises.access(p as string);
      return true;
    } catch {
      return false;
    }
  },

  async create_dir({ path: p }) {
    await fs.promises.mkdir(p as string, { recursive: true });
  },

  async move_file({ source, targetFolder }) {
    const name = path.basename(source as string);
    const dest = path.join(targetFolder as string, name);
    await fs.promises.rename(source as string, dest);
    return dest;
  },

  async move_folder({ source, targetFolder }) {
    const name = path.basename(source as string);
    const dest = path.join(targetFolder as string, name);
    await fs.promises.rename(source as string, dest);
    return dest;
  },

  async show_in_explorer({ path: p }) {
    shell.showItemInFolder(p as string);
  },

  // ── @tauri-apps/plugin-fs plugin commands ──────────────────────────────
  async "plugin:fs|read_file"({ path: p }) {
    const buf = await fs.promises.readFile(p as string);
    return Array.from(buf);
  },

  async "plugin:fs|read_text_file"({ path: p }) {
    return fs.promises.readFile(p as string, "utf-8");
  },

  async "plugin:fs|write_file"({ path: p, contents }) {
    const data =
      contents instanceof Uint8Array
        ? contents
        : Buffer.from(contents as number[]);
    await fs.promises.writeFile(p as string, data);
  },

  async "plugin:fs|write_text_file"({ path: p, contents }) {
    await fs.promises.writeFile(p as string, contents as string, "utf-8");
  },

  async "plugin:fs|read_dir"({ path: p }) {
    const entries = await fs.promises.readdir(p as string, {
      withFileTypes: true,
    });
    return entries.map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      isFile: e.isFile(),
      isSymlink: e.isSymbolicLink(),
    }));
  },

  async "plugin:fs|exists"({ path: p }) {
    try {
      await fs.promises.access(p as string);
      return true;
    } catch {
      return false;
    }
  },

  async "plugin:fs|rename"({ from: f, to: t }) {
    await fs.promises.rename(f as string, t as string);
  },

  async "plugin:fs|remove"({ path: p }) {
    await fs.promises.rm(p as string, { recursive: true, force: true });
  },

  async "plugin:fs|create_dir"({ path: p }) {
    await fs.promises.mkdir(p as string, { recursive: true });
  },

  async "plugin:fs|mkdir"({ path: p, options }) {
    const opts = options as { recursive?: boolean } | undefined;
    await fs.promises.mkdir(p as string, {
      recursive: opts?.recursive ?? false,
    });
  },

  async "plugin:fs|stat"({ path: p }) {
    const s = await fs.promises.stat(p as string);
    return {
      size: s.size,
      isDirectory: s.isDirectory(),
      isFile: s.isFile(),
      isSymlink: s.isSymbolicLink(),
      mtime: s.mtimeMs,
      atime: s.atimeMs,
      ctime: s.birthtimeMs,
      readonly: false,
    };
  },

  async "plugin:fs|lstat"({ path: p }) {
    const s = await fs.promises.lstat(p as string);
    return {
      size: s.size,
      isDirectory: s.isDirectory(),
      isFile: s.isFile(),
      isSymlink: s.isSymbolicLink(),
      mtime: s.mtimeMs,
      atime: s.atimeMs,
      ctime: s.birthtimeMs,
      readonly: false,
    };
  },

  async "plugin:fs|copy_file"({ from: f, to: t }) {
    await fs.promises.copyFile(f as string, t as string);
  },

  // ── Extra commands used by renderer ────────────────────────────────────
  async write_text_file({ path: p, content }) {
    await fs.promises.writeFile(p as string, content as string, "utf-8");
  },

  async ensure_dir({ path: p }) {
    await fs.promises.mkdir(p as string, { recursive: true });
  },

  // Security allowlist — no-op in Electron (no sandboxed FS restrictions)
  async fs_set_allowed_roots() {
    return null;
  },

  async append_debug_log({ content }) {
    // Write to userData/lumina-debug.log
    const { app } = await import("electron");
    const logPath = path.join(app.getPath("userData"), "lumina-debug.log");
    await fs.promises.appendFile(logPath, (content as string) + "\n", "utf-8");
  },

  // Lightweight pre-check: count top-level entries without recursion
  async estimate_dir_size({ path: p }) {
    const dirPath = p as string;
    const SYSTEM_DIRS = [
      "/System",
      "/Library",
      "/usr",
      "/private",
      "/bin",
      "/sbin",
    ];
    const homeDir = process.env.HOME || "";
    const SYSTEM_USER_DIRS = homeDir ? [`${homeDir}/Library`] : [];
    const allSystemDirs = [...SYSTEM_DIRS, ...SYSTEM_USER_DIRS];

    const isSystemDir = allSystemDirs.some(
      (sd) => dirPath === sd || dirPath.startsWith(sd + "/"),
    );
    // On Windows, check common system paths
    const isWindowsSystemDir =
      process.platform === "win32" && /^[A-Z]:\\Windows/i.test(dirPath);

    let topLevelCount = 0;
    try {
      const entries = await fs.promises.readdir(dirPath);
      topLevelCount = entries.length;
    } catch {
      // Can't read → will fail later anyway
    }

    return {
      topLevelCount,
      isSystemDir: isSystemDir || isWindowsSystemDir,
      warning: topLevelCount > 500 || isSystemDir || isWindowsSystemDir,
    };
  },
};
