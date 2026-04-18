/**
 * Session — 单次 agent 任务的状态对象。
 *
 * 每调一次 runtime.start() 创建一个 Session,持有 messages / status / abortController / usage 汇总。
 */

import type { Message, RunStatus, SessionId, TaskContext, UsageInfo } from './types.js'

export class Session {
  readonly id: SessionId
  readonly context: TaskContext
  readonly startedAt: number = Date.now()
  readonly abortController = new AbortController()
  messages: Message[] = []
  status: RunStatus = 'idle'
  turn = 0
  totalUsage: UsageInfo = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  }

  constructor(id: SessionId, context: TaskContext) {
    this.id = id
    this.context = context
  }

  get signal(): AbortSignal {
    return this.abortController.signal
  }

  abort(): void {
    if (!this.abortController.signal.aborted) {
      this.abortController.abort()
    }
    if (this.status === 'running' || this.status === 'waiting_approval') {
      this.status = 'aborted'
    }
  }

  accumulateUsage(delta: UsageInfo): void {
    this.totalUsage = {
      prompt_tokens: this.totalUsage.prompt_tokens + delta.prompt_tokens,
      completion_tokens:
        this.totalUsage.completion_tokens + delta.completion_tokens,
      total_tokens: this.totalUsage.total_tokens + delta.total_tokens,
    }
  }
}

export function createSessionId(): SessionId {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
