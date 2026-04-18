/**
 * AgentRuntime — agent 循环。
 *
 * while 循环模式:
 *  1. provider.stream(messages, tools) → 逐 chunk 累积文本/工具调用
 *  2. provider 停止一轮后,若产生 tool_use → 逐个过 ApprovalGate → 执行 → 结果塞回 messages → 继续下一轮
 *  3. provider 停止一轮且无 tool_use → finish(done)
 *  4. turn >= maxTurns → finish(max_turns)
 *  5. session.signal.aborted 随时退出 → finish(aborted)
 *  6. provider/工具抛错 → finish(error)
 *
 * Phase 1.3 不绑定具体 provider(Phase 2 用 Vercel AI SDK 填),也没注册实际工具
 * (Phase 3 填)。ApprovalGate 默认 AutoApprovalGate,Phase 1.4 会换成 IPC 版本。
 */

import type { AgentEventBus } from './event-bus.js'
import type { ApprovalGate } from './approval-gate.js'
import { AutoApprovalGate } from './approval-gate.js'
import type { ToolRegistry } from './tool-registry.js'
import { createSessionId, Session } from './session.js'
import type {
  ApprovalDecision,
  ContentBlock,
  ProviderChunk,
  ProviderInterface,
  RunStatus,
  SessionId,
  TaskContext,
  ToolCall,
  ToolResultBlock,
  ToolUseBlock,
} from './types.js'

export interface AgentRuntimeOptions {
  eventBus: AgentEventBus
  provider?: ProviderInterface
  toolRegistry?: ToolRegistry
  approvalGate?: ApprovalGate
  maxTurns?: number
  systemPrompt?: string
}

const DEFAULT_MAX_TURNS = 25

export class AgentRuntime {
  private readonly options: AgentRuntimeOptions
  private readonly gate: ApprovalGate
  private current: Session | null = null

  constructor(options: AgentRuntimeOptions) {
    this.options = options
    this.gate = options.approvalGate ?? new AutoApprovalGate()
  }

  async start(task: string, context: TaskContext): Promise<SessionId> {
    if (this.current && this.current.status === 'running') {
      throw new Error('Agent is already running')
    }
    const session = new Session(createSessionId(), context)
    this.current = session

    if (this.options.systemPrompt) {
      session.messages.push({ role: 'system', content: this.options.systemPrompt })
    }
    session.messages.push({ role: 'user', content: task })

    if (!this.options.provider) {
      this.setStatus(session, 'error')
      this.emitError(session, 'Provider not configured (Phase 2 pending)')
      this.emitFinish(session, 'error', 'Provider not configured')
      return session.id
    }

    this.setStatus(session, 'running')
    try {
      await this.runLoop(session)
    } catch (err) {
      if (session.signal.aborted) {
        this.setStatus(session, 'aborted')
        this.emitFinish(session, 'aborted')
      } else {
        const message = err instanceof Error ? err.message : String(err)
        this.setStatus(session, 'error')
        this.emitError(session, message)
        this.emitFinish(session, 'error', message)
      }
    }
    return session.id
  }

  abort(): void {
    this.current?.abort()
    this.gate.cancelAll?.('aborted')
  }

  approveTool(toolCallId: string, decision: ApprovalDecision, reason?: string): void {
    this.gate.resolve?.(toolCallId, decision, reason)
  }

  continueWithAnswer(_answer: string): void {
    // 预留: 后续 Phase 实现中断追问续写
  }

  getStatus(): RunStatus {
    return this.current?.status ?? 'idle'
  }

  getCurrentSession(): Session | null {
    return this.current
  }

  // ── private ───────────────────────────────────────────────────────────

  private async runLoop(session: Session): Promise<void> {
    const provider = this.options.provider!
    const maxTurns = this.options.maxTurns ?? DEFAULT_MAX_TURNS

    while (!session.signal.aborted) {
      if (session.turn >= maxTurns) {
        this.setStatus(session, 'completed')
        this.emitFinish(
          session,
          'max_turns',
          `Reached max turns (${maxTurns})`,
        )
        return
      }
      session.turn += 1

      const toolDefs = this.options.toolRegistry?.definitions() ?? []
      const stream = provider.stream(
        session.messages,
        toolDefs,
        session.signal,
      )

      const turnResult = await this.consumeProviderStream(session, stream)
      if (session.signal.aborted) {
        this.setStatus(session, 'aborted')
        this.emitFinish(session, 'aborted')
        return
      }

      // 把 assistant 这一轮产出 push 进消息栈
      const assistantContent = this.buildAssistantContent(
        turnResult.text,
        turnResult.toolCalls,
      )
      session.messages.push({ role: 'assistant', content: assistantContent })

      if (turnResult.toolCalls.length === 0) {
        this.setStatus(session, 'completed')
        this.emitFinish(session, 'done')
        return
      }

      const toolResults = await this.executeToolCalls(session, turnResult.toolCalls)
      if (session.signal.aborted) {
        this.setStatus(session, 'aborted')
        this.emitFinish(session, 'aborted')
        return
      }
      session.messages.push({ role: 'user', content: toolResults })
    }

    this.setStatus(session, 'aborted')
    this.emitFinish(session, 'aborted')
  }

  private async consumeProviderStream(
    session: Session,
    stream: AsyncIterable<ProviderChunk>,
  ): Promise<{ text: string; toolCalls: ToolCall[]; finishReason?: string }> {
    let text = ''
    const toolCalls: ToolCall[] = []
    let finishReason: string | undefined

    for await (const chunk of stream) {
      if (session.signal.aborted) break
      switch (chunk.type) {
        case 'text':
          if (chunk.text) {
            text += chunk.text
            this.options.eventBus.emit({
              type: 'text_delta',
              session_id: session.id,
              text: chunk.text,
            })
          }
          break
        case 'tool_call':
          if (chunk.tool_call) {
            toolCalls.push(chunk.tool_call)
            this.options.eventBus.emit({
              type: 'tool_call_start',
              session_id: session.id,
              tool_call: chunk.tool_call,
            })
          }
          break
        case 'usage':
          if (chunk.usage) {
            session.accumulateUsage(chunk.usage)
            this.options.eventBus.emit({
              type: 'usage',
              session_id: session.id,
              usage: chunk.usage,
            })
          }
          break
        case 'finish':
          finishReason = chunk.finish_reason
          break
        case 'error':
          throw new Error(chunk.error ?? 'provider error')
      }
    }
    return { text, toolCalls, finishReason }
  }

  private buildAssistantContent(
    text: string,
    toolCalls: ToolCall[],
  ): ContentBlock[] {
    const blocks: ContentBlock[] = []
    if (text) blocks.push({ type: 'text', text })
    for (const tc of toolCalls) {
      const block: ToolUseBlock = {
        type: 'tool_use',
        id: tc.id,
        name: tc.name,
        input: tc.input,
      }
      blocks.push(block)
    }
    return blocks
  }

  private async executeToolCalls(
    session: Session,
    toolCalls: ToolCall[],
  ): Promise<ToolResultBlock[]> {
    const results: ToolResultBlock[] = []
    const registry = this.options.toolRegistry

    for (const toolCall of toolCalls) {
      if (session.signal.aborted) break

      this.setStatus(session, 'waiting_approval')
      this.options.eventBus.emit({
        type: 'approval_requested',
        session_id: session.id,
        tool_call: toolCall,
      })

      let approval
      try {
        approval = await this.gate.request(toolCall)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        results.push(this.toolErrorResult(toolCall.id, message))
        this.options.eventBus.emit({
          type: 'tool_call_end',
          session_id: session.id,
          tool_call_id: toolCall.id,
          error: message,
        })
        continue
      }

      if (session.signal.aborted) break

      if (approval.decision !== 'approve') {
        const msg = approval.reason ?? 'User rejected tool call'
        results.push(this.toolErrorResult(toolCall.id, msg))
        this.options.eventBus.emit({
          type: 'tool_call_end',
          session_id: session.id,
          tool_call_id: toolCall.id,
          error: msg,
        })
        continue
      }

      this.setStatus(session, 'running')
      const tool = registry?.get(toolCall.name)
      if (!tool) {
        const msg = `Unknown tool: ${toolCall.name}`
        results.push(this.toolErrorResult(toolCall.id, msg))
        this.options.eventBus.emit({
          type: 'tool_call_end',
          session_id: session.id,
          tool_call_id: toolCall.id,
          error: msg,
        })
        continue
      }

      try {
        const result = await tool.execute(toolCall.input, session.signal)
        results.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: result,
        })
        this.options.eventBus.emit({
          type: 'tool_call_end',
          session_id: session.id,
          tool_call_id: toolCall.id,
          result,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        results.push(this.toolErrorResult(toolCall.id, message))
        this.options.eventBus.emit({
          type: 'tool_call_end',
          session_id: session.id,
          tool_call_id: toolCall.id,
          error: message,
        })
      }
    }
    return results
  }

  private toolErrorResult(toolUseId: string, errorMessage: string): ToolResultBlock {
    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: errorMessage,
      is_error: true,
    }
  }

  private setStatus(session: Session, status: RunStatus): void {
    session.status = status
    this.options.eventBus.emit({
      type: 'status',
      session_id: session.id,
      status,
    })
  }

  private emitError(session: Session, message: string): void {
    this.options.eventBus.emit({
      type: 'error',
      session_id: session.id,
      error: message,
    })
  }

  private emitFinish(
    session: Session,
    reason: 'done' | 'aborted' | 'error' | 'max_turns',
    message?: string,
  ): void {
    this.options.eventBus.emit({
      type: 'finish',
      session_id: session.id,
      reason,
      message,
    })
  }
}
