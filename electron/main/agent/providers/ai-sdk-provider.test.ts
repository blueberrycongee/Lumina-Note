import { describe, expect, it } from 'vitest'

import {
  convertMessages,
  convertTools,
  mapFullStream,
} from './ai-sdk-provider.js'
import type { Message, ProviderChunk, ToolDefinition } from '../types.js'

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const v of iter) out.push(v)
  return out
}

async function* scripted<T>(items: T[]): AsyncIterable<T> {
  for (const v of items) {
    yield v
  }
}

describe('mapFullStream', () => {
  it('maps text-delta → ProviderChunk text', async () => {
    const parts = scripted([
      { type: 'text-start', id: 't1' } as const,
      { type: 'text-delta', id: 't1', text: 'Hello' } as const,
      { type: 'text-delta', id: 't1', text: ' world' } as const,
      { type: 'text-end', id: 't1' } as const,
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chunks = await collect(mapFullStream(parts as any))
    expect(chunks).toEqual([
      { type: 'text', text: 'Hello' },
      { type: 'text', text: ' world' },
    ])
  })

  it('maps reasoning-delta → ProviderChunk text (merged)', async () => {
    const parts = scripted([
      { type: 'reasoning-start', id: 'r1' } as const,
      { type: 'reasoning-delta', id: 'r1', text: 'thinking...' } as const,
      { type: 'reasoning-end', id: 'r1' } as const,
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chunks = await collect(mapFullStream(parts as any))
    expect(chunks).toEqual([{ type: 'text', text: 'thinking...' }])
  })

  it('maps tool-call → ProviderChunk tool_call', async () => {
    const parts = scripted([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'read',
        input: { path: 'a.md' },
      } as const,
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chunks = await collect(mapFullStream(parts as any))
    expect(chunks).toEqual([
      {
        type: 'tool_call',
        tool_call: { id: 'call-1', name: 'read', input: { path: 'a.md' } },
      },
    ])
  })

  it('maps finish → ProviderChunk usage + finish', async () => {
    const parts = scripted([
      {
        type: 'finish',
        finishReason: 'stop',
        rawFinishReason: 'stop',
        totalUsage: {
          inputTokens: 12,
          outputTokens: 34,
          totalTokens: 46,
        },
      } as const,
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chunks = await collect(mapFullStream(parts as any))
    expect(chunks).toEqual([
      {
        type: 'usage',
        usage: { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46 },
      },
      { type: 'finish', finish_reason: 'stop' },
    ])
  })

  it('maps error → ProviderChunk error (Error, string, object)', async () => {
    const asErr = scripted([{ type: 'error', error: new Error('boom') } as const])
    const asStr = scripted([{ type: 'error', error: 'plain' } as const])
    const asObj = scripted([{ type: 'error', error: { code: 'X' } } as const])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await collect(mapFullStream(asErr as any))).toEqual([
      { type: 'error', error: 'boom' },
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await collect(mapFullStream(asStr as any))).toEqual([
      { type: 'error', error: 'plain' },
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await collect(mapFullStream(asObj as any))).toEqual([
      { type: 'error', error: '{"code":"X"}' },
    ])
  })

  it('abort → ProviderChunk finish(stop)', async () => {
    const parts = scripted([{ type: 'abort', reason: 'user' } as const])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chunks: ProviderChunk[] = await collect(mapFullStream(parts as any))
    expect(chunks).toEqual([{ type: 'finish', finish_reason: 'stop' }])
  })

  it('ignores unrelated SDK chunks (start, start-step, finish-step, raw)', async () => {
    const parts = scripted([
      { type: 'start' } as const,
      { type: 'start-step', request: {}, warnings: [] } as const,
      { type: 'raw', rawValue: {} } as const,
      { type: 'finish-step', response: {}, usage: {}, finishReason: 'stop' } as const,
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chunks = await collect(mapFullStream(parts as any))
    expect(chunks).toEqual([])
  })
})

describe('convertMessages', () => {
  it('keeps system/user/assistant plain text messages as-is', () => {
    const input: Message[] = [
      { role: 'system', content: 'you are helpful' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]
    const out = convertMessages(input) as unknown as Array<{ role: string; content: unknown }>
    expect(out.length).toBe(3)
    expect(out[0]).toEqual({ role: 'system', content: 'you are helpful' })
    expect(out[1]).toEqual({ role: 'user', content: 'hi' })
    expect(out[2]).toEqual({ role: 'assistant', content: 'hello' })
  })

  it('splits user tool_result blocks into a separate role=tool message', () => {
    const input: Message[] = [
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call-1',
            content: '42',
          },
        ],
      },
    ]
    const out = convertMessages(input) as unknown as Array<{
      role: string
      content: Array<{ type: string; toolCallId?: string }>
    }>
    expect(out).toHaveLength(1)
    expect(out[0].role).toBe('tool')
    expect(out[0].content[0].type).toBe('tool-result')
    expect(out[0].content[0].toolCallId).toBe('call-1')
  })

  it('maps assistant tool_use blocks to tool-call SDK blocks', () => {
    const input: Message[] = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'using tool' },
          {
            type: 'tool_use',
            id: 'c1',
            name: 'read',
            input: { path: 'a.md' },
          },
        ],
      },
    ]
    const out = convertMessages(input) as unknown as Array<{
      role: string
      content: Array<{ type: string }>
    }>
    expect(out[0].role).toBe('assistant')
    const kinds = out[0].content.map((b) => b.type)
    expect(kinds).toEqual(['text', 'tool-call'])
  })
})

describe('convertTools', () => {
  it('returns undefined for empty tool list', () => {
    expect(convertTools([])).toBeUndefined()
  })

  it('builds a named tool map with description + schema', () => {
    const defs: ToolDefinition[] = [
      {
        name: 'read',
        description: 'read a file',
        input_schema: { type: 'object', properties: { path: { type: 'string' } } },
      },
    ]
    const out = convertTools(defs) as unknown as Record<string, { description?: string }>
    expect(Object.keys(out)).toEqual(['read'])
    expect(out.read.description).toBe('read a file')
  })
})
