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
import type { DebugLog } from './debug-log.js'
import type { MemoryStore } from './memory-store.js'
import type { ToolRegistry } from './tool-registry.js'
import { createSessionId, Session } from './session.js'
import type {
  AgentEvent,
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
  /** 静态 provider — 主要用于测试;生产路径用 providerSelector */
  provider?: ProviderInterface
  /** 运行时解析 provider(从 settings store 读 active provider + secure store 取 apiKey) */
  providerSelector?: () => Promise<ProviderInterface | null> | ProviderInterface | null
  toolRegistry?: ToolRegistry
  approvalGate?: ApprovalGate
  debugLog?: DebugLog
  memoryStore?: MemoryStore
  maxTurns?: number
  systemPrompt?: string
  /**
   * 每次 start 之前调用,可用来刷新 ToolRegistry(例如同步 MCP 工具)或把
   * 当前 task 的 workspace_path 暴露给 apply_patch 之类需要 rootDir 的工具。
   * 失败不阻断,只记日志。
   */
  beforeStart?: (context: TaskContext) => Promise<void> | void
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
    if (this.options.beforeStart) {
      try {
        await this.options.beforeStart(context)
      } catch (err) {
        this.options.debugLog?.log(
          'agent.beforeStart.error',
          { error: err instanceof Error ? err.message : String(err) },
        )
      }
    }
    const session = new Session(createSessionId(), context)
    this.current = session
    this.options.debugLog?.log('session.start', { task, context }, session.id)
    // 若提供了 vault 根目录,持久化 turn log 到 vault/.lumina/sessions/
    if (context.workspace_path) {
      this.options.memoryStore?.startSession(session.id, context.workspace_path)
    }
    this.options.memoryStore?.appendTurn({
      kind: 'user.message',
      payload: { task },
    })

    if (this.options.systemPrompt) {
      session.messages.push({ role: 'system', content: this.options.systemPrompt })
    }
    session.messages.push({ role: 'user', content: task })

    let provider: ProviderInterface | null | undefined = this.options.provider
    if (!provider && this.options.providerSelector) {
      try {
        provider = await this.options.providerSelector()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        this.setStatus(session, 'error')
        this.emitError(session, `Provider selection failed: ${message}`)
        this.emitFinish(session, 'error', message)
        this.options.memoryStore?.endSession()
        return session.id
      }
    }
    if (!provider) {
      this.setStatus(session, 'error')
      this.emitError(session, 'Provider not configured (set active provider + apiKey in Settings)')
      this.emitFinish(session, 'error', 'Provider not configured')
      this.options.memoryStore?.endSession()
      return session.id
    }

    this.setStatus(session, 'running')
    try {
      await this.runLoop(session, provider)
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
    } finally {
      // 成功 / 失败 / abort 都要收尾 JSONL
      this.options.memoryStore?.endSession()
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

  private emitEvent(session: Session, event: AgentEvent): void {
    this.options.eventBus.emit(event)
    // Write a debug log mirror; we derive kind from event.type
    this.options.debugLog?.log(`agent.${event.type}`, event, session.id)
  }

  private async runLoop(session: Session, provider: ProviderInterface): Promise<void> {
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
      this.options.debugLog?.log(
        'turn.start',
        { turn: session.turn, messages: session.messages.length },
        session.id,
      )

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
      this.options.memoryStore?.appendTurn({
        kind: 'assistant.turn',
        payload: {
          turn: session.turn,
          content: assistantContent,
          usage: session.totalUsage,
        },
      })

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
      this.options.memoryStore?.appendTurn({
        kind: 'tool.results',
        payload: { turn: session.turn, results: toolResults },
      })
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
            this.emitEvent(session, {
              type: 'text_delta',
              session_id: session.id,
              text: chunk.text,
            })
          }
          break
        case 'tool_call':
          if (chunk.tool_call) {
            toolCalls.push(chunk.tool_call)
            this.emitEvent(session, {
              type: 'tool_call_start',
              session_id: session.id,
              tool_call: chunk.tool_call,
            })
          }
          break
        case 'usage':
          if (chunk.usage) {
            session.accumulateUsage(chunk.usage)
            this.emitEvent(session, {
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
      this.emitEvent(session, {
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
        this.emitEvent(session, {
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
        this.emitEvent(session, {
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
        this.emitEvent(session, {
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
        this.emitEvent(session, {
          type: 'tool_call_end',
          session_id: session.id,
          tool_call_id: toolCall.id,
          result,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        results.push(this.toolErrorResult(toolCall.id, message))
        this.emitEvent(session, {
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
    this.emitEvent(session, {
      type: 'status',
      session_id: session.id,
      status,
    })
  }

  private emitError(session: Session, message: string): void {
    this.emitEvent(session, {
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
    this.emitEvent(session, {
      type: 'finish',
      session_id: session.id,
      reason,
      message,
    })
  }
}
