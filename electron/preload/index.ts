/**
 * Electron preload — shims window.__TAURI_INTERNALS__ and window.__TAURI__
 *
 * This lets every @tauri-apps/* import in the existing codebase work
 * without any changes. contextIsolation is false so function refs cross
 * the boundary cleanly (same JS world as renderer).
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ipcRenderer } = require('electron') as typeof import('electron')

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
window.__TAURI_INTERNALS__ = {
  invoke: async (cmd: string, args: Record<string, unknown> = {}) => {
    return ipcRenderer.invoke('tauri-invoke', cmd, args)
  },

  listen: async (event: string, handler: EventHandler): Promise<() => void> => {
    if (!eventHandlers.has(event)) eventHandlers.set(event, new Map())
    const id = nextHandlerId++
    eventHandlers.get(event)!.set(id, handler)
    return () => eventHandlers.get(event)?.delete(id)
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
    unlisten = await (window.__TAURI_INTERNALS__ as TauriInternals).listen(event, wrappedHandler)
    return unlisten
  },

  // transformCallback: used by some @tauri-apps packages internally
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

// isTauriAvailable() in src/lib/tauri.ts checks window.__TAURI__.core.invoke
window.__TAURI__ = {
  core: {
    invoke: (window.__TAURI_INTERNALS__ as TauriInternals).invoke,
  },
}

interface TauriInternals {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
  listen: (event: string, handler: EventHandler) => Promise<() => void>
  emit: (event: string, payload: unknown) => Promise<void>
  once: (event: string, handler: EventHandler) => Promise<() => void>
  transformCallback: (callback: (...args: unknown[]) => unknown, once?: boolean) => number
}

declare global {
  interface Window {
    __TAURI_INTERNALS__: TauriInternals
    __TAURI__: { core: { invoke: TauriInternals['invoke'] } }
  }
}
