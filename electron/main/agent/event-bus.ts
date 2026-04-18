/**
 * AgentEventBus — 把 agent 事件推到当前主窗口 renderer。
 *
 * 沿 preload 的 `__tauri_event__` 中继通道发出,事件名固定为 `agent-event`,
 * 这样 renderer 侧 `listen('agent-event', ...)` 不需修改就能收到。
 * 事件内部 schema 见 types.ts 的 AgentEvent(Phase 1 用的新 schema)。
 */

import type { BrowserWindow } from 'electron'
import type { AgentEvent } from './types.js'

export type WindowProvider = () => BrowserWindow | null

export class AgentEventBus {
  private readonly getWindow: WindowProvider

  constructor(getWindow: WindowProvider) {
    this.getWindow = getWindow
  }

  emit(event: AgentEvent): void {
    const win = this.getWindow()
    if (!win || win.isDestroyed()) return
    try {
      win.webContents.send('__tauri_event__', 'agent-event', event)
    } catch (err) {
      console.error('[agent:event-bus] failed to send event', err)
    }
  }
}
