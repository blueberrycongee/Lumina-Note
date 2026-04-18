/**
 * AgentEventBus — 把 agent 事件推到当前主窗口 renderer。
 *
 * 单条 IPC channel 'agent:event' 承载所有 AgentEvent 子类型。Renderer 按 event.type 分发。
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
      win.webContents.send('agent:event', event)
    } catch (err) {
      console.error('[agent:event-bus] failed to send event', err)
    }
  }
}
