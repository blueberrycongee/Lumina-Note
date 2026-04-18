/**
 * IPC handler registration — wires all 'tauri-invoke' calls to their
 * Node.js implementations. Each handler receives (args, win) and returns
 * a value that is sent back to the renderer as the invoke() result.
 */

import { ipcMain, BrowserWindow } from 'electron'
import { fsHandlers } from './handlers/fs.js'
import { platformHandlers } from './handlers/platform.js'
import { storeHandlers } from './handlers/store.js'
import { startFileWatcher } from './handlers/watcher.js'
import type { AgentRuntime } from './agent/runtime.js'
import type { DebugLog } from './agent/debug-log.js'
import type { ProviderSettingsStore } from './agent/providers/settings-store.js'
import type { SkillLoader } from './agent/skills/loader.js'
import { dispatchAgentCommand, isAgentCommand } from './agent/ipc-dispatch.js'

// Stub response for unimplemented commands
function notImplemented(cmd: string) {
  console.warn(`[ipc] unimplemented command: ${cmd}`)
  return null
}

// ── Proxy / diagnostics stubs ───────────────────────────────────────────────
const miscStubs: Record<string, () => unknown> = {
  set_proxy_config: () => null,
  test_proxy_connection: () => ({ success: true, latency_ms: 0 }),
  export_diagnostics: () => null,
}

// ── Skills / Plugins stubs ──────────────────────────────────────────────────
// agent_*/vault_* 走 agent/ipc-dispatch.ts,不在这里
const skillPluginStubs: Record<string, () => unknown> = {
  plugin_list: () => [],
  plugin_read_entry: () => null,
  plugin_get_workspace_dir: () => '',
  plugin_scaffold_example: () => '',
  plugin_scaffold_theme: () => '',
  plugin_scaffold_ui_overhaul: () => '',
  doc_tools_get_status: () => ({ installed: false, version: null, rootDir: null, binDir: null, tools: {}, missing: [] }),
  doc_tools_install_latest: () => { throw new Error('doc tools not available in Electron build yet') },
}

// ── Typesetting stubs ───────────────────────────────────────────────────────
const typesettingStubs: Record<string, () => unknown> = {
  typesetting_preview_page_mm: () => { throw new Error('typesetting sidecar not yet configured') },
  typesetting_fixture_font_path: () => null,
  typesetting_layout_text: () => { throw new Error('typesetting sidecar not yet configured') },
  typesetting_export_pdf_base64: () => { throw new Error('typesetting sidecar not yet configured') },
  typesetting_render_docx_pdf_base64: () => { throw new Error('typesetting sidecar not yet configured') },
}

// ── Tauri event relay (plugin:event|*) ──────────────────────────────────────
// Tauri v2's @tauri-apps/api/event calls invoke('plugin:event|listen', ...)
// We handle this here rather than in the preload since it's IPC-based.
const eventHandlerIds = new Map<string, Map<number, true>>()
let nextEventHandlerId = 1

const eventStubs: Record<string, () => unknown> = {
  'plugin:event|listen': () => nextEventHandlerId++,
  'plugin:event|unlisten': () => null,
  'plugin:event|emit': () => null,
}

export interface IpcHandlersOptions {
  getMainWindow: () => BrowserWindow | null
  agentRuntime: AgentRuntime
  debugLog?: DebugLog
  providerSettings?: ProviderSettingsStore
  skillLoader?: SkillLoader
}

export function registerIpcHandlers(options: IpcHandlersOptions): void {
  const { getMainWindow, agentRuntime, debugLog, providerSettings, skillLoader } = options

  // All invoke() calls from renderer land here
  ipcMain.handle('tauri-invoke', async (event, cmd: string, args: Record<string, unknown> = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? getMainWindow()

    // ── File watcher ────────────────────────────────────────────────────
    if (cmd === 'start_file_watcher') {
      if (win) await startFileWatcher(args.watchPath as string, win)
      return null
    }

    // ── File system ─────────────────────────────────────────────────────
    if (cmd in fsHandlers) return fsHandlers[cmd](args)

    // ── Platform (path / dialog / shell / os / process) ─────────────────
    if (cmd in platformHandlers) return platformHandlers[cmd](args, win ?? undefined)

    // ── Store ────────────────────────────────────────────────────────────
    if (cmd in storeHandlers) return storeHandlers[cmd](args)

    // ── Misc stubs ───────────────────────────────────────────────────────
    if (cmd in miscStubs) return miscStubs[cmd]()

    // ── Agent / Vault (TS runtime) ──────────────────────────────────────
    if (isAgentCommand(cmd)) {
      return dispatchAgentCommand(
        { runtime: agentRuntime, debugLog, providerSettings, skillLoader },
        cmd,
        args,
      )
    }

    // ── Skills / Plugins stubs ───────────────────────────────────────────
    if (cmd in skillPluginStubs) return skillPluginStubs[cmd]()

    // ── Typesetting stubs ────────────────────────────────────────────────
    if (cmd in typesettingStubs) return typesettingStubs[cmd]()

    // ── Event stubs ──────────────────────────────────────────────────────
    if (cmd in eventStubs) return eventStubs[cmd]()

    // ── Misc Tauri internals ─────────────────────────────────────────────
    if (cmd === 'tauri' || cmd === 'get_version') return process.env.npm_package_version ?? '0.0.0'

    return notImplemented(cmd)
  })

  // Forward renderer-emitted events (emit() in JS) back to all windows if needed
  ipcMain.on('tauri-emit', (_event, eventName: string, payload: unknown) => {
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) w.webContents.send('__tauri_event__', eventName, payload)
    })
  })

  ipcMain.on('__preload_ready', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    console.log('[main] preload bridge ready for window', win?.id ?? 'unknown')
  })
}
