/**
 * OpenAI Compatible 通配通道 — 用户填 baseUrl + apiKey + modelId 就能接入任意
 * OpenAI 协议兼容 provider(Moonshot / Zhipu / Qwen / DeepSeek 兼容端 / vLLM / 自建)。
 *
 * Phase 2.2 的 backend registry 已有 'openai-compatible' 实例化能力。
 * Phase 2.3 的 metadata 里 OPENAI_COMPATIBLE_PRESETS 列了 3 个常用预设(Moonshot/Zhipu/Qwen)。
 * 本模块负责:
 *  - 把 preset 转成 UI 可填的初始表单(settings)
 *  - 对外暴露 listOpenAiCompatiblePresets / getOpenAiCompatiblePreset
 *  - 供 Phase 2.7 AI Settings UI 直接消费
 */

import {
  OPENAI_COMPATIBLE_PRESETS,
  type OpenAICompatiblePreset,
  type ModelMeta,
} from './metadata'

export type { OpenAICompatiblePreset, ModelMeta }
export { OPENAI_COMPATIBLE_PRESETS }

export interface OpenAiCompatibleSettings {
  /** preset id 或自定义 'custom' */
  presetId: string | null
  /** 显示名 — 写到 createOpenAICompatible({ name }) */
  name: string
  /** API 端点 base URL */
  baseUrl: string
  /** 用户 API key — 永不持久化到 state(走 secure store) */
  apiKey: string
  /** 当前选中的 model id */
  modelId: string
  /** preset 的可选 model 清单;'custom' 情况为空数组,UI 让用户直接填 modelId */
  models: ModelMeta[]
}

export function listOpenAiCompatiblePresets(): OpenAICompatiblePreset[] {
  return OPENAI_COMPATIBLE_PRESETS
}

export function getOpenAiCompatiblePreset(id: string): OpenAICompatiblePreset | undefined {
  return OPENAI_COMPATIBLE_PRESETS.find((p) => p.id === id)
}

/**
 * 从 preset 构造一份初始 settings,UI 收到后可直接用来渲染表单。
 * apiKey 不放在 preset 里(由用户填),默认空串。
 */
export function buildOpenAiCompatibleSettingsFromPreset(
  presetId: string,
  options: { apiKey?: string; modelId?: string } = {},
): OpenAiCompatibleSettings {
  const preset = getOpenAiCompatiblePreset(presetId)
  if (!preset) {
    return {
      presetId: null,
      name: 'custom',
      baseUrl: '',
      apiKey: options.apiKey ?? '',
      modelId: options.modelId ?? '',
      models: [],
    }
  }
  return {
    presetId: preset.id,
    name: preset.label,
    baseUrl: preset.defaultBaseUrl,
    apiKey: options.apiKey ?? '',
    modelId: options.modelId ?? preset.models[0]?.id ?? '',
    models: preset.models,
  }
}

/**
 * 自定义 (custom) settings —— 用户完全自填 baseUrl/modelId,没有 preset 的模型候选。
 */
export function buildCustomOpenAiCompatibleSettings(
  options: { baseUrl?: string; apiKey?: string; modelId?: string; name?: string } = {},
): OpenAiCompatibleSettings {
  return {
    presetId: null,
    name: options.name ?? 'custom',
    baseUrl: options.baseUrl ?? '',
    apiKey: options.apiKey ?? '',
    modelId: options.modelId ?? '',
    models: [],
  }
}
