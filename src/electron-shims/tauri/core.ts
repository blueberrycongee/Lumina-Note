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
  once?: <T = unknown>(
    event: string,
    handler: (event: { event: string; id: number; payload: T }) => void,
  ) => Promise<() => void>;
  emit?: (event: string, payload?: unknown) => Promise<void>;
  transformCallback?: (callback: (...args: unknown[]) => unknown, once?: boolean) => number;
  unregisterCallback?: (id: number) => void;
  convertFileSrc?: (filePath: string, protocol?: string) => string;
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
    getInternals()?.invoke ??
    window.__TAURI__?.core?.invoke;

  if (typeof invokeFn !== "function") {
    throw new Error("Tauri invoke bridge unavailable in Electron renderer");
  }

  return invokeFn;
}

export function isTauri(): boolean {
  return typeof getInternals()?.invoke === "function" || typeof window.__TAURI__?.core?.invoke === "function";
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
  if (typeof transform !== "function") {
    throw new Error("Tauri transformCallback bridge unavailable in Electron renderer");
  }
  return transform((response: unknown) => callback?.(response as T), once);
}

export function convertFileSrc(filePath: string, protocol = "asset"): string {
  const convert = getInternals()?.convertFileSrc;
  if (typeof convert === "function") {
    return convert(filePath, protocol);
  }
  return `file://${encodeURI(filePath)}`;
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

export class PluginListener {
  plugin: string;
  event: string;
  channelId: number;

  constructor(plugin: string, event: string, channelId: number) {
    this.plugin = plugin;
    this.event = event;
    this.channelId = channelId;
  }

  async unregister(): Promise<void> {
    await invoke(`plugin:${this.plugin}|remove_listener`, {
      event: this.event,
      channelId: this.channelId,
    }).catch(() => {});
  }
}

export async function addPluginListener<T = unknown>(
  plugin: string,
  event: string,
  cb: (payload: T) => void,
): Promise<PluginListener> {
  const handler = new Channel<T>(cb);
  await invoke(`plugin:${plugin}|register_listener`, { event, handler });
  return new PluginListener(plugin, event, handler.id);
}

export async function checkPermissions(plugin: string): Promise<unknown> {
  return invoke(`plugin:${plugin}|check_permissions`);
}

export async function requestPermissions(plugin: string): Promise<unknown> {
  return invoke(`plugin:${plugin}|request_permissions`);
}
