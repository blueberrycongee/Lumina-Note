import { describe, expect, it } from 'vitest'
import { MockLanguageModelV3 } from 'ai/test'

import { testProviderConnection } from './test-connection.js'

function successModel(): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: 'text', text: 'pong' }],
      finishReason: 'stop',
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
      },
      warnings: [],
    }),
  })
}

function failingModel(message: string): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => {
      throw new Error(message)
    },
  })
}

describe('testProviderConnection', () => {
  it('returns success + latency on a working provider', async () => {
    const result = await testProviderConnection(
      'anthropic',
      'claude-opus-4-7',
      { apiKey: 'sk-test' },
      {
        modelBuilder: () => successModel(),
      },
    )
    expect(result.success).toBe(true)
    expect(typeof result.latencyMs).toBe('number')
    expect(result.error).toBeUndefined()
  })

  it('returns failure with error message when provider throws', async () => {
    const result = await testProviderConnection(
      'openai',
      'gpt-5.2-mini',
      { apiKey: 'sk-bad' },
      {
        modelBuilder: () => failingModel('401 Unauthorized'),
      },
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('401 Unauthorized')
  })

  it('fails fast when modelId is empty', async () => {
    const result = await testProviderConnection(
      'anthropic',
      '',
      { apiKey: 'sk' },
      { modelBuilder: () => successModel() },
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('modelId is required')
  })

  it('reports the real-model factory exception when builder throws', async () => {
    const result = await testProviderConnection(
      'anthropic',
      'claude-opus-4-7',
      { apiKey: 'sk' },
      {
        modelBuilder: () => {
          throw new Error('boom in builder')
        },
      },
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('boom in builder')
  })
})
