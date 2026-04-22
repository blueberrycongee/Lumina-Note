// Forward main-process console.* + process.stdout/stderr to the renderer
// DevTools console. Without this, logs from the embedded opencode server
// land only in the terminal where `npm run dev` was started — users have
// to juggle two consoles, and debugging provider/SSE failures becomes a
// back-and-forth instead of a single paste.
//
// Enabled only in development. In a packaged app, stdout goes to the log
// file via Electron's default pipeline; forwarding would be overkill and
// would fire before a window exists.

import { BrowserWindow } from "electron";

type Level = "log" | "info" | "warn" | "error" | "debug";

const CHANNEL = "main-console";

function broadcast(level: Level, args: unknown[]): void {
  const text = args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");

  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    // webContents may not be ready immediately at startup; ignore any
    // transient send failures.
    try {
      win.webContents.send(CHANNEL, { level, text });
    } catch {
      // window is still coming up — log line stays in the terminal only
    }
  }
}

export function installMainLogForwarding(): void {
  if (process.env.NODE_ENV !== "development") return;

  (["log", "info", "warn", "error", "debug"] as const).forEach((level) => {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      broadcast(level, args);
    };
  });

  // Opencode's Log.init() writes through process.stdout.write directly,
  // bypassing console.*. Intercept that too.
  const origStdout = process.stdout.write.bind(process.stdout);
  const origStderr = process.stderr.write.bind(process.stderr);

  (process.stdout.write as unknown) = (chunk: unknown, ...rest: unknown[]) => {
    const text = typeof chunk === "string" ? chunk : Buffer.isBuffer(chunk) ? chunk.toString("utf8") : "";
    if (text.trim()) broadcast("log", [text.replace(/\n$/, "")]);
    return origStdout(chunk as Parameters<typeof origStdout>[0], ...(rest as Parameters<typeof origStdout>));
  };
  (process.stderr.write as unknown) = (chunk: unknown, ...rest: unknown[]) => {
    const text = typeof chunk === "string" ? chunk : Buffer.isBuffer(chunk) ? chunk.toString("utf8") : "";
    if (text.trim()) broadcast("error", [text.replace(/\n$/, "")]);
    return origStderr(chunk as Parameters<typeof origStderr>[0], ...(rest as Parameters<typeof origStderr>));
  };
}

export const MAIN_CONSOLE_CHANNEL = CHANNEL;
