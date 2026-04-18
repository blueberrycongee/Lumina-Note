/**
 * Low-level IPC bridge. Vite aliases `@tauri-apps/api/core|event|app` to this
 * file so the `@tauri-apps/plugin-*` packages (which internally import
 * `{ invoke, Channel, Resource }` from `@tauri-apps/api/core`) transparently
 * route through the Electron preload.
 *
 * App-level helpers (readFile, createDir, listPlugins, ...) live in
 * `src/lib/host.ts`, which itself imports `invoke` from `@tauri-apps/api/core`
 * so existing `vi.mock('@tauri-apps/api/core', ...)` tests continue to work.
 */

export const SERIALIZE_TO_IPC_FN = "__TAURI_TO_IPC_KEY__";

export type InvokeArgs = Record<string, unknown>;

export type TauriInternals = {
  invoke?: <T = unknown>(
    cmd: string,
    args?: Record<string, unknown>,
    options?: unknown,
  ) => Promise<T>;
  listen?: <T = unknown>(
    event: string,
    handler: (event: { event: string; id: number; payload: T }) => void,
  ) => Promise<() => void>;
  transformCallback?: (
    callback: (...args: unknown[]) => unknown,
    once?: boolean,
  ) => number;
};

declare global {
  interface Window {
    __TAURI_INTERNALS__?: TauriInternals;
    __TAURI__?: {
      core?: { invoke?: TauriInternals["invoke"] };
    };
  }
}

function getInternals(): TauriInternals | undefined {
  return typeof window !== "undefined" ? window.__TAURI_INTERNALS__ : undefined;
}

function getInvoke() {
  const fn =
    getInternals()?.invoke ??
    (typeof window !== "undefined" ? window.__TAURI__?.core?.invoke : undefined);
  if (typeof fn !== "function") {
    throw new Error("Host invoke bridge unavailable");
  }
  return fn;
}

export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof getInternals()?.invoke === "function" ||
    typeof window.__TAURI__?.core?.invoke === "function"
  );
}

export async function invoke<T = unknown>(
  cmd: string,
  args: InvokeArgs = {},
  options?: unknown,
): Promise<T> {
  return getInvoke()(cmd, args, options) as Promise<T>;
}

export function transformCallback<T = unknown>(
  callback?: (response: T) => void,
  once = false,
): number {
  const transform = getInternals()?.transformCallback;
  if (typeof transform === "function") {
    return transform((response: unknown) => callback?.(response as T), once);
  }
  return -1;
}

export class Channel<T = unknown> {
  id: number;
  #onmessage: (message: T) => void;

  constructor(onmessage?: (message: T) => void) {
    this.#onmessage = onmessage ?? (() => {});
    this.id = transformCallback((message: T) => {
      this.#onmessage(message);
    });
  }

  set onmessage(handler: (message: T) => void) {
    this.#onmessage = handler;
  }

  get onmessage() {
    return this.#onmessage;
  }

  [SERIALIZE_TO_IPC_FN]() {
    return `__CHANNEL__:${this.id}`;
  }

  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
}

export class Resource {
  #rid: number;

  constructor(rid: number) {
    this.#rid = rid;
  }

  get rid() {
    return this.#rid;
  }

  async close(): Promise<void> {
    await invoke("plugin:resources|close", { rid: this.#rid }).catch(() => {});
  }
}

// ── Event bridge ───────────────────────────────────────────────────────────

export type UnlistenFn = () => void;

export async function listen<T>(
  event: string,
  handler: (event: { event: string; id: number; payload: T }) => void,
): Promise<UnlistenFn> {
  const bridge = getInternals();
  if (!bridge?.listen) {
    throw new Error("Host event bridge unavailable");
  }
  return bridge.listen!(
    event,
    handler as (e: { event: string; id: number; payload: unknown }) => void,
  );
}

// ── App metadata ───────────────────────────────────────────────────────────

export async function getVersion(): Promise<string> {
  return invoke<string>("get_version");
}

export const isTauriAvailable = isTauri;
