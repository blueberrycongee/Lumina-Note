/**
 * Provider registry — 把 Vercel AI SDK 各家 provider 的 create 函数包装成统一注册表。
 *
 * 每个 entry 知道:
 *  - id: 稳定字符串(用作 IPC 配置键)
 *  - label / description: 给 UI 展示
 *  - requiresApiKey / supportsBaseUrl: 供 AI Settings UI 决定渲染哪些输入框
 *  - createModel(settings, modelId) → LanguageModel: 把 BYOK 配置 + 模型 id 实例化
 *
 * 不做动态加载。ProviderId 是静态联合类型,新增 provider 只是在本文件加一行条目。
 * Phase 2.4 会在 runtime 侧用 createLanguageModel(id, settings, modelId) + streamText 把 provider 串起来。
 */

import { createAnthropic } from '@ai-sdk/anthropic'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { createOllama } from 'ollama-ai-provider-v2'
import type { LanguageModel } from 'ai'

export type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'deepseek'
  | 'moonshot'
  | 'glm'
  | 'mimo'
  | 'groq'
  | 'openrouter'
  | 'ollama'
  | 'openai-compatible'

export interface ProviderSettings {
  apiKey?: string
  baseUrl?: string
  /** 显示名,openai-compatible 走这条路,其他 provider 忽略 */
  name?: string
  headers?: Record<string, string>
}

export interface ProviderEntry {
  id: ProviderId
  label: string
  description: string
  /** 是否必须配置 apiKey(Ollama 本地不需要) */
  requiresApiKey: boolean
  /** 是否支持自定义 baseUrl */
  supportsBaseUrl: boolean
  defaultBaseUrl?: string
  createModel(settings: ProviderSettings, modelId: string): LanguageModel
}

const entries: ProviderEntry[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    description: 'Claude 系列模型(Opus / Sonnet / Haiku)',
    requiresApiKey: true,
    supportsBaseUrl: true,
    defaultBaseUrl: 'https://api.anthropic.com',
    createModel(settings, modelId) {
      const factory = createAnthropic({
        apiKey: settings.apiKey ?? '',
        baseURL: settings.baseUrl,
        headers: settings.headers,
      })
      return factory(modelId)
    },
  },
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'GPT 系列模型',
    requiresApiKey: true,
    supportsBaseUrl: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
    createModel(settings, modelId) {
      const factory = createOpenAI({
        apiKey: settings.apiKey ?? '',
        baseURL: settings.baseUrl,
        headers: settings.headers,
      })
      return factory(modelId)
    },
  },
  {
    id: 'google',
    label: 'Google Gemini',
    description: 'Gemini 系列模型',
    requiresApiKey: true,
    supportsBaseUrl: true,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    createModel(settings, modelId) {
      const factory = createGoogleGenerativeAI({
        apiKey: settings.apiKey ?? '',
        baseURL: settings.baseUrl,
        headers: settings.headers,
      })
      return factory(modelId)
    },
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    description: 'DeepSeek 官方原生通道(V4 + 旧版 V3.2)',
    requiresApiKey: true,
    supportsBaseUrl: true,
    defaultBaseUrl: 'https://api.deepseek.com',
    createModel(settings, modelId) {
      const factory = createDeepSeek({
        apiKey: settings.apiKey ?? '',
        baseURL: settings.baseUrl,
        headers: settings.headers,
      })
      return factory(modelId)
    },
  },
  {
    id: 'moonshot',
    label: 'Moonshot (Kimi)',
    description: 'Moonshot Kimi 系列(K2.6 / K2.5 / Thinking)',
    requiresApiKey: true,
    supportsBaseUrl: true,
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    createModel(settings, modelId) {
      const factory = createOpenAICompatible({
        name: 'moonshot',
        apiKey: settings.apiKey ?? '',
        baseURL: settings.baseUrl ?? 'https://api.moonshot.cn/v1',
        headers: settings.headers,
      })
      return factory(modelId)
    },
  },
  {
    id: 'glm',
    label: 'Zhipu (GLM)',
    description: '智谱 GLM 系列(GLM-5 / GLM-4.7 / GLM-4.5 Air)',
    requiresApiKey: true,
    supportsBaseUrl: true,
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    createModel(settings, modelId) {
      const factory = createOpenAICompatible({
        name: 'glm',
        apiKey: settings.apiKey ?? '',
        baseURL: settings.baseUrl ?? 'https://open.bigmodel.cn/api/paas/v4',
        headers: settings.headers,
      })
      return factory(modelId)
    },
  },
  {
    id: 'mimo',
    label: 'Xiaomi MiMo',
    description: '小米 MiMo 系列(Official API / Token Plan regional endpoints)',
    requiresApiKey: true,
    supportsBaseUrl: true,
    defaultBaseUrl: 'https://api.xiaomimimo.com/v1',
    createModel(settings, modelId) {
      const factory = createOpenAICompatible({
        name: 'mimo',
        apiKey: settings.apiKey ?? '',
        baseURL: settings.baseUrl ?? 'https://api.xiaomimimo.com/v1',
        headers: settings.headers,
      })
      return factory(modelId)
    },
  },
  {
    id: 'groq',
    label: 'Groq',
    description: '低延迟推理,支持 Llama / Kimi / GPT-OSS 等',
    requiresApiKey: true,
    supportsBaseUrl: true,
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    createModel(settings, modelId) {
      const factory = createGroq({
        apiKey: settings.apiKey ?? '',
        baseURL: settings.baseUrl,
        headers: settings.headers,
      })
      return factory(modelId)
    },
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    description: '多模型聚合网关',
    requiresApiKey: true,
    supportsBaseUrl: true,
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    createModel(settings, modelId) {
      const factory = createOpenRouter({
        apiKey: settings.apiKey ?? '',
        baseURL: settings.baseUrl,
        headers: settings.headers,
      })
      return factory(modelId)
    },
  },
  {
    id: 'ollama',
    label: 'Ollama',
    description: '本地模型',
    requiresApiKey: false,
    supportsBaseUrl: true,
    defaultBaseUrl: 'http://localhost:11434/api',
    createModel(settings, modelId) {
      const factory = createOllama({
        baseURL: settings.baseUrl,
        headers: settings.headers,
      })
      return factory(modelId)
    },
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI Compatible',
    description:
      'OpenAI 协议兼容通配通道(Moonshot / Zhipu / Qwen / vLLM / 自建 等)',
    requiresApiKey: true,
    supportsBaseUrl: true,
    createModel(settings, modelId) {
      if (!settings.baseUrl) {
        throw new Error('openai-compatible provider requires baseUrl')
      }
      const factory = createOpenAICompatible({
        name: settings.name ?? 'custom',
        apiKey: settings.apiKey ?? '',
        baseURL: settings.baseUrl,
        headers: settings.headers,
      })
      return factory(modelId)
    },
  },
]

const registry = new Map<ProviderId, ProviderEntry>(
  entries.map((entry) => [entry.id, entry]),
)

export function listProviders(): ProviderEntry[] {
  return entries
}

export function getProvider(id: ProviderId): ProviderEntry | undefined {
  return registry.get(id)
}

export function hasProvider(id: string): id is ProviderId {
  return registry.has(id as ProviderId)
}

export function createLanguageModel(
  id: ProviderId,
  settings: ProviderSettings,
  modelId: string,
): LanguageModel {
  const entry = registry.get(id)
  if (!entry) {
    throw new Error(`Unknown provider: ${id}`)
  }
  if (entry.requiresApiKey && !settings.apiKey) {
    throw new Error(`Provider ${id} requires an apiKey`)
  }
  return entry.createModel(settings, modelId)
}
