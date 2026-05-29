import fs from "fs";
import path from "path";
import { shell } from "electron";
import ignore, { type Ignore } from "ignore";

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  isDirectory: boolean;
  childrenLoaded?: boolean;
  size: number | null;
  modified_at: number | null;
  created_at: number | null;
  children: FileEntry[] | null;
}

export interface WorkspaceListing {
  entries: FileEntry[];
  /** Total entries discovered before truncation. */
  totalEntries: number;
  /** True when the walker stopped early because the cap was hit. */
  truncated: boolean;
  /** Directories that were skipped due to permission/EMFILE errors. */
  unreadableDirCount: number;
}

// Workspace listing has two hard ceilings that both produce the same
// typed error. The contract is "complete or fail" — never a partially
// populated tree, because consumers (sidebar, graph, indexer) cannot
// distinguish "loaded but empty dir" from "we ran out of budget before
// descending here", and silent partial data corrupts every feature
// downstream.
//
// MAX_WORKSPACE_ENTRIES is a high-watermark safety belt: at this size
// the renderer's structured-clone + Zustand state would itself become
// the problem. 500k entries = roughly 100-150MB resident across main
// and renderer post-clone, which is the genuinely-too-much zone.
//
// WORKSPACE_DEADLINE_MS catches the other failure mode: many files
// reachable in time, but some pathological I/O (network FS, antivirus
// hooks) drags us out. Failing fast at 10s gives the user actionable
// signal instead of an apparently-frozen vault open.
const MAX_WORKSPACE_ENTRIES = 500_000;
const WORKSPACE_DEADLINE_MS = 10_000;

// Indexer's separate cap (used by walkPaths). Smaller because the
// indexer goes on to read each file's contents — that cost dominates
// and deserves a tighter bound than enumeration.
const MAX_WALK_PATHS = 50_000;

/**
 * Stable prefix on the Error.message for "workspace too large" failures.
 * The renderer matches on this to convert the cross-IPC plain Error into
 * a typed UI affordance — Electron's structured clone strips custom
 * Error fields, so the message itself has to carry the discriminator.
 *
 * Format: `WORKSPACE_TOO_LARGE:<reason>:<entriesScanned>: <human msg>`
 */
export const WORKSPACE_TOO_LARGE_PREFIX = "WORKSPACE_TOO_LARGE";
export const FILE_MODIFIED_SINCE_PREFIX = "FILE_MODIFIED_SINCE";

export type WorkspaceTooLargeReason = "count" | "timeout";

interface FileVersion {
  size: number;
  mtimeMs: number;
}

function isFileVersion(value: unknown): value is FileVersion {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FileVersion>;
  return (
    typeof candidate.size === "number" &&
    Number.isFinite(candidate.size) &&
    typeof candidate.mtimeMs === "number" &&
    Number.isFinite(candidate.mtimeMs)
  );
}

function fileModifiedSinceError(
  path: string,
  reason: "changed" | "deleted",
): Error {
  return new Error(
    `${FILE_MODIFIED_SINCE_PREFIX}:${reason}: File changed on disk before save: ${path}`,
  );
}

async function assertUnchangedSince(
  filePath: string,
  expectedVersion: FileVersion | null,
): Promise<void> {
  if (!expectedVersion) return;

  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw fileModifiedSinceError(filePath, "deleted");
    }
    throw error;
  }

  if (
    stat.size !== expectedVersion.size ||
    stat.mtimeMs !== expectedVersion.mtimeMs
  ) {
    throw fileModifiedSinceError(filePath, "changed");
  }
}

function workspaceTooLargeError(
  reason: WorkspaceTooLargeReason,
  entriesScanned: number,
): Error {
  const human =
    reason === "count"
      ? `Workspace exceeds the supported ${MAX_WORKSPACE_ENTRIES.toLocaleString()}-entry ceiling. Open a subdirectory instead, or add ignore rules (.gitignore) to scope what's loaded.`
      : `Workspace took longer than ${WORKSPACE_DEADLINE_MS / 1000}s to enumerate (scanned ${entriesScanned.toLocaleString()} entries). Open a subdirectory instead, or add ignore rules (.gitignore) to scope what's loaded.`;
  return new Error(
    `${WORKSPACE_TOO_LARGE_PREFIX}:${reason}:${entriesScanned}: ${human}`,
  );
}

// Directories that are almost never useful to surface in a notes/editor
// workspace. Hard-coded for the common cases; .gitignore (when present) is
// layered on top.
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "target",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  ".venv",
  "__pycache__",
  ".pnpm-store",
  "out",
  "coverage",
  ".idea",
  ".vscode",
  ".gradle",
]);

const IGNORED_FILES = new Set([".DS_Store", "Thumbs.db"]);

function shouldSkipByName(name: string): boolean {
  if (IGNORED_DIRS.has(name)) return true;
  if (IGNORED_FILES.has(name)) return true;
  // Skip hidden files/dirs, but keep .lumina (app config)
  if (name.startsWith(".") && name !== ".lumina") return true;
  return false;
}

function toIgnoreCandidate(
  rootPath: string,
  fullPath: string,
  isDirectory: boolean,
): string {
  const rel = path.relative(rootPath, fullPath).split(path.sep).join("/");
  return isDirectory ? rel + "/" : rel;
}

/**
 * Build an ignore matcher seeded with .gitignore at the given root, if it
 * exists. Returns null when no .gitignore is present so callers can skip
 * the per-entry matching cost.
 */
async function loadGitignore(rootPath: string): Promise<Ignore | null> {
  try {
    const content = await fs.promises.readFile(
      path.join(rootPath, ".gitignore"),
      "utf-8",
    );
    return ignore().add(content);
  } catch {
    return null;
  }
}

async function listDirShallow(
  rootPath: string,
  dirPath: string,
): Promise<FileEntry[]> {
  const ignoreMatcher = await loadGitignore(rootPath);
  const dirents = await fs.promises.readdir(dirPath, { withFileTypes: true });
  const entries: FileEntry[] = [];

  for (const dirent of dirents) {
    if (shouldSkipByName(dirent.name)) continue;

    const fullPath = path.join(dirPath, dirent.name);
    if (ignoreMatcher) {
      const rel = path.relative(rootPath, fullPath).split(path.sep).join("/");
      if (
        rel &&
        ignoreMatcher.ignores(
          toIgnoreCandidate(rootPath, fullPath, dirent.isDirectory()),
        )
      ) {
        continue;
      }
    }

    entries.push({
      name: dirent.name,
      path: fullPath,
      is_dir: dirent.isDirectory(),
      isDirectory: dirent.isDirectory(),
      childrenLoaded: !dirent.isDirectory(),
      size: null,
      modified_at: null,
      created_at: null,
      children: dirent.isDirectory() ? [] : null,
    });
  }

  entries.sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return entries;
}

interface WalkOptions {
  /**
   * Hard ceiling on entries — the walker throws WorkspaceTooLargeError
   * when this is exceeded. Never returns a partial tree; the contract
   * is "complete or fail".
   */
  maxEntries: number;
  /** Wall-clock deadline in milliseconds; same throw semantics. */
  deadlineMs: number;
  /** Optional .gitignore-style matcher (paths checked relative to root). */
  ignoreMatcher: Ignore | null;
  /** Test seam — defaults to Date.now. */
  now?: () => number;
}

/**
 * Iterative DFS walk of the workspace. Iterative (not recursive) so deep or
 * pathological trees can't blow the call stack. Symlinks are not followed —
 * `Dirent.isDirectory()` only returns true for real directories, so symlink
 * loops are impossible by construction.
 *
 * Throws WorkspaceTooLargeError when either the entry cap or the wall-clock
 * deadline is exceeded. Does not return a partially-populated tree — see the
 * MAX_WORKSPACE_ENTRIES comment above.
 */
export async function walkWorkspace(
  rootPath: string,
  opts: WalkOptions,
): Promise<WorkspaceListing> {
  const root: FileEntry = {
    name: path.basename(rootPath) || rootPath,
    path: rootPath,
    is_dir: true,
    isDirectory: true,
    size: null,
    modified_at: null,
    created_at: null,
    children: [],
  };

  // Stack of dirs to descend into. Each frame carries the parent's
  // children array so we can splice this dir's results in place.
  const stack: Array<{ dirPath: string; parent: FileEntry[] }> = [
    { dirPath: rootPath, parent: root.children! },
  ];

  let totalEntries = 0;
  let unreadableDirCount = 0;
  const now = opts.now ?? Date.now;
  const startedAt = now();

  while (stack.length > 0) {
    // Wall-clock deadline check. We check at the top of each readdir
    // boundary rather than per-entry — readdir is the only thing that
    // does real I/O, and per-entry checks would add nontrivial overhead
    // without catching anything that the per-readdir check wouldn't.
    if (now() - startedAt > opts.deadlineMs) {
      throw workspaceTooLargeError("timeout", totalEntries);
    }

    const { dirPath, parent } = stack.pop()!;

    let dirents: fs.Dirent[];
    try {
      dirents = await fs.promises.readdir(dirPath, { withFileTypes: true });
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (
        code === "EPERM" ||
        code === "EACCES" ||
        code === "EMFILE" ||
        code === "ENOENT"
      ) {
        unreadableDirCount++;
        continue;
      }
      throw err;
    }

    const localEntries: FileEntry[] = [];
    const dirsToDescend: Array<{ entry: FileEntry; fullPath: string }> = [];

    for (const dirent of dirents) {
      if (shouldSkipByName(dirent.name)) continue;

      const fullPath = path.join(dirPath, dirent.name);

      if (opts.ignoreMatcher) {
        // ignore matches against POSIX-style relative paths; trailing
        // slash signals "this is a directory" so dir-only patterns
        // (e.g. "foo/") match.
        const rel = path.relative(rootPath, fullPath).split(path.sep).join("/");
        const candidate = dirent.isDirectory() ? rel + "/" : rel;
        if (rel && opts.ignoreMatcher.ignores(candidate)) continue;
      }

      if (totalEntries >= opts.maxEntries) {
        throw workspaceTooLargeError("count", totalEntries);
      }
      totalEntries++;

      const entry: FileEntry = {
        name: dirent.name,
        path: fullPath,
        is_dir: dirent.isDirectory(),
        isDirectory: dirent.isDirectory(),
        childrenLoaded: true,
        size: null,
        modified_at: null,
        created_at: null,
        children: dirent.isDirectory() ? [] : null,
      };
      localEntries.push(entry);

      if (entry.is_dir) dirsToDescend.push({ entry, fullPath });
    }

    // Sort within this directory: dirs first, then files, alphabetical.
    localEntries.sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    parent.push(...localEntries);

    // Descend into subdirs (push in reverse so DFS order matches sort).
    for (let i = dirsToDescend.length - 1; i >= 0; i--) {
      const { entry, fullPath } = dirsToDescend[i];
      stack.push({ dirPath: fullPath, parent: entry.children! });
    }
  }

  return {
    entries: root.children!,
    totalEntries,
    // Always false now — kept for API compat with the WorkspaceListing
    // type; remove once renderer call sites stop checking.
    truncated: false,
    unreadableDirCount,
  };
}

interface WalkPathsOptions {
  /** File extensions to keep, e.g. [".md"]. Lower-cased, matched suffix. */
  extensions?: string[];
  /** Cap on number of paths returned. Default 50k. */
  maxPaths?: number;
  /** Skip files larger than this. Default unlimited (size not checked unless > 0). */
  maxFileSizeBytes?: number;
}

export interface WalkPathsResult {
  paths: string[];
  truncated: boolean;
  /** Files that matched extension but were skipped due to size cap. */
  skippedOversize: number;
}

/**
 * Server-side flat enumeration for the indexer. Returns a list of file
 * paths matching `extensions`, walking the workspace iteratively with the
 * same ignore rules as `walkWorkspace`. Bounded; no tree shape, no stat
 * unless `maxFileSizeBytes` is set.
 */
async function walkPaths(
  rootPath: string,
  opts: WalkPathsOptions,
): Promise<WalkPathsResult> {
  const exts = (opts.extensions ?? []).map((e) => e.toLowerCase());
  const matchExt = (name: string) =>
    exts.length === 0 || exts.some((e) => name.toLowerCase().endsWith(e));
  const maxPaths = opts.maxPaths ?? MAX_WALK_PATHS;
  const maxSize = opts.maxFileSizeBytes ?? 0;

  const ignoreMatcher = await loadGitignore(rootPath);
  const stack: string[] = [rootPath];
  const paths: string[] = [];
  let truncated = false;
  let skippedOversize = 0;

  while (stack.length > 0 && !truncated) {
    const dirPath = stack.pop()!;
    let dirents: fs.Dirent[];
    try {
      dirents = await fs.promises.readdir(dirPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const dirent of dirents) {
      if (shouldSkipByName(dirent.name)) continue;
      const fullPath = path.join(dirPath, dirent.name);

      if (ignoreMatcher) {
        const rel = path.relative(rootPath, fullPath).split(path.sep).join("/");
        const candidate = dirent.isDirectory() ? rel + "/" : rel;
        if (rel && ignoreMatcher.ignores(candidate)) continue;
      }

      if (dirent.isDirectory()) {
        stack.push(fullPath);
      } else if (dirent.isFile() && matchExt(dirent.name)) {
        if (maxSize > 0) {
          try {
            const st = await fs.promises.stat(fullPath);
            if (st.size > maxSize) {
              skippedOversize++;
              continue;
            }
          } catch {
            continue;
          }
        }
        if (paths.length >= maxPaths) {
          truncated = true;
          break;
        }
        paths.push(fullPath);
      }
    }
  }

  return { paths, truncated, skippedOversize };
}

export const fsHandlers: Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
> = {
  async read_file({ path: p }) {
    return fs.promises.readFile(p as string, "utf-8");
  },

  async save_file({ path: p, content, expectedVersion, overwrite }) {
    const filePath = p as string;
    if (!overwrite && isFileVersion(expectedVersion)) {
      await assertUnchangedSince(filePath, expectedVersion);
    }
    await fs.promises.writeFile(filePath, content as string, "utf-8");
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
    const rootPath = p as string;
    const ignoreMatcher = await loadGitignore(rootPath);
    const result = await walkWorkspace(rootPath, {
      maxEntries: MAX_WORKSPACE_ENTRIES,
      deadlineMs: WORKSPACE_DEADLINE_MS,
      ignoreMatcher,
    });
    return result.entries;
  },

  async list_dir_shallow({ rootPath, dirPath }) {
    return listDirShallow(rootPath as string, dirPath as string);
  },

  async list_workspace({ path: p }) {
    const rootPath = p as string;
    const ignoreMatcher = await loadGitignore(rootPath);
    return walkWorkspace(rootPath, {
      maxEntries: MAX_WORKSPACE_ENTRIES,
      deadlineMs: WORKSPACE_DEADLINE_MS,
      ignoreMatcher,
    });
  },

  async fs_walk_paths({ path: p, extensions, maxPaths, maxFileSizeBytes }) {
    return walkPaths(p as string, {
      extensions: extensions as string[] | undefined,
      maxPaths: maxPaths as number | undefined,
      maxFileSizeBytes: maxFileSizeBytes as number | undefined,
    });
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
