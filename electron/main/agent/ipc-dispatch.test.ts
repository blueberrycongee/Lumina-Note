/**
 * 集成测试 — 覆盖 approval 端到端往返:
 *   provider 在 turn 1 发起 tool_call → runtime emits approval_requested
 *   → 测试侧 await 拿到 tool_call_id → 通过 dispatchAgentCommand('agent_approve_tool',...) 解锁
 *   → tool 执行 → tool_call_end(result) → turn 2 finish(done)
 *
 * 同时验证:
 *   - 新 schema { tool_call_id, decision } 与旧 schema { requestId, approved } 都能解锁
 *   - 不识别的 schema 抛错
 */

import { describe, expect, it } from 'vitest'

import { IpcApprovalGate } from './approval-gate.js'
import { AgentEventBus } from './event-bus.js'
import { dispatchAgentCommand } from './ipc-dispatch.js'
import { AgentRuntime } from './runtime.js'
import { ToolRegistry, type Tool } from './tool-registry.js'
import type {
  AgentEvent,
  Message,
  ProviderChunk,
  ProviderInterface,
  TaskContext,
  ToolCall,
} from './types.js'

class RecordingEventBus extends AgentEventBus {
  public events: AgentEvent[] = []
  constructor() {
    super(() => null)
  }
  emit(event: AgentEvent): void {
    this.events.push(event)
  }
}

class TwoTurnProvider implements ProviderInterface {
  public calls = 0
  constructor(private readonly turns: ProviderChunk[][]) {}
  async *stream(
    _messages: Message[],
    _tools: unknown[],
    signal: AbortSignal,
  ): AsyncIterable<ProviderChunk> {
    const script = this.turns[this.calls] ?? []
    this.calls += 1
    for (const chunk of script) {
      if (signal.aborted) return
      yield chunk
    }
  }
}

function buildHarness() {
  const bus = new RecordingEventBus()
  const gate = new IpcApprovalGate()
  const registry = new ToolRegistry()
  const tool: Tool = {
    name: 'echo',
    description: 'echoes',
    input_schema: {},
    requires_approval: true,
    async execute(input) {
      return `echoed:${JSON.stringify(input)}`
    },
  }
  registry.register(tool)

  const toolCall: ToolCall = { id: 'tc-1', name: 'echo', input: { msg: 'hi' } }
  const provider = new TwoTurnProvider([
    [
      { type: 'tool_call', tool_call: toolCall },
      { type: 'finish', finish_reason: 'tool_use' },
    ],
    [
      { type: 'text', text: 'all done' },
      { type: 'finish', finish_reason: 'stop' },
    ],
  ])
  const runtime = new AgentRuntime({
    eventBus: bus,
    provider,
    toolRegistry: registry,
    approvalGate: gate,
  })
  return { bus, gate, runtime, toolCall }
}

const ctx: TaskContext = { workspace_path: '/tmp/workspace' }

async function waitForEvent(
  bus: RecordingEventBus,
  predicate: (e: AgentEvent) => boolean,
  timeoutMs = 1000,
): Promise<AgentEvent> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const found = bus.events.find(predicate)
    if (found) return found
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error('timed out waiting for event')
}

describe('agent_approve_tool dispatch (new + legacy schema)', () => {
  it('round-trips with new { tool_call_id, decision } shape', async () => {
    const { bus, runtime } = buildHarness()
    const runPromise = runtime.start('please echo', ctx)

    const approvalEvt = await waitForEvent(bus, (e) => e.type === 'approval_requested')
    expect(approvalEvt.type).toBe('approval_requested')
    const tcId = (approvalEvt as Extract<AgentEvent, { type: 'approval_requested' }>)
      .tool_call.id

    await dispatchAgentCommand(
      { runtime },
      'agent_approve_tool',
      { tool_call_id: tcId, decision: 'approve' },
    )
    await runPromise

    const finish = bus.events.find((e) => e.type === 'finish') as
      | Extract<AgentEvent, { type: 'finish' }>
      | undefined
    const end = bus.events.find((e) => e.type === 'tool_call_end') as
      | Extract<AgentEvent, { type: 'tool_call_end' }>
      | undefined
    expect(finish?.reason).toBe('done')
    expect(end?.result).toContain('echoed:')
  })

  it('round-trips with legacy { requestId, approved } shape', async () => {
    const { bus, runtime } = buildHarness()
    const runPromise = runtime.start('please echo', ctx)

    const approvalEvt = await waitForEvent(bus, (e) => e.type === 'approval_requested')
    const tcId = (approvalEvt as Extract<AgentEvent, { type: 'approval_requested' }>)
      .tool_call.id

    await dispatchAgentCommand(
      { runtime },
      'agent_approve_tool',
      { requestId: tcId, approved: true },
    )
    await runPromise

    const finish = bus.events.find((e) => e.type === 'finish') as
      | Extract<AgentEvent, { type: 'finish' }>
      | undefined
    expect(finish?.reason).toBe('done')
  })

  it('legacy { requestId, approved: false } yields rejection error in tool_call_end', async () => {
    const { bus, runtime } = buildHarness()
    const runPromise = runtime.start('please echo', ctx)

    const approvalEvt = await waitForEvent(bus, (e) => e.type === 'approval_requested')
    const tcId = (approvalEvt as Extract<AgentEvent, { type: 'approval_requested' }>)
      .tool_call.id

    await dispatchAgentCommand(
      { runtime },
      'agent_approve_tool',
      { requestId: tcId, approved: false, reason: 'no thanks' },
    )
    await runPromise

    const end = bus.events.find((e) => e.type === 'tool_call_end') as
      | Extract<AgentEvent, { type: 'tool_call_end' }>
      | undefined
    expect(end?.error).toContain('no thanks')
  })

  it('throws on unrecognized approval payload shape', async () => {
    const { runtime } = buildHarness()
    await expect(
      dispatchAgentCommand({ runtime }, 'agent_approve_tool', { foo: 'bar' }),
    ).rejects.toThrow(/expected/)
  })
})

describe('approval_requested event payload', () => {
  it('carries tool_call_id, name, input', async () => {
    const { bus, runtime } = buildHarness()
    const runPromise = runtime.start('please echo', ctx)

    const approvalEvt = (await waitForEvent(
      bus,
      (e) => e.type === 'approval_requested',
    )) as Extract<AgentEvent, { type: 'approval_requested' }>
    expect(approvalEvt.tool_call.id).toBe('tc-1')
    expect(approvalEvt.tool_call.name).toBe('echo')
    expect(approvalEvt.tool_call.input).toEqual({ msg: 'hi' })

    // unblock so the runtime promise resolves cleanly for the test runner
    await dispatchAgentCommand(
      { runtime },
      'agent_approve_tool',
      { tool_call_id: 'tc-1', decision: 'approve' },
    )
    await runPromise
  })
})
