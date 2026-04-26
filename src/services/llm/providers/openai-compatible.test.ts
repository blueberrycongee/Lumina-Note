import { describe, expect, it } from 'vitest'

import {
  buildCustomOpenAiCompatibleSettings,
  buildOpenAiCompatibleSettingsFromPreset,
  getOpenAiCompatiblePreset,
  listOpenAiCompatiblePresets,
  OPENAI_COMPATIBLE_PRESETS,
} from './openai-compatible'

describe('openai-compatible', () => {
  it('listOpenAiCompatiblePresets returns all presets (W5: moonshot removed; W6: zhipu removed)', () => {
    const presets = listOpenAiCompatiblePresets()
    expect(presets).toEqual(OPENAI_COMPATIBLE_PRESETS)
    expect(presets.length).toBe(1)
    expect(presets.map((p) => p.id)).toEqual(['qwen'])
  })

  it('getOpenAiCompatiblePreset returns the correct preset', () => {
    const qwen = getOpenAiCompatiblePreset('qwen')
    expect(qwen?.label).toBe('Qwen (DashScope)')
    // W5: moonshot preset is gone (now a top-level provider).
    expect(getOpenAiCompatiblePreset('moonshot')).toBeUndefined()
    // W6: zhipu preset is gone (glm is now a top-level provider).
    expect(getOpenAiCompatiblePreset('zhipu')).toBeUndefined()
    expect(getOpenAiCompatiblePreset('nope')).toBeUndefined()
  })

  it('buildOpenAiCompatibleSettingsFromPreset fills in baseUrl + default model', () => {
    const settings = buildOpenAiCompatibleSettingsFromPreset('qwen')
    expect(settings.presetId).toBe('qwen')
    expect(settings.baseUrl).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1')
    expect(settings.name).toBe('Qwen (DashScope)')
    expect(settings.apiKey).toBe('')
    expect(settings.modelId).toBe('qwen-max')
    expect(settings.models.length).toBeGreaterThan(0)
  })

  it('buildOpenAiCompatibleSettingsFromPreset honors apiKey / modelId overrides', () => {
    const settings = buildOpenAiCompatibleSettingsFromPreset('qwen', {
      apiKey: 'sk-xxx',
      modelId: 'qwen-turbo',
    })
    expect(settings.apiKey).toBe('sk-xxx')
    expect(settings.modelId).toBe('qwen-turbo')
  })

  it('buildOpenAiCompatibleSettingsFromPreset falls back to custom when preset id unknown', () => {
    const settings = buildOpenAiCompatibleSettingsFromPreset('bogus')
    expect(settings.presetId).toBeNull()
    expect(settings.baseUrl).toBe('')
    expect(settings.models).toEqual([])
  })

  it('buildCustomOpenAiCompatibleSettings returns blank template with overrides', () => {
    const s = buildCustomOpenAiCompatibleSettings({
      baseUrl: 'https://custom.example.com/v1',
      apiKey: 'sk-xxx',
      modelId: 'my-model',
      name: 'Custom',
    })
    expect(s.presetId).toBeNull()
    expect(s.baseUrl).toBe('https://custom.example.com/v1')
    expect(s.apiKey).toBe('sk-xxx')
    expect(s.modelId).toBe('my-model')
    expect(s.name).toBe('Custom')
    expect(s.models).toEqual([])
  })

  it('buildCustomOpenAiCompatibleSettings defaults to empty strings', () => {
    const s = buildCustomOpenAiCompatibleSettings()
    expect(s.presetId).toBeNull()
    expect(s.name).toBe('custom')
    expect(s.baseUrl).toBe('')
    expect(s.apiKey).toBe('')
    expect(s.modelId).toBe('')
  })
})
