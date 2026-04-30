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
let readiness: Promise<OpencodeServerHandle> | null = null;
let listeners: Array<(h: OpencodeServerHandle | null) => void> = [];

const STOP_TIMEOUT_MS = 2_000;
const DISPOSE_TIMEOUT_MS = 2_000;

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

export function notifyOpencodeServerRefreshing(): void {
  notifyListeners(null);
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

async function disposeOpencodeInstances(
  current: OpencodeServerHandle,
): Promise<void> {
  const headers = new Headers({
    authorization:
      "Basic " +
      Buffer.from(`${current.username}:${current.password}`).toString("base64"),
  });
  try {
    const res = await fetch(new URL("/global/dispose", current.url), {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(DISPOSE_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(
        `[opencode] instance dispose returned HTTP ${res.status} during restart`,
      );
    }
  } catch (err) {
    console.warn("[opencode] instance dispose failed during restart", err);
  }
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

    // Log level: default WARN so routine INFO (request trace, permission
    // ruleset dumps, skill discovery — can be 40KB per line × hundreds of
    // lines on machines with many installed skills) doesn't flood stderr
    // and choke the log-forward IPC channel into the renderer.
    // Real errors (session.error, provider failures, plugin load failures)
    // are emitted at ERROR/WARN and still surface. Override with
    // LUMINA_OPENCODE_LOG=INFO (or DEBUG) when deep-diagnosing.
    //
    // `print: true` routes output to stderr instead of opencode's on-disk
    // log file so log-forward.ts can relay to the renderer DevTools console.
    const isDev = process.env.NODE_ENV === "development";
    const envLevel = process.env.LUMINA_OPENCODE_LOG as
      | "DEBUG"
      | "INFO"
      | "WARN"
      | "ERROR"
      | undefined;
    const defaultLevel = envLevel ?? "WARN";
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

export function trackOpencodeServerReadiness(
  promise: Promise<OpencodeServerHandle>,
): void {
  readiness = promise;
  void promise
    .catch(() => null)
    .finally(() => {
      if (readiness === promise) readiness = null;
    });
}

export async function getOpencodeServerWhenReady(): Promise<OpencodeServerHandle | null> {
  if (readiness) {
    try {
      return await readiness;
    } catch {
      return null;
    }
  }
  if (handle) return handle;
  if (!starting) return null;
  try {
    return await starting;
  } catch {
    return null;
  }
}

export async function stopOpencodeServer(): Promise<void> {
  const current = handle;
  handle = null;
  notifyListeners(null);
  if (!current) return;

  // Server.listen()/listener.stop() only tears down the HTTP listener. Opencode
  // keeps per-directory InstanceState caches (including provider/model state)
  // in the shared Effect runtime. If provider settings change and we only
  // restart the listener, a vault directory can keep using the old provider
  // table and reject the newly selected model with ProviderModelNotFoundError.
  // Disposing instances before restart forces provider/config state to rebuild
  // from the freshly applied OPENCODE_CONFIG_CONTENT/OPENCODE_AUTH_CONTENT.
  await disposeOpencodeInstances(current);

  // opencode's listener.stop() can wait indefinitely for long-lived SSE
  // connections to drain. During a provider/model change that leaves the app
  // with no listening server and a renderer stuck in loading. Treat stop as
  // best-effort: clear the public handle immediately, then allow restart to
  // continue after a bounded grace period.
  try {
    await Promise.race([
      Promise.resolve(current.stop()),
      new Promise<void>((resolve) => {
        setTimeout(resolve, STOP_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    console.warn("[opencode] server stop failed during restart", err);
  }
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
