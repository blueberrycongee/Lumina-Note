/**
 * AgentRuntime — agent 循环的入口(骨架版)。
 *
 * Phase 1.1 只建立对外 API 和 Session 生命周期,真正的 while 循环和 provider 调度由 Phase 1.3 填入,
 * approval gate 由 Phase 1.4 填入,provider 实现(AI SDK)由 Phase 2 提供。
 */

import type { AgentEventBus } from './event-bus.js'
import { createSessionId, Session } from './session.js'
import type {
  ApprovalDecision,
  ProviderInterface,
  RunStatus,
  SessionId,
  TaskContext,
  ToolDefinition,
} from './types.js'

export interface AgentRuntimeOptions {
  eventBus: AgentEventBus
  provider?: ProviderInterface
  tools?: ToolDefinition[]
  maxTurns?: number
}

export class AgentRuntime {
  private readonly options: AgentRuntimeOptions
  private current: Session | null = null

  constructor(options: AgentRuntimeOptions) {
    this.options = options
  }

  /**
   * 启动一次任务。返回 sessionId。具体 loop 实现等 Phase 1.3。
   * 在骨架阶段直接标记为 error 并结束,以便 renderer 的老路径仍可收到 finish 事件不会挂起。
   */
  async start(task: string, context: TaskContext): Promise<SessionId> {
    if (this.current && this.current.status === 'running') {
      throw new Error('Agent is already running')
    }
    const session = new Session(createSessionId(), context)
    this.current = session
    session.messages.push({ role: 'user', content: task })
    session.status = 'error'
    this.options.eventBus.emit({
      type: 'status',
      session_id: session.id,
      status: session.status,
    })
    this.options.eventBus.emit({
      type: 'finish',
      session_id: session.id,
      reason: 'error',
      message: 'Agent runtime not yet implemented (Phase 1.3 in progress)',
    })
    return session.id
  }

  abort(): void {
    this.current?.abort()
  }

  approveTool(
    _toolCallId: string,
    _decision: ApprovalDecision,
    _reason?: string,
  ): void {
    // Phase 1.4 填 approval gate
  }

  continueWithAnswer(_answer: string): void {
    // Phase 1.3 会用于处理中断后的续写
  }

  getStatus(): RunStatus {
    return this.current?.status ?? 'idle'
  }

  getCurrentSession(): Session | null {
    return this.current
  }
}
