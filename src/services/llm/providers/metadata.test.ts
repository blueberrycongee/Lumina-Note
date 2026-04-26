import { describe, expect, it } from 'vitest'

import {
  findModel,
  getProviderModels,
  listProviderModels,
  PROVIDER_METADATA,
} from './metadata'

describe('providers/metadata', () => {
  it('covers all 8 provider ids', () => {
    const ids = Object.keys(PROVIDER_METADATA).sort()
    expect(ids).toEqual(
      [
        'anthropic',
        'deepseek',
        'google',
        'groq',
        'ollama',
        'openai',
        'openai-compatible',
        'openrouter',
      ].sort(),
    )
  })

  it('each provider has label + description + requiresApiKey + supportsBaseUrl', () => {
    for (const p of listProviderModels()) {
      expect(p.label).toBeTruthy()
      expect(p.description).toBeTruthy()
      expect(typeof p.requiresApiKey).toBe('boolean')
      expect(typeof p.supportsBaseUrl).toBe('boolean')
      expect(Array.isArray(p.models)).toBe(true)
    }
  })

  it('ollama is the only provider that does not require an apiKey', () => {
    for (const p of listProviderModels()) {
      if (p.id === 'ollama') {
        expect(p.requiresApiKey).toBe(false)
      } else {
        expect(p.requiresApiKey).toBe(true)
      }
    }
  })

  it('non-empty model lists except openai-compatible (presets only)', () => {
    for (const p of listProviderModels()) {
      if (p.id === 'openai-compatible') {
        expect(p.models.length).toBe(0)
      } else {
        expect(p.models.length).toBeGreaterThan(0)
      }
    }
  })

  it('each model entry has id + name', () => {
    for (const p of listProviderModels()) {
      for (const m of p.models) {
        expect(m.id).toBeTruthy()
        expect(m.name).toBeTruthy()
      }
    }
  })

  it('findModel resolves by (providerId, modelId)', () => {
    const m = findModel('anthropic', 'claude-opus-4-7')
    expect(m?.name).toBe('Claude Opus 4.7')
  })

  it('findModel returns undefined for unknown pair', () => {
    expect(findModel('anthropic', 'not-a-model')).toBeUndefined()
    expect(findModel('bogus', 'x')).toBeUndefined()
  })

  it('getProviderModels returns undefined for unknown provider', () => {
    expect(getProviderModels('anthropic')).toBeDefined()
    expect(getProviderModels('bogus')).toBeUndefined()
  })

  it('openai catalog lists GPT-5.5 family on top with thinking support, keeps legacy 5.4 / 5.4-mini / 5 visible', () => {
    const openai = getProviderModels('openai')
    expect(openai).toBeDefined()

    const ids = openai?.models.map((m) => m.id) ?? []
    expect(ids).toContain('gpt-5.5')
    expect(ids).toContain('gpt-5.5-pro')
    expect(ids).toContain('gpt-5.4')
    expect(ids).toContain('gpt-5.4-mini')
    expect(ids).toContain('gpt-5')

    // GPT-5.5 family must be first so it's the default highlight in the dropdown.
    expect(ids[0]).toBe('gpt-5.5-pro')
    expect(ids[1]).toBe('gpt-5.5')

    expect(findModel('openai', 'gpt-5.5')?.supportsThinking).toBe(true)
    expect(findModel('openai', 'gpt-5.5-pro')?.supportsThinking).toBe(true)
  })

  it('deepseek catalog lists V4 models with 1M context and drops the /v1 suffix from the default base URL', () => {
    const deepseek = getProviderModels('deepseek')
    expect(deepseek).toBeDefined()
    expect(deepseek?.defaultBaseUrl).toBe('https://api.deepseek.com')

    const ids = deepseek?.models.map((m) => m.id) ?? []
    expect(ids).toContain('deepseek-v4-pro')
    expect(ids).toContain('deepseek-v4-flash')
    // Legacy entries must remain until the 2026-07-24 deprecation deadline.
    expect(ids).toContain('deepseek-chat')
    expect(ids).toContain('deepseek-reasoner')

    const pro = findModel('deepseek', 'deepseek-v4-pro')
    expect(pro?.contextWindow).toBe(1000000)
    expect(pro?.supportsThinking).toBe(true)

    const flash = findModel('deepseek', 'deepseek-v4-flash')
    expect(flash?.contextWindow).toBe(1000000)
    expect(flash?.supportsThinking).toBe(true)
  })

  // ---- W2: spec gap fills ----

  it('GPT-5.4 family is no longer flagged as legacy (W2: now effort-only)', () => {
    for (const id of ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5']) {
      const model = findModel('openai', id)
      expect(model, `expected '${id}' to exist in the openai catalog`).toBeDefined()
      expect(model?.legacy).toBeFalsy()
      expect(model?.reasoning?.strategy).toBe('effort-only')
    }
  })

  it('DeepSeek V4 Pro now exposes both high and max efforts (W2)', () => {
    const pro = findModel('deepseek', 'deepseek-v4-pro')
    expect(pro?.reasoning?.strategy).toBe('param-toggle')
    if (pro?.reasoning && pro.reasoning.strategy === 'param-toggle') {
      expect(pro.reasoning.efforts).toEqual(['high', 'max'])
    }
  })

  it('Anthropic catalog includes Opus 4.6 and Opus 4.5 alongside 4.7 / Sonnet 4.6 / Haiku 4.5 (W2)', () => {
    const anthropic = getProviderModels('anthropic')
    const ids = anthropic?.models.map((m) => m.id) ?? []
    expect(ids).toContain('claude-opus-4-7')
    expect(ids).toContain('claude-sonnet-4-6')
    expect(ids).toContain('claude-haiku-4-5')
    expect(ids).toContain('claude-opus-4-6')
    expect(ids).toContain('claude-opus-4-5')

    const opus47 = findModel('anthropic', 'claude-opus-4-7')
    expect(opus47?.reasoning?.strategy).toBe('effort-only')
    if (opus47?.reasoning && opus47.reasoning.strategy === 'effort-only') {
      expect(opus47.reasoning.nativeShape).toBe('anthropic-output-config')
      expect(opus47.reasoning.efforts).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
      expect(opus47.reasoning.defaultEffort).toBe('high')
    }

    const sonnet46 = findModel('anthropic', 'claude-sonnet-4-6')
    if (sonnet46?.reasoning && sonnet46.reasoning.strategy === 'effort-only') {
      expect(sonnet46.reasoning.efforts).toEqual(['low', 'medium', 'high', 'max'])
    }

    // Haiku 4.5 still has no reasoning capability per Anthropic docs.
    const haiku = findModel('anthropic', 'claude-haiku-4-5')
    expect(haiku?.reasoning).toBeUndefined()
  })

  it('Kimi K2.6 is present in the moonshot openai-compatible preset and carries the tool_choice constraint (W2)', async () => {
    const { OPENAI_COMPATIBLE_PRESETS } = await import('./models')
    const moonshot = OPENAI_COMPATIBLE_PRESETS.find((p) => p.id === 'moonshot')
    expect(moonshot).toBeDefined()
    const ids = moonshot?.models.map((m) => m.id) ?? []
    expect(ids).toContain('kimi-k2.6')
    expect(ids).toContain('kimi-k2.5')

    const k26 = moonshot?.models.find((m) => m.id === 'kimi-k2.6')
    expect(k26?.supportsThinking).toBe(true)
    expect(k26?.reasoning?.strategy).toBe('param-toggle')
    expect(k26?.toolChoiceConstraintsWhenThinking).toEqual(['auto', 'none'])
  })
})
