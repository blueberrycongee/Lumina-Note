/**
 * Provider / Model metadata — 纯数据模块,前端 UI 展示用。
 *
 * 仅包含人类可读信息:provider 列表、每 provider 的模型清单、上下文窗口、vision/thinking 标记。
 * 不绑任何运行时实现。运行时实例化靠 electron/main/agent/providers/registry.ts。
 *
 * 对齐新的 Electron provider id schema:
 *   anthropic / openai / google / deepseek / groq / openrouter / ollama / openai-compatible
 * (老 schema 里的 gemini/moonshot/zai/custom 在 Phase 2.5 随手写 HTTP provider 一并移除。)
 */

export type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'deepseek'
  | 'groq'
  | 'openrouter'
  | 'ollama'
  | 'openai-compatible'

export interface ModelMeta {
  id: string
  name: string
  contextWindow?: number
  maxTokens?: number
  supportsVision?: boolean
  supportsThinking?: boolean
}

export interface ProviderMeta {
  id: ProviderId
  label: string
  description: string
  defaultBaseUrl?: string
  requiresApiKey: boolean
  supportsBaseUrl: boolean
  models: ModelMeta[]
}

/**
 * openai-compatible 配置建议:用户可用此 preset 快速预填 baseUrl + 模型清单,
 * 不是绑定的 provider 实例,只是给 UI 用的起手式。
 */
export interface OpenAICompatiblePreset {
  id: string
  label: string
  defaultBaseUrl: string
  models: ModelMeta[]
}

export const PROVIDER_METADATA: Record<ProviderId, ProviderMeta> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    description: 'Claude 系列模型(Opus / Sonnet / Haiku)',
    defaultBaseUrl: 'https://api.anthropic.com',
    requiresApiKey: true,
    supportsBaseUrl: true,
    models: [
      { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', contextWindow: 200000, supportsVision: true, supportsThinking: true },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', contextWindow: 200000, supportsVision: true, supportsThinking: true },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', contextWindow: 200000, supportsVision: true },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6 (Legacy)', contextWindow: 200000, supportsVision: true },
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5 (Legacy)', contextWindow: 200000, supportsVision: true },
    ],
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    description: 'GPT 系列模型',
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresApiKey: true,
    supportsBaseUrl: true,
    models: [
      { id: 'gpt-5.2', name: 'GPT-5.2', contextWindow: 400000, supportsVision: true },
      { id: 'gpt-5.2-chat-latest', name: 'GPT-5.2 Chat (Latest)', contextWindow: 400000, supportsVision: true },
      { id: 'gpt-5.2-mini', name: 'GPT-5.2 Mini', contextWindow: 400000 },
      { id: 'gpt-5.2-nano', name: 'GPT-5.2 Nano', contextWindow: 400000 },
      { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', contextWindow: 400000 },
      { id: 'gpt-5', name: 'GPT-5', contextWindow: 400000, supportsVision: true },
      { id: 'gpt-5-chat-latest', name: 'GPT-5 Chat (Latest)', contextWindow: 400000, supportsVision: true },
      { id: 'gpt-5-mini', name: 'GPT-5 Mini', contextWindow: 400000 },
      { id: 'gpt-5-nano', name: 'GPT-5 Nano', contextWindow: 400000 },
      { id: 'gpt-4.1', name: 'GPT-4.1', contextWindow: 1047576, supportsVision: true },
      { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, supportsVision: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000, supportsVision: true },
    ],
  },
  google: {
    id: 'google',
    label: 'Google Gemini',
    description: 'Gemini 系列模型',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    requiresApiKey: true,
    supportsBaseUrl: true,
    models: [
      { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview', contextWindow: 1000000, supportsVision: true },
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', contextWindow: 1000000, supportsVision: true },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextWindow: 1000000, supportsVision: true, supportsThinking: true },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextWindow: 1000000, supportsVision: true },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', contextWindow: 1000000, supportsVision: true },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextWindow: 1000000, supportsVision: true },
    ],
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    description: 'DeepSeek 官方原生通道(reasoner 支持思考链)',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    requiresApiKey: true,
    supportsBaseUrl: true,
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3.2 (Chat)', contextWindow: 128000 },
      { id: 'deepseek-reasoner', name: 'DeepSeek V3.2 (Reasoner)', contextWindow: 128000, supportsThinking: true },
    ],
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    description: '低延迟推理,覆盖 Llama / Kimi / GPT-OSS 等',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    requiresApiKey: true,
    supportsBaseUrl: true,
    models: [
      { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick', contextWindow: 131072 },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout', contextWindow: 131072 },
      { id: 'qwen/qwen3-32b', name: 'Qwen3 32B', contextWindow: 131072 },
      { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', contextWindow: 131072 },
      { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', contextWindow: 131072 },
      { id: 'moonshotai/kimi-k2-instruct-0905', name: 'Kimi K2 Instruct 0905', contextWindow: 262144 },
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', contextWindow: 128000 },
    ],
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    description: '多模型聚合网关',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    requiresApiKey: true,
    supportsBaseUrl: true,
    models: [
      { id: 'openai/gpt-5.2', name: 'GPT-5.2', contextWindow: 400000, supportsVision: true },
      { id: 'openai/gpt-5.2-chat', name: 'GPT-5.2 Chat', contextWindow: 400000, supportsVision: true },
      { id: 'openai/gpt-5.2-codex', name: 'GPT-5.2 Codex', contextWindow: 400000 },
      { id: 'anthropic/claude-opus-4.7', name: 'Claude Opus 4.7', contextWindow: 200000, supportsVision: true },
      { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', contextWindow: 1000000, supportsVision: true },
      { id: 'moonshotai/kimi-k2.5', name: 'Kimi K2.5', contextWindow: 256000, supportsVision: true },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', contextWindow: 128000, supportsThinking: true },
      { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick', contextWindow: 131072 },
    ],
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama',
    description: '本地模型',
    defaultBaseUrl: 'http://localhost:11434/api',
    requiresApiKey: false,
    supportsBaseUrl: true,
    models: [
      { id: 'llama3.3', name: 'Llama 3.3', contextWindow: 131072 },
      { id: 'llama3.2', name: 'Llama 3.2', contextWindow: 128000 },
      { id: 'llama3.2-vision', name: 'Llama 3.2 Vision', contextWindow: 128000, supportsVision: true },
      { id: 'qwen3:8b', name: 'Qwen3 8B', contextWindow: 131072 },
      { id: 'llava', name: 'LLaVA', contextWindow: 4096, supportsVision: true },
      { id: 'qwen2.5:14b', name: 'Qwen 2.5 14B', contextWindow: 32768 },
      { id: 'deepseek-r1:8b', name: 'DeepSeek R1 8B', contextWindow: 131072, supportsThinking: true },
      { id: 'deepseek-r1:14b', name: 'DeepSeek R1 14B', contextWindow: 64000, supportsThinking: true },
      { id: 'gemma3', name: 'Gemma 3', contextWindow: 32768 },
      { id: 'mistral', name: 'Mistral 7B', contextWindow: 32768 },
      { id: 'gemma2:9b', name: 'Gemma 2 9B', contextWindow: 8192 },
    ],
  },
  'openai-compatible': {
    id: 'openai-compatible',
    label: 'OpenAI Compatible',
    description: 'OpenAI 协议兼容通配通道(Moonshot / Zhipu / Qwen / vLLM / 自建)',
    requiresApiKey: true,
    supportsBaseUrl: true,
    models: [],
  },
}

/**
 * openai-compatible provider 的常见预设,UI 可让用户一键填充 baseUrl + 模型清单。
 * 用户仍需自行填 apiKey。
 */
export const OPENAI_COMPATIBLE_PRESETS: OpenAICompatiblePreset[] = [
  {
    id: 'moonshot',
    label: 'Moonshot (Kimi)',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    models: [
      { id: 'kimi-k2.5', name: 'Kimi K2.5', contextWindow: 256000, supportsVision: true, supportsThinking: true },
      { id: 'kimi-k2-0905-preview', name: 'Kimi K2 0905 Preview', contextWindow: 256000 },
      { id: 'kimi-k2-turbo-preview', name: 'Kimi K2 Turbo Preview', contextWindow: 256000 },
      { id: 'kimi-k2-thinking', name: 'Kimi K2 Thinking', contextWindow: 256000, supportsThinking: true },
      { id: 'kimi-k2-thinking-turbo', name: 'Kimi K2 Thinking Turbo', contextWindow: 256000, supportsThinking: true },
      { id: 'moonshot-v1-128k', name: 'Moonshot v1 128K', contextWindow: 128000 },
    ],
  },
  {
    id: 'zhipu',
    label: 'Z.ai (GLM)',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { id: 'glm-5', name: 'GLM-5', contextWindow: 128000, supportsVision: true },
      { id: 'glm-4.7', name: 'GLM-4.7', contextWindow: 128000, supportsVision: true },
      { id: 'glm-4.7-flash', name: 'GLM-4.7 Flash', contextWindow: 128000, supportsVision: true },
    ],
  },
  {
    id: 'qwen',
    label: 'Qwen (DashScope)',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { id: 'qwen-max', name: 'Qwen Max', contextWindow: 131072 },
      { id: 'qwen-plus', name: 'Qwen Plus', contextWindow: 131072 },
      { id: 'qwen-turbo', name: 'Qwen Turbo', contextWindow: 131072 },
      { id: 'qwq-32b-preview', name: 'QwQ 32B Preview', contextWindow: 32768, supportsThinking: true },
    ],
  },
]

export function listProviderMetadata(): ProviderMeta[] {
  return Object.values(PROVIDER_METADATA)
}

export function getProviderMetadata(id: ProviderId): ProviderMeta | undefined {
  return PROVIDER_METADATA[id]
}

export function findModel(providerId: ProviderId, modelId: string): ModelMeta | undefined {
  return PROVIDER_METADATA[providerId]?.models.find((m) => m.id === modelId)
}
