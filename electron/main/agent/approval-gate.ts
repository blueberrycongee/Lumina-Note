/**
 * ApprovalGate — agent 决定要调用工具前,可选地等待用户决策。
 *
 * Phase 1.3 只定义接口 + 默认全部自动通过的 AutoApprovalGate。Phase 1.4 会
 * 用 IPC 接通 renderer,支持真实交互式审批。
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
 * 默认审批门 — 所有工具自动通过。仅用于 Phase 1.3 自测和测试环境。
 * Phase 1.4 会提供 IpcApprovalGate。
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
