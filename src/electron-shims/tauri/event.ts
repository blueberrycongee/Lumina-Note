// Replacement for @tauri-apps/api/event in the Electron renderer.
// Routes listen()/UnlistenFn through preload's __TAURI_INTERNALS__.listen.
// once/emit were never imported by the renderer — dropped along with the
// rest of the Tauri-only surface.

import type { TauriInternals } from "./core";

export type UnlistenFn = () => void;

declare global {
  interface Window {
    __TAURI_INTERNALS__?: TauriInternals;
  }
}

function getEventsBridge() {
  const internals = window.__TAURI_INTERNALS__;
  if (!internals?.listen) {
    throw new Error("Tauri event bridge unavailable in Electron renderer");
  }
  return internals;
}

export async function listen<T>(
  event: string,
  handler: (event: { event: string; id: number; payload: T }) => void,
): Promise<UnlistenFn> {
  return getEventsBridge().listen!(event, handler as (e: { event: string; id: number; payload: unknown }) => void);
}
