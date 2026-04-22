// Bootstrap opencode's HTTP/WS server in the Electron main process.
//
// Implementation follows opencode's own packages/desktop-electron pattern:
//   - Set OPENCODE_SERVER_USERNAME/PASSWORD on process.env, then call listen().
//   - The listener replies to /global/health with HTTP 200 once ready.
//
// The renderer talks to this server via the URL + basic-auth credentials
// exposed through IPC (see ./ipc.ts). There is NO subprocess — Server.listen()
// binds inside the Electron main process.

import { randomUUID } from "node:crypto";

// Virtual module resolved by electron-vite to
// thirdparty/opencode/packages/opencode/dist/node/node.js.
// Types come from ./virtual-opencode-server.d.ts.
import { Log, Server } from "virtual:opencode-server";

export type OpencodeServerHandle = {
  url: string;
  username: string;
  password: string;
  stop(): Promise<void> | void;
};

let handle: OpencodeServerHandle | null = null;
let starting: Promise<OpencodeServerHandle> | null = null;
let listeners: Array<(h: OpencodeServerHandle | null) => void> = [];

function notifyListeners(next: OpencodeServerHandle | null): void {
  for (const fn of listeners) {
    try {
      fn(next);
    } catch (err) {
      console.error("[opencode] handle listener threw", err);
    }
  }
}

/**
 * Subscribe to server handle changes. Fires with the current handle (or null)
 * on subscription, then again whenever startOpencodeServer() produces a new
 * handle or stopOpencodeServer() clears it. Used by IPC to push fresh URL +
 * credentials to the renderer after a settings-driven restart.
 */
export function onOpencodeHandleChange(
  fn: (h: OpencodeServerHandle | null) => void,
): () => void {
  listeners.push(fn);
  fn(handle);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

function healthUrl(base: string): string {
  return new URL("/global/health", base).toString();
}

async function waitForReady(
  url: string,
  username: string,
  password: string,
  timeoutMs = 30_000,
): Promise<void> {
  const headers = new Headers({
    authorization:
      "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
  });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(healthUrl(url), {
        headers,
        signal: AbortSignal.timeout(2_000),
      });
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`opencode server not ready within ${timeoutMs}ms at ${url}`);
}

export async function startOpencodeServer(opts?: {
  port?: number;
  hostname?: string;
  logLevel?: "DEBUG" | "INFO" | "WARN" | "ERROR";
}): Promise<OpencodeServerHandle> {
  if (handle) return handle;
  if (starting) return starting;

  starting = (async () => {
    const hostname = opts?.hostname ?? "127.0.0.1";
    const port = opts?.port ?? 0; // 0 → OS picks a free port
    const username = "opencode";
    const password = randomUUID();

    // Credentials are read from env by opencode's server runtime; passing
    // them via listen() options is a no-op.
    process.env.OPENCODE_SERVER_USERNAME = username;
    process.env.OPENCODE_SERVER_PASSWORD = password;
    process.env.OPENCODE_CLIENT = "lumina";

    // In dev, force INFO so provider resolution + prompt errors show up
    // in the main terminal. Silent provider failures were what kept the
    // earlier "message sends but no reply" bug un-diagnosed.
    //
    // `print: true` bypasses opencode's log-to-file default and writes to
    // stderr instead. Our log-forward.ts pipe then delivers it to the
    // renderer DevTools console. Without this flag `Log.init` drops its
    // output into `~/.local/share/opencode/log/dev.log` and nothing from
    // the prompt loop (provider resolution, retry attempts, agent errors)
    // is visible to us.
    const isDev = process.env.NODE_ENV === "development";
    const defaultLevel = isDev ? "INFO" : "WARN";
    await Log.init({
      level: opts?.logLevel ?? defaultLevel,
      print: isDev,
      dev: isDev,
    });

    const listener = await Server.listen({
      port,
      hostname,
      cors: ["oc://renderer", "http://localhost:5174"],
    });

    const url = listener.url.toString().replace(/\/$/, "");
    await waitForReady(url, username, password);

    handle = {
      url,
      username,
      password,
      stop: () => listener.stop?.(),
    };
    notifyListeners(handle);
    return handle;
  })();

  try {
    return await starting;
  } finally {
    starting = null;
  }
}

export function getOpencodeServer(): OpencodeServerHandle | null {
  return handle;
}

export async function stopOpencodeServer(): Promise<void> {
  const current = handle;
  handle = null;
  notifyListeners(null);
  if (current) await Promise.resolve(current.stop());
}

/**
 * Stop the running server (if any) and start a fresh one. Callers are expected
 * to update process.env (via provider-bridge.applyOpencodeBridge) before
 * invoking — opencode reads OPENCODE_CONFIG_CONTENT + OPENCODE_AUTH_CONTENT
 * only at server construction.
 */
export async function restartOpencodeServer(
  opts?: Parameters<typeof startOpencodeServer>[0],
): Promise<OpencodeServerHandle> {
  await stopOpencodeServer();
  return startOpencodeServer(opts);
}
