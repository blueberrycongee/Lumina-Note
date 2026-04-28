import { describe, expect, it, vi } from 'vitest'

import type { LuminaPluginContext } from './context.js'
import {
  pickDefaultProvider,
  resolveEffectiveModelId,
  resolveProviderForRequest,
} from './index.js'

describe('pickDefaultProvider', () => {
  it('uses the first configured image provider instead of hard-coding Google', async () => {
    const lumina = {
      resolveImageSettings: vi.fn(async (id: string) => ({
        apiKey: id === 'openai-image' ? 'openai-key' : undefined,
      })),
    } as unknown as LuminaPluginContext

    await expect(pickDefaultProvider(lumina)).resolves.toBe('openai-image')
    expect(lumina.resolveImageSettings).toHaveBeenCalledWith('openai-image')
    expect(lumina.resolveImageSettings).not.toHaveBeenCalledWith('google-image')
  })

  it('falls through to later configured providers', async () => {
    const lumina = {
      resolveImageSettings: vi.fn(async (id: string) => ({
        apiKey: id === 'bytedance-image' ? 'bytedance-key' : undefined,
      })),
    } as unknown as LuminaPluginContext

    await expect(pickDefaultProvider(lumina)).resolves.toBe('bytedance-image')
  })

  it('falls back when the agent requests an unconfigured provider', async () => {
    const lumina = {
      resolveImageSettings: vi.fn(async (id: string) => ({
        apiKey: id === 'openai-image' ? 'openai-key' : undefined,
        modelId: id === 'openai-image' ? 'gpt-image-2' : undefined,
      })),
    } as unknown as LuminaPluginContext

    await expect(
      resolveProviderForRequest(lumina, 'bytedance-image'),
    ).resolves.toEqual({
      providerId: 'openai-image',
      settings: { apiKey: 'openai-key', modelId: 'gpt-image-2' },
      fellBack: true,
    })
  })

  it('keeps the requested provider when it is configured', async () => {
    const lumina = {
      resolveImageSettings: vi.fn(async (id: string) => ({
        apiKey: id === 'bytedance-image' ? 'bytedance-key' : undefined,
      })),
    } as unknown as LuminaPluginContext

    await expect(
      resolveProviderForRequest(lumina, 'bytedance-image'),
    ).resolves.toEqual({
      providerId: 'bytedance-image',
      settings: { apiKey: 'bytedance-key' },
      fellBack: false,
    })
  })
})

describe('resolveEffectiveModelId', () => {
  it('ignores a stale requested model id after provider fallback', () => {
    expect(
      resolveEffectiveModelId({
        requestedProvider: 'bytedance-image',
        requestedModelId: 'doubao-seedream-4-5-250928',
        providerId: 'openai-image',
        fellBack: true,
        settings: { modelId: 'gpt-image-2' },
        defaults: { defaultModelId: 'gpt-image-2' },
      }),
    ).toBe('gpt-image-2')
  })

  it('does not let a model id imply a different provider when provider is omitted', () => {
    expect(
      resolveEffectiveModelId({
        requestedModelId: 'doubao-seedream-4-5-250928',
        providerId: 'openai-image',
        fellBack: false,
        settings: { modelId: 'gpt-image-2' },
        defaults: { defaultModelId: 'gpt-image-2' },
      }),
    ).toBe('gpt-image-2')
  })

  it('honors an explicit model override for a configured requested provider', () => {
    expect(
      resolveEffectiveModelId({
        requestedProvider: 'openai-image',
        requestedModelId: 'gpt-image-2-preview',
        providerId: 'openai-image',
        fellBack: false,
        settings: { modelId: 'gpt-image-2' },
        defaults: { defaultModelId: 'gpt-image-2' },
      }),
    ).toBe('gpt-image-2-preview')
  })
})
