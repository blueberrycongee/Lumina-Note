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
})
