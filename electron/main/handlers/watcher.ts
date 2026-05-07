/**
 * File system watcher — replaces Tauri's start_file_watcher / fs:change events
 * Uses chokidar for cross-platform reliable watching.
 *
 * Defaults:
 *   - Shallow by default. The sidebar now loads directories lazily, so
 *     recursively watching a whole workspace can exhaust file descriptors
 *     before the user has interacted with most of it.
 *   - Default-deny list aligns with the workspace listing handler so the
 *     watcher and the file tree see the same set of files.
 *   - .gitignore at the watch root is honored so checked-in repositories
 *     don't blow up the watch set.
 */

import fs from "node:fs";
import path from "node:path";
import { BrowserWindow } from "electron";
import ignore from "ignore";

let chokidar: typeof import("chokidar") | null = null;

interface WatcherEntry {
  watcher: import("chokidar").FSWatcher;
  /** True when this watcher fell back to polling after EMFILE/ENOSPC. */
  polling: boolean;
}

const activeWatchers = new Map<string, WatcherEntry>();

async function getChokidar() {
  if (!chokidar) {
    chokidar = await import("chokidar");
  }
  return chokidar;
}

// Aligned with the default deny list in handlers/fs.ts. Kept in sync
// manually rather than imported to avoid pulling fs.ts (and its `ignore`
// dep) into watcher startup when the user never opens a vault.
const DEFAULT_IGNORED_DIR_NAMES = [
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
];

const DEFAULT_IGNORED_FILE_NAMES = [".DS_Store", "Thumbs.db"];

function buildIgnorePredicate(
  watchPath: string,
): (testPath: string) => boolean {
  const dirNames = new Set(DEFAULT_IGNORED_DIR_NAMES);
  const fileNames = new Set(DEFAULT_IGNORED_FILE_NAMES);

  // .gitignore is loaded synchronously here because chokidar's `ignored`
  // is called per-path and a sync check keeps that hot path simple. The
  // file is only read once at watcher creation.
  let gitMatcher: ReturnType<typeof ignore> | null = null;
  try {
    const content = fs.readFileSync(
      path.join(watchPath, ".gitignore"),
      "utf-8",
    );
    gitMatcher = ignore().add(content);
  } catch {
    /* no .gitignore — fall through to defaults only */
  }

  return (testPath: string) => {
    if (testPath === watchPath) return false;

    let stats: fs.Stats | null = null;
    try {
      stats = fs.statSync(testPath);
    } catch {
      // Cannot stat — let chokidar see it; it'll filter on its own.
      return false;
    }
    const isDir = stats.isDirectory();
    const base = path.basename(testPath);

    if (isDir && dirNames.has(base)) return true;
    if (!isDir && fileNames.has(base)) return true;
    if (base.startsWith(".") && base !== ".lumina") return true;

    if (gitMatcher) {
      const rel = path.relative(watchPath, testPath);
      if (!rel) return false;
      const candidate = isDir
        ? rel.split(path.sep).join("/") + "/"
        : rel.split(path.sep).join("/");
      if (gitMatcher.ignores(candidate)) return true;
    }

    return false;
  };
}

interface StartOptions {
  /** Force polling mode (Linux fallback path also takes this code path). */
  usePolling?: boolean;
}

async function startWatcher(
  watchPath: string,
  win: BrowserWindow,
  opts: StartOptions = {},
): Promise<void> {
  const c = await getChokidar();

  const watcher = c.watch(watchPath, {
    ignored: buildIgnorePredicate(watchPath),
    persistent: true,
    ignoreInitial: true,
    depth: 0,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    usePolling: opts.usePolling ?? false,
    interval: opts.usePolling ? 1500 : undefined,
    binaryInterval: opts.usePolling ? 3000 : undefined,
  });

  const emit = (type: string, p: string) => {
    if (!win.isDestroyed()) {
      win.webContents.send("__tauri_event__", "fs:change", { type, path: p });
    }
  };

  watcher
    .on("add", (p) => emit("create", p))
    .on("change", (p) => emit("modify", p))
    .on("unlink", (p) => emit("remove", p))
    .on("addDir", (p) => emit("create", p))
    .on("unlinkDir", (p) => emit("remove", p))
    .on("error", (err) => {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? (err as NodeJS.ErrnoException).code
          : undefined;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[FileWatcher] Error watching ${watchPath}:`, message);

      // EMFILE/ENOSPC = inotify limit hit. Don't go silent — restart the
      // watcher in polling mode so the user keeps getting change events,
      // just at coarser cadence. The renderer is notified once so it can
      // surface a banner explaining the degradation.
      const fdExhausted = code === "EMFILE" || code === "ENOSPC";
      const entry = activeWatchers.get(watchPath);
      if (fdExhausted && entry && !entry.polling) {
        console.warn(
          `[FileWatcher] FD/inotify limit reached — restarting in polling mode`,
        );
        watcher.close();
        activeWatchers.delete(watchPath);
        if (!win.isDestroyed()) {
          win.webContents.send("__tauri_event__", "fs:watcher-degraded", {
            path: watchPath,
            reason: code,
            mode: "polling",
          });
        }
        // Reschedule on the macrotask queue so the close() teardown
        // completes before the new instance starts.
        setImmediate(() => {
          startWatcher(watchPath, win, { usePolling: true }).catch((e) => {
            console.error(
              `[FileWatcher] Polling fallback failed for ${watchPath}:`,
              e,
            );
          });
        });
      }
    });

  activeWatchers.set(watchPath, { watcher, polling: opts.usePolling ?? false });
}

export async function startFileWatcher(
  watchPath: string,
  win: BrowserWindow,
): Promise<void> {
  if (activeWatchers.has(watchPath)) return;
  await startWatcher(watchPath, win);
}

export function stopFileWatcher(watchPath: string): void {
  const entry = activeWatchers.get(watchPath);
  if (entry) {
    entry.watcher.close();
    activeWatchers.delete(watchPath);
  }
}

export function stopAllWatchers(): void {
  activeWatchers.forEach((entry) => entry.watcher.close());
  activeWatchers.clear();
}
