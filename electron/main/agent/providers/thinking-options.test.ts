import { describe, expect, it } from 'vitest'

import { buildModelOptionsBlob } from './thinking-options'

describe('thinking-options (opencode bridge translator)', () => {
  describe('OpenAI GPT-5.5', () => {
    it('emits the nested reasoning.effort shape that OpenAI SDK reads', () => {
      expect(
        buildModelOptionsBlob({
          provider: 'openai',
          modelId: 'gpt-5.5',
          reasoningEffort: 'high',
        }),
      ).toEqual({ reasoning: { effort: 'high' } })

      expect(
        buildModelOptionsBlob({
          provider: 'openai',
          modelId: 'gpt-5.5-pro',
          reasoningEffort: 'xhigh',
        }),
      ).toEqual({ reasoning: { effort: 'xhigh' } })
    })

    it('returns undefined when no effort is selected (OpenAI default applies)', () => {
      expect(
        buildModelOptionsBlob({
          provider: 'openai',
          modelId: 'gpt-5.5',
        }),
      ).toBeUndefined()
    })

    it('does not patch legacy GPT-5.4', () => {
      expect(
        buildModelOptionsBlob({
          provider: 'openai',
          modelId: 'gpt-5.4',
          reasoningEffort: 'high',
        }),
      ).toBeUndefined()
    })
  })

  describe('DeepSeek V4', () => {
    it('emits the flat reasoning_effort shape that DeepSeek SDK reads', () => {
      expect(
        buildModelOptionsBlob({
          provider: 'deepseek',
          modelId: 'deepseek-v4-pro',
          thinkingMode: 'thinking',
          reasoningEffort: 'high',
        }),
      ).toEqual({
        thinking: { type: 'enabled' },
        reasoning_effort: 'high',
      })
    })

    it('Flash sends thinking enable but never reasoning_effort', () => {
      expect(
        buildModelOptionsBlob({
          provider: 'deepseek',
          modelId: 'deepseek-v4-flash',
          thinkingMode: 'thinking',
          reasoningEffort: 'high',
        }),
      ).toEqual({ thinking: { type: 'enabled' } })
    })

    it('returns undefined unless mode is thinking', () => {
      expect(
        buildModelOptionsBlob({
          provider: 'deepseek',
          modelId: 'deepseek-v4-pro',
          thinkingMode: 'instant',
        }),
      ).toBeUndefined()

      expect(
        buildModelOptionsBlob({
          provider: 'deepseek',
          modelId: 'deepseek-v4-pro',
          thinkingMode: 'auto',
        }),
      ).toBeUndefined()
    })

    it('does not patch legacy chat / reasoner', () => {
      expect(
        buildModelOptionsBlob({
          provider: 'deepseek',
          modelId: 'deepseek-chat',
          thinkingMode: 'thinking',
        }),
      ).toBeUndefined()
    })
  })

  describe('Moonshot Kimi K2.5 (openai-compatible)', () => {
    it('only sends a disable patch when user forces instant', () => {
      expect(
        buildModelOptionsBlob({
          provider: 'openai-compatible',
          modelId: 'kimi-k2.5',
          thinkingMode: 'instant',
        }),
      ).toEqual({ thinking: { type: 'disabled' } })

      expect(
        buildModelOptionsBlob({
          provider: 'openai-compatible',
          modelId: 'kimi-k2.5',
          thinkingMode: 'thinking',
        }),
      ).toBeUndefined()
    })
  })

  it('returns undefined for any model that does not expose a thinking axis', () => {
    expect(
      buildModelOptionsBlob({
        provider: 'anthropic',
        modelId: 'claude-opus-4-7',
      }),
    ).toBeUndefined()

    expect(
      buildModelOptionsBlob({
        provider: 'openai',
        modelId: 'gpt-4o',
        reasoningEffort: 'high',
      }),
    ).toBeUndefined()
  })
})
