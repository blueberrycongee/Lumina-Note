import { describe, expect, it } from 'vitest'

import { AgentEventBus } from './event-bus.js'
import { AgentRuntime } from './runtime.js'
import { ToolRegistry, type Tool } from './tool-registry.js'
import type {
  AgentEvent,
  ProviderChunk,
  ProviderInterface,
  TaskContext,
  ToolCall,
  Message,
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

class ScriptedProvider implements ProviderInterface {
  public calls = 0
  public receivedMessages: Message[][] = []
  constructor(
    private readonly turns: ProviderChunk[][],
  ) {}
  async *stream(
    messages: Message[],
    _tools: unknown[],
    signal: AbortSignal,
  ): AsyncIterable<ProviderChunk> {
    this.receivedMessages.push([...messages])
    const script = this.turns[this.calls] ?? []
    this.calls += 1
    for (const chunk of script) {
      if (signal.aborted) return
      yield chunk
    }
  }
}

function baseContext(): TaskContext {
  return { workspace_path: '/tmp/workspace' }
}

describe('AgentRuntime', () => {
  it('emits text_delta + finish(done) for text-only responses', async () => {
    const bus = new RecordingEventBus()
    const provider = new ScriptedProvider([
      [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: ' world' },
        { type: 'finish', finish_reason: 'stop' },
      ],
    ])
    const runtime = new AgentRuntime({ eventBus: bus, provider })
    await runtime.start('hi', baseContext())

    const textDeltas = bus.events.filter((e) => e.type === 'text_delta')
    const finishEvents = bus.events.filter((e) => e.type === 'finish')
    expect(textDeltas.map((e) => (e as Extract<AgentEvent, { type: 'text_delta' }>).text)).toEqual([
      'Hello',
      ' world',
    ])
    expect(finishEvents).toHaveLength(1)
    expect((finishEvents[0] as Extract<AgentEvent, { type: 'finish' }>).reason).toBe('done')
    expect(runtime.getStatus()).toBe('completed')
  })

  it('stops at maxTurns when provider keeps requesting tool calls', async () => {
    const bus = new RecordingEventBus()
    const infiniteToolCall: ProviderChunk = {
      type: 'tool_call',
      tool_call: { id: 'tc', name: 'echo', input: { x: 1 } },
    }
    const provider = new ScriptedProvider(
      Array.from({ length: 10 }, () => [infiniteToolCall, { type: 'finish' }]),
    )
    const registry = new ToolRegistry()
    const echoTool: Tool = {
      name: 'echo',
      description: 'echo',
      input_schema: {},
      async execute() {
        return 'ok'
      },
    }
    registry.register(echoTool)

    const runtime = new AgentRuntime({
      eventBus: bus,
      provider,
      toolRegistry: registry,
      maxTurns: 3,
    })
    await runtime.start('hi', baseContext())

    const finish = bus.events.find((e) => e.type === 'finish') as
      | Extract<AgentEvent, { type: 'finish' }>
      | undefined
    expect(finish?.reason).toBe('max_turns')
    expect(provider.calls).toBe(3)
  })

  it('aborts immediately when runtime.abort() is called', async () => {
    const bus = new RecordingEventBus()
    const provider: ProviderInterface = {
      // eslint-disable-next-line require-yield
      async *stream(_messages, _tools, signal) {
        await new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          })
          setTimeout(resolve, 1000)
        })
      },
    }

    const runtime = new AgentRuntime({ eventBus: bus, provider })
    const promise = runtime.start('long task', baseContext())
    runtime.abort()
    await promise

    const finish = bus.events.find((e) => e.type === 'finish') as
      | Extract<AgentEvent, { type: 'finish' }>
      | undefined
    expect(finish?.reason).toBe('aborted')
    expect(runtime.getStatus()).toBe('aborted')
  })

  it('bubbles provider error as finish(error)', async () => {
    const bus = new RecordingEventBus()
    const provider = new ScriptedProvider([
      [{ type: 'error', error: 'boom' }],
    ])
    const runtime = new AgentRuntime({ eventBus: bus, provider })
    await runtime.start('hi', baseContext())

    const errorEvent = bus.events.find((e) => e.type === 'error') as
      | Extract<AgentEvent, { type: 'error' }>
      | undefined
    const finishEvent = bus.events.find((e) => e.type === 'finish') as
      | Extract<AgentEvent, { type: 'finish' }>
      | undefined
    expect(errorEvent?.error).toBe('boom')
    expect(finishEvent?.reason).toBe('error')
    expect(runtime.getStatus()).toBe('error')
  })

  it('executes tool call and loops with the result', async () => {
    const bus = new RecordingEventBus()
    const toolCall: ToolCall = { id: 'tc1', name: 'add', input: { a: 2, b: 3 } }
    const provider = new ScriptedProvider([
      // turn 1: request tool
      [
        { type: 'text', text: 'Let me compute' },
        { type: 'tool_call', tool_call: toolCall },
        { type: 'finish' },
      ],
      // turn 2: final answer
      [
        { type: 'text', text: 'Result is 5' },
        { type: 'finish' },
      ],
    ])
    const registry = new ToolRegistry()
    const addTool: Tool = {
      name: 'add',
      description: 'adds a and b',
      input_schema: { type: 'object' },
      async execute(input) {
        return String(Number(input.a) + Number(input.b))
      },
    }
    registry.register(addTool)

    const runtime = new AgentRuntime({
      eventBus: bus,
      provider,
      toolRegistry: registry,
    })
    await runtime.start('compute 2+3', baseContext())

    expect(provider.calls).toBe(2)
    // turn-2 request should include the tool_result
    const turn2Messages = provider.receivedMessages[1]
    const last = turn2Messages[turn2Messages.length - 1]
    expect(Array.isArray(last.content)).toBe(true)
    const toolResult = (last.content as { type: string; content?: string }[]).find(
      (b) => b.type === 'tool_result',
    )
    expect(toolResult?.content).toBe('5')

    const finish = bus.events.find((e) => e.type === 'finish') as
      | Extract<AgentEvent, { type: 'finish' }>
      | undefined
    expect(finish?.reason).toBe('done')
  })

  it('records tool_call_end error when requested tool is unknown', async () => {
    const bus = new RecordingEventBus()
    const provider = new ScriptedProvider([
      [
        { type: 'tool_call', tool_call: { id: 't', name: 'missing', input: {} } },
        { type: 'finish' },
      ],
      [{ type: 'text', text: 'sorry' }, { type: 'finish' }],
    ])
    const runtime = new AgentRuntime({ eventBus: bus, provider })
    await runtime.start('hi', baseContext())

    const end = bus.events.find((e) => e.type === 'tool_call_end') as
      | Extract<AgentEvent, { type: 'tool_call_end' }>
      | undefined
    expect(end?.error).toContain('Unknown tool')
  })

  it('returns error finish when no provider configured', async () => {
    const bus = new RecordingEventBus()
    const runtime = new AgentRuntime({ eventBus: bus })
    await runtime.start('hi', baseContext())

    const finish = bus.events.find((e) => e.type === 'finish') as
      | Extract<AgentEvent, { type: 'finish' }>
      | undefined
    expect(finish?.reason).toBe('error')
    expect(runtime.getStatus()).toBe('error')
  })
})
