/**
 * ApprovalGate — agent 决定要调用工具前,可选地等待用户决策。
 *
 * - AutoApprovalGate: 全部自动通过,用于单测或不需交互审批的场景。
 * - IpcApprovalGate: 生产路径,runtime.request 返回 pending promise,
 *   runtime 已发了 `approval_requested` 事件给 renderer,此处等待 renderer 通过
 *   `agent_approve_tool` 回传决策,经 resolve(toolCallId, decision) 解锁 promise。
 *   支持 allowlist(指定工具自动通过)、timeout、cancelAll(abort 时清 pending)。
 */

import type { ApprovalDecision, ToolCall } from './types.js'

export interface ApprovalResult {
  decision: ApprovalDecision
  reason?: string
}

export interface ApprovalGate {
  /**
   * 提交一次审批请求。runtime 会 await 这个 promise,等待期间 session 状态设为
   * 'waiting_approval'。实现方负责在不需要审批时直接 resolve。
   */
  request(toolCall: ToolCall): Promise<ApprovalResult>

  /** 外部(通常是 UI) 给出决策,必要时实现方要能对应上 request 的 promise */
  resolve?(toolCallId: string, decision: ApprovalDecision, reason?: string): void

  /** 取消所有 pending 的审批(abort/关闭时调用) */
  cancelAll?(reason?: string): void
}

/**
 * 默认审批门 — 所有工具自动通过。用于单测和 allowlist 外无需交互的场景。
 */
export class AutoApprovalGate implements ApprovalGate {
  async request(_toolCall: ToolCall): Promise<ApprovalResult> {
    return { decision: 'approve' }
  }
  resolve(): void {
    /* noop */
  }
  cancelAll(): void {
    /* noop */
  }
}

export type AllowList =
  | readonly string[]
  | ((toolCall: ToolCall) => boolean)

export interface IpcApprovalGateOptions {
  /** 工具名白名单: 命中时直接 auto approve,不问 renderer。默认空 */
  allowlist?: AllowList
  /** 等待决策的超时(毫秒)。默认不超时,必须由 UI 决策 */
  timeoutMs?: number
}

interface PendingEntry {
  resolve: (result: ApprovalResult) => void
  reject: (err: Error) => void
  timer?: ReturnType<typeof setTimeout>
  toolCall: ToolCall
}

/**
 * IPC 审批门 — request 时创建 pending promise,resolve/cancelAll 由 IPC 路由触发。
 * 完成 runtime 与 renderer 用户审批 UI 的桥接。
 */
export class IpcApprovalGate implements ApprovalGate {
  private readonly options: IpcApprovalGateOptions
  private readonly pending = new Map<string, PendingEntry>()

  constructor(options: IpcApprovalGateOptions = {}) {
    this.options = options
  }

  async request(toolCall: ToolCall): Promise<ApprovalResult> {
    if (this.isAllowed(toolCall)) {
      return { decision: 'approve', reason: 'auto:allowlist' }
    }
    if (this.pending.has(toolCall.id)) {
      // 不应发生(id 是 provider 发的,正常唯一);保险起见覆盖旧的
      const old = this.pending.get(toolCall.id)
      if (old) {
        if (old.timer) clearTimeout(old.timer)
        old.reject(new Error('Superseded by duplicate approval request'))
      }
      this.pending.delete(toolCall.id)
    }
    return new Promise<ApprovalResult>((resolve, reject) => {
      const timer = this.options.timeoutMs
        ? setTimeout(() => {
            const entry = this.pending.get(toolCall.id)
            if (!entry) return
            this.pending.delete(toolCall.id)
            entry.reject(
              new Error(
                `Approval timed out after ${this.options.timeoutMs}ms for ${toolCall.name}`,
              ),
            )
          }, this.options.timeoutMs)
        : undefined
      this.pending.set(toolCall.id, { resolve, reject, timer, toolCall })
    })
  }

  resolve(toolCallId: string, decision: ApprovalDecision, reason?: string): void {
    const entry = this.pending.get(toolCallId)
    if (!entry) return
    this.pending.delete(toolCallId)
    if (entry.timer) clearTimeout(entry.timer)
    entry.resolve({ decision, reason })
  }

  cancelAll(reason = 'cancelled'): void {
    const entries = Array.from(this.pending.values())
    this.pending.clear()
    for (const entry of entries) {
      if (entry.timer) clearTimeout(entry.timer)
      entry.reject(new Error(reason))
    }
  }

  /** 当前待审批的工具调用(用于重启/重连时让 UI 恢复) */
  listPending(): ToolCall[] {
    return Array.from(this.pending.values()).map((e) => e.toolCall)
  }

  private isAllowed(toolCall: ToolCall): boolean {
    const list = this.options.allowlist
    if (!list) return false
    if (typeof list === 'function') return list(toolCall)
    return list.includes(toolCall.name)
  }
}
