/**
 * Electron preload — exposes window.__TAURI_INTERNALS__ and window.__TAURI__
 * via contextBridge so the renderer always sees a stable bridge.
 */

import { contextBridge, ipcRenderer } from 'electron'

// ── Event bus (replaces Tauri's Rust-side event system) ─────────────────────
type EventHandler = (payload: unknown) => void
const eventHandlers = new Map<string, Map<number, EventHandler>>()
let nextHandlerId = 1
const callbacks = new Map<number, (...args: unknown[]) => unknown>()

ipcRenderer.on('__tauri_event__', (_event, eventName: string, payload: unknown) => {
  const handlers = eventHandlers.get(eventName)
  if (!handlers) return
  handlers.forEach((handler) => {
    handler({ event: eventName, id: 0, payload })
  })
})

// ── Tauri v2 internals shim ──────────────────────────────────────────────────
const tauriInternals = {
  invoke: async (cmd: string, args: Record<string, unknown> = {}): Promise<unknown> => {
    return ipcRenderer.invoke('tauri-invoke', cmd, args)
  },

  listen: async (event: string, handler: EventHandler): Promise<() => void> => {
    if (!eventHandlers.has(event)) eventHandlers.set(event, new Map())
    const id = nextHandlerId++
    eventHandlers.get(event)!.set(id, handler)
    // Register with main process (returns an ID but we manage locally)
    ipcRenderer.invoke('tauri-invoke', 'plugin:event|listen', { event, handler: id }).catch(() => {})
    return () => {
      eventHandlers.get(event)?.delete(id)
    }
  },

  emit: async (event: string, payload: unknown): Promise<void> => {
    ipcRenderer.send('tauri-emit', event, payload)
  },

  once: async (event: string, handler: EventHandler): Promise<() => void> => {
    let unlisten: (() => void) | undefined
    const wrappedHandler = (e: unknown) => {
      handler(e)
      unlisten?.()
    }
    unlisten = await tauriInternals.listen(event, wrappedHandler)
    return unlisten
  },

  // transformCallback: used by some @tauri-apps packages internally to register
  // callbacks as window-level properties referenced by numeric IDs
  transformCallback: (callback: (...args: unknown[]) => unknown, once = false): number => {
    const id = nextHandlerId++
    callbacks.set(id, (...args: unknown[]) => {
      if (once) callbacks.delete(id)
      return callback(...args)
    })
    return id
  },

  unregisterCallback: (id: number): void => {
    callbacks.delete(id)
  },

  runCallback: (id: number, ...args: unknown[]): unknown => {
    return callbacks.get(id)?.(...args)
  },
}

contextBridge.exposeInMainWorld('__TAURI_INTERNALS__', tauriInternals)
contextBridge.exposeInMainWorld('__TAURI__', {
  core: {
    invoke: tauriInternals.invoke,
  },
})

// ── Opencode server bridge ─────────────────────────────────────────────────
// Exposed as window.lumina.opencode so the renderer can build an
// @opencode-ai/sdk client against the in-process server.
type OpencodeServerInfo = {
  url: string
  username: string
  password: string
} | null

contextBridge.exposeInMainWorld('lumina', {
  opencode: {
    getServerInfo: async (): Promise<OpencodeServerInfo> =>
      ipcRenderer.invoke('opencode:get-server-info') as Promise<OpencodeServerInfo>,
    /**
     * Fires after a provider-settings-driven restart. Receives the fresh
     * server info (or null while the new server is still coming up).
     * Renderer resets its cached OpencodeClient and re-subscribes SSE.
     */
    onServerChanged: (handler: (info: OpencodeServerInfo) => void): (() => void) => {
      const listener = (_event: unknown, info: OpencodeServerInfo) => handler(info)
      ipcRenderer.on('opencode:server-changed', listener)
      return () => ipcRenderer.removeListener('opencode:server-changed', listener)
    },
  },
})

// Pipe forwarded main-process logs into the renderer DevTools console so
// users (and us) don't have to flip between terminals while debugging.
// Every forwarded line is prefixed so it's visually distinct from genuine
// renderer logs and greppable in pastes.
type MainLogPayload = { level: 'log' | 'info' | 'warn' | 'error' | 'debug'; text: string }
ipcRenderer.on('main-console', (_event, payload: MainLogPayload) => {
  const { level, text } = payload
  const prefix = '%c[main]'
  const style = 'color:#888;font-weight:600'
  const method = (console as unknown as Record<string, (...args: unknown[]) => void>)[level]
  if (typeof method === 'function') {
    method(prefix, style, text)
  } else {
    console.log(prefix, style, text)
  }
})

ipcRenderer.send('__preload_ready')
console.log('[preload] __TAURI_INTERNALS__ shim installed')
