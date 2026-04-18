import { describe, expect, it } from 'vitest'

import {
  createLanguageModel,
  getProvider,
  hasProvider,
  listProviders,
  type ProviderId,
} from './registry.js'

describe('providers/registry', () => {
  it('lists all 8 built-in providers', () => {
    const providers = listProviders()
    const ids = providers.map((p) => p.id).sort()
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

  it('every provider has label / description / requiresApiKey / supportsBaseUrl', () => {
    for (const entry of listProviders()) {
      expect(entry.label).toBeTruthy()
      expect(entry.description).toBeTruthy()
      expect(typeof entry.requiresApiKey).toBe('boolean')
      expect(typeof entry.supportsBaseUrl).toBe('boolean')
      expect(typeof entry.createModel).toBe('function')
    }
  })

  it('ollama does not require apiKey; every other provider does', () => {
    for (const entry of listProviders()) {
      if (entry.id === 'ollama') {
        expect(entry.requiresApiKey).toBe(false)
      } else {
        expect(entry.requiresApiKey).toBe(true)
      }
    }
  })

  it('hasProvider narrows unknown strings to ProviderId', () => {
    expect(hasProvider('anthropic')).toBe(true)
    expect(hasProvider('bogus')).toBe(false)
  })

  it('getProvider returns undefined for unknown id', () => {
    expect(getProvider('anthropic')).toBeDefined()
    expect(getProvider('bogus' as ProviderId)).toBeUndefined()
  })

  it('createLanguageModel throws when provider id is unknown', () => {
    expect(() =>
      createLanguageModel('bogus' as ProviderId, { apiKey: 'x' }, 'm'),
    ).toThrow(/Unknown provider/)
  })

  it('createLanguageModel throws when apiKey is missing for providers that require one', () => {
    expect(() => createLanguageModel('anthropic', {}, 'claude-opus-4-7')).toThrow(
      /requires an apiKey/,
    )
  })

  it('openai-compatible requires baseUrl even with apiKey', () => {
    expect(() =>
      createLanguageModel('openai-compatible', { apiKey: 'x' }, 'kimi-k2'),
    ).toThrow(/requires baseUrl/)
  })

  it('produces a LanguageModel-like object for a fully configured provider', () => {
    const model = createLanguageModel(
      'anthropic',
      { apiKey: 'test-key' },
      'claude-opus-4-7',
    )
    expect(model).toBeDefined()
    // AI SDK models are objects with provider / modelId / specificationVersion
    const anyModel = model as { modelId?: string; provider?: string }
    expect(anyModel.modelId).toBe('claude-opus-4-7')
  })

  it('ollama works without apiKey', () => {
    const model = createLanguageModel('ollama', {}, 'llama3.3')
    expect(model).toBeDefined()
  })
})
