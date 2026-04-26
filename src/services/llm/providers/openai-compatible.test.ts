import { describe, expect, it } from 'vitest'

import {
  buildCustomOpenAiCompatibleSettings,
  buildOpenAiCompatibleSettingsFromPreset,
  getOpenAiCompatiblePreset,
  listOpenAiCompatiblePresets,
  OPENAI_COMPATIBLE_PRESETS,
} from './openai-compatible'

describe('openai-compatible', () => {
  it('listOpenAiCompatiblePresets returns all presets (W5: moonshot preset removed)', () => {
    const presets = listOpenAiCompatiblePresets()
    expect(presets).toEqual(OPENAI_COMPATIBLE_PRESETS)
    expect(presets.length).toBe(2)
    expect(presets.map((p) => p.id).sort()).toEqual(['qwen', 'zhipu'])
  })

  it('getOpenAiCompatiblePreset returns the correct preset', () => {
    const zhipu = getOpenAiCompatiblePreset('zhipu')
    expect(zhipu?.label).toBe('Z.ai (GLM)')
    // W5: moonshot preset is gone (now a top-level provider).
    expect(getOpenAiCompatiblePreset('moonshot')).toBeUndefined()
    expect(getOpenAiCompatiblePreset('nope')).toBeUndefined()
  })

  it('buildOpenAiCompatibleSettingsFromPreset fills in baseUrl + default model', () => {
    const settings = buildOpenAiCompatibleSettingsFromPreset('zhipu')
    expect(settings.presetId).toBe('zhipu')
    expect(settings.baseUrl).toBe('https://open.bigmodel.cn/api/paas/v4')
    expect(settings.name).toBe('Z.ai (GLM)')
    expect(settings.apiKey).toBe('')
    expect(settings.modelId).toBe('glm-5')
    expect(settings.models.length).toBeGreaterThan(0)
  })

  it('buildOpenAiCompatibleSettingsFromPreset honors apiKey / modelId overrides', () => {
    const settings = buildOpenAiCompatibleSettingsFromPreset('zhipu', {
      apiKey: 'sk-xxx',
      modelId: 'glm-4.7-flash',
    })
    expect(settings.apiKey).toBe('sk-xxx')
    expect(settings.modelId).toBe('glm-4.7-flash')
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
