/**
 * Electron preload — shims window.__TAURI_INTERNALS__ and window.__TAURI__
 *
 * This lets every @tauri-apps/* import in the existing codebase work
 * without any changes. contextIsolation is false so the window object is
 * shared with the renderer's JS world.
 */

import { ipcRenderer } from 'electron'

// ── Event bus (replaces Tauri's Rust-side event system) ─────────────────────
type EventHandler = (payload: unknown) => void
const eventHandlers = new Map<string, Map<number, EventHandler>>()
let nextHandlerId = 1

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
    const key = `_cb_${id}`
    ;(window as Record<string, unknown>)[key] = (...args: unknown[]) => {
      if (once) delete (window as Record<string, unknown>)[key]
      return callback(...args)
    }
    return id
  },
}

// Expose on window (contextIsolation: false means preload and renderer share window)
;(window as Record<string, unknown>)['__TAURI_INTERNALS__'] = tauriInternals

// isTauriAvailable() in src/lib/tauri.ts checks window.__TAURI__.core.invoke
;(window as Record<string, unknown>)['__TAURI__'] = {
  core: {
    invoke: tauriInternals.invoke,
  },
}

console.log('[preload] __TAURI_INTERNALS__ shim installed')
