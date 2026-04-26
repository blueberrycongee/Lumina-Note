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

    it('emits the openai-reasoning blob for GPT-5.4 (W2: now effort-only)', () => {
      // W2: GPT-5.4 family is no longer treated as legacy/no-effort.
      expect(
        buildModelOptionsBlob({
          provider: 'openai',
          modelId: 'gpt-5.4',
          reasoningEffort: 'high',
        }),
      ).toEqual({ reasoning: { effort: 'high' } })

      expect(
        buildModelOptionsBlob({
          provider: 'openai',
          modelId: 'gpt-5.4-mini',
          reasoningEffort: 'low',
        }),
      ).toEqual({ reasoning: { effort: 'low' } })
    })

    it('accepts the new `none` and `xhigh` efforts', () => {
      expect(
        buildModelOptionsBlob({
          provider: 'openai',
          modelId: 'gpt-5.5',
          reasoningEffort: 'none',
        }),
      ).toEqual({ reasoning: { effort: 'none' } })

      expect(
        buildModelOptionsBlob({
          provider: 'openai',
          modelId: 'gpt-5.5',
          reasoningEffort: 'xhigh',
        }),
      ).toEqual({ reasoning: { effort: 'xhigh' } })
    })
  })

  describe('DeepSeek V4', () => {
    it('wraps the `thinking` field under extra_body per official DeepSeek docs', () => {
      // W2: DeepSeek's `thinking` field must be forwarded under
      // `extra_body`. `reasoning_effort` stays at the top level.
      expect(
        buildModelOptionsBlob({
          provider: 'deepseek',
          modelId: 'deepseek-v4-pro',
          thinkingMode: 'thinking',
          reasoningEffort: 'high',
        }),
      ).toEqual({
        extra_body: { thinking: { type: 'enabled' } },
        reasoning_effort: 'high',
      })
    })

    it('Pro accepts the `max` effort tier (W2)', () => {
      expect(
        buildModelOptionsBlob({
          provider: 'deepseek',
          modelId: 'deepseek-v4-pro',
          thinkingMode: 'thinking',
          reasoningEffort: 'max',
        }),
      ).toEqual({
        extra_body: { thinking: { type: 'enabled' } },
        reasoning_effort: 'max',
      })
    })

    it('Flash sends thinking enable (extra_body) but never reasoning_effort', () => {
      expect(
        buildModelOptionsBlob({
          provider: 'deepseek',
          modelId: 'deepseek-v4-flash',
          thinkingMode: 'thinking',
          reasoningEffort: 'high',
        }),
      ).toEqual({ extra_body: { thinking: { type: 'enabled' } } })
    })

    it('returns undefined when mode is instant', () => {
      expect(
        buildModelOptionsBlob({
          provider: 'deepseek',
          modelId: 'deepseek-v4-pro',
          thinkingMode: 'instant',
        }),
      ).toBeUndefined()
    })

    it('emits the enabled blob when mode is undefined (W4 default = thinking)', () => {
      // W4: undefined collapses to "thinking" via the bridge's normalizer,
      // so DeepSeek V4 emits the enabled blob even before the renderer's
      // hydration migration writes a literal back. Pre-W4 this case yielded
      // undefined because the persisted "auto" was treated as a no-op.
      expect(
        buildModelOptionsBlob({
          provider: 'deepseek',
          modelId: 'deepseek-v4-pro',
        }),
      ).toEqual({
        extra_body: { thinking: { type: 'enabled' } },
      })
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

  describe('Anthropic effort-only (W2: anthropic-output-config)', () => {
    it('emits output_config.effort + thinking.adaptive on non-default efforts', () => {
      expect(
        buildModelOptionsBlob({
          provider: 'anthropic',
          modelId: 'claude-opus-4-7',
          reasoningEffort: 'low',
        }),
      ).toEqual({
        output_config: { effort: 'low' },
        thinking: { type: 'adaptive' },
      })

      expect(
        buildModelOptionsBlob({
          provider: 'anthropic',
          modelId: 'claude-sonnet-4-6',
          reasoningEffort: 'max',
        }),
      ).toEqual({
        output_config: { effort: 'max' },
        thinking: { type: 'adaptive' },
      })
    })

    it('omits output_config.effort when effort === high (Anthropic API default)', () => {
      expect(
        buildModelOptionsBlob({
          provider: 'anthropic',
          modelId: 'claude-opus-4-7',
          reasoningEffort: 'high',
        }),
      ).toEqual({ thinking: { type: 'adaptive' } })
    })

    it('returns undefined when no effort is selected (defer to API default)', () => {
      expect(
        buildModelOptionsBlob({
          provider: 'anthropic',
          modelId: 'claude-opus-4-7',
        }),
      ).toBeUndefined()
    })

    it('returns undefined for Haiku 4.5 (no reasoning capability)', () => {
      expect(
        buildModelOptionsBlob({
          provider: 'anthropic',
          modelId: 'claude-haiku-4-5',
          reasoningEffort: 'high',
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
