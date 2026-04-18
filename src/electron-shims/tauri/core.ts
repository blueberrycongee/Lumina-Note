// Replacement for @tauri-apps/api/core in the Electron renderer.
// Vite alias rewrites every `import ... from "@tauri-apps/api/core"` in the
// renderer to this file, so commands flow through preload's
// __TAURI_INTERNALS__.invoke into electron/main/ipc.ts.
//
// The renderer itself only uses { invoke, isTauri }. The Channel / Resource /
// transformCallback exports exist solely because some @tauri-apps/plugin-*
// packages we still ship import them at module load — keeping them as minimal
// stubs lets those modules link without dragging in the full Tauri runtime.
// Plugin code paths we removed (PluginListener, addPluginListener,
// checkPermissions, etc.) had no main-side handlers and have been dropped.

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
      core?: {
        invoke?: TauriInternals["invoke"];
      };
    };
  }
}

function getInternals(): TauriInternals | undefined {
  return window.__TAURI_INTERNALS__;
}

function getInvoke() {
  const invokeFn =
    getInternals()?.invoke ?? window.__TAURI__?.core?.invoke;

  if (typeof invokeFn !== "function") {
    throw new Error("Tauri invoke bridge unavailable in Electron renderer");
  }

  return invokeFn;
}

export function isTauri(): boolean {
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

// ── Stubs kept for @tauri-apps/plugin-* link compatibility ─────────────────

export function transformCallback<T = unknown>(
  callback?: (response: T) => void,
  once = false,
): number {
  const transform = getInternals()?.transformCallback;
  if (typeof transform === "function") {
    return transform((response: unknown) => callback?.(response as T), once);
  }
  // Fallback: no native bridge — return a stable id; plugins that depend on
  // real callback wiring will fail at invoke time, not at module load.
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
