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
type WriteCallback = (err?: Error | null) => void;
type StreamWrite = (
  chunk: string | Uint8Array,
  encodingOrCallback?: BufferEncoding | WriteCallback,
  callback?: WriteCallback,
) => boolean;

const CHANNEL = "main-console";

// Per-line cap so a single pathological log entry (opencode dumps the
// full permission ruleset on every skill load — ~40KB each, and a fresh
// `~/.claude/skills/...` with ~50 skills produces ~2MB of log text in a
// few seconds) can't choke the IPC channel or blow up renderer console.
const MAX_TEXT_BYTES = 2_000;

// Opencode's `service=permission` path spams a full ruleset JSON per
// skill check; it's rarely useful and drowns everything else out.
// Cheap substring guard avoids parsing.
function shouldDrop(text: string): boolean {
  return text.includes("service=permission");
}

function broadcast(level: Level, args: unknown[]): void {
  let text = args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");

  if (shouldDrop(text)) return;
  if (text.length > MAX_TEXT_BYTES) {
    text = text.slice(0, MAX_TEXT_BYTES) + `… [${text.length - MAX_TEXT_BYTES} more chars truncated]`;
  }

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
  const origStdout = process.stdout.write.bind(process.stdout) as StreamWrite;
  const origStderr = process.stderr.write.bind(process.stderr) as StreamWrite;

  const wrapWrite = (level: "log" | "error", original: StreamWrite): StreamWrite => {
    return (chunk, encodingOrCallback, callback) => {
      const text = typeof chunk === "string" ? chunk : Buffer.isBuffer(chunk) ? chunk.toString("utf8") : "";
      if (text.trim()) broadcast(level, [text.replace(/\n$/, "")]);
      if (typeof encodingOrCallback === "function") {
        return original(chunk, encodingOrCallback);
      }
      return original(chunk, encodingOrCallback, callback);
    };
  };

  process.stdout.write = wrapWrite("log", origStdout) as typeof process.stdout.write;
  process.stderr.write = wrapWrite("error", origStderr) as typeof process.stderr.write;
}

export const MAIN_CONSOLE_CHANNEL = CHANNEL;
