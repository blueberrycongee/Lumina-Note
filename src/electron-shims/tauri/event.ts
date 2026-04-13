import type { TauriInternals } from "./core";

export type EventCallback<T> = (event: {
  event: string;
  id: number;
  payload: T;
}) => void;

export type UnlistenFn = () => void;

declare global {
  interface Window {
    __TAURI_INTERNALS__?: TauriInternals;
  }
}

function getEventsBridge() {
  const internals = window.__TAURI_INTERNALS__;
  if (!internals?.listen || !internals?.emit || !internals?.once) {
    throw new Error("Tauri event bridge unavailable in Electron renderer");
  }
  return internals;
}

export async function listen<T>(
  event: string,
  handler: EventCallback<T>,
): Promise<UnlistenFn> {
  return getEventsBridge().listen!(event, handler as EventCallback<unknown>);
}

export async function once<T>(
  event: string,
  handler: EventCallback<T>,
): Promise<UnlistenFn> {
  return getEventsBridge().once!(event, handler as EventCallback<unknown>);
}

export async function emit(event: string, payload?: unknown): Promise<void> {
  await getEventsBridge().emit!(event, payload);
}
