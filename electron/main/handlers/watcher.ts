/**
 * File system watcher — replaces Tauri's start_file_watcher / fs:change events
 * Uses chokidar for cross-platform reliable watching.
 */

import { BrowserWindow } from "electron";

// Lazy-import chokidar to avoid startup cost when watcher isn't used
let chokidar: typeof import("chokidar") | null = null;

const activeWatchers = new Map<string, import("chokidar").FSWatcher>();

async function getChokidar() {
  if (!chokidar) {
    chokidar = await import("chokidar");
  }
  return chokidar;
}

export async function startFileWatcher(
  watchPath: string,
  win: BrowserWindow,
): Promise<void> {
  if (activeWatchers.has(watchPath)) return;

  const c = await getChokidar();
  const watcher = c.watch(watchPath, {
    ignored: [
      /(^|[/\\])\./, // hidden files/dirs
      "**/node_modules/**",
      "**/.git/**",
      "**/target/**",
    ],
    persistent: true,
    ignoreInitial: true,
    depth: 20,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
  });

  const emit = (type: string, path: string) => {
    if (!win.isDestroyed()) {
      win.webContents.send("__tauri_event__", "fs:change", { type, path });
    }
  };

  watcher
    .on("add", (p) => emit("create", p))
    .on("change", (p) => emit("modify", p))
    .on("unlink", (p) => emit("remove", p))
    .on("addDir", (p) => emit("create", p))
    .on("unlinkDir", (p) => emit("remove", p))
    .on("error", (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      console.error(`[FileWatcher] Error watching ${watchPath}:`, err.message);
      if (code === "EMFILE" || code === "ENFILE") {
        console.error(
          "[FileWatcher] File descriptor limit reached, stopping watcher",
        );
        watcher.close();
        activeWatchers.delete(watchPath);
        if (!win.isDestroyed()) {
          win.webContents.send("__tauri_event__", "fs:watcher-degraded", {
            path: watchPath,
            reason: "EMFILE",
          });
        }
      }
    });

  activeWatchers.set(watchPath, watcher);
}

export function stopFileWatcher(watchPath: string): void {
  const watcher = activeWatchers.get(watchPath);
  if (watcher) {
    watcher.close();
    activeWatchers.delete(watchPath);
  }
}

export function stopAllWatchers(): void {
  activeWatchers.forEach((w) => w.close());
  activeWatchers.clear();
}
