export interface ModelMeta {
  id: string;
  name: string;
  contextWindow?: number;
  supportsVision?: boolean;
  supportsThinking?: boolean;
}

export interface OpenAICompatiblePreset {
  id: string;
  label: string;
  defaultBaseUrl: string;
  models: ModelMeta[];
}

export interface ProviderMeta {
  id: string;
  label: string;
  description: string;
  defaultBaseUrl?: string;
  requiresApiKey: boolean;
  supportsBaseUrl: boolean;
  models: ModelMeta[];
}

export const PROVIDER_MODELS: Record<string, ProviderMeta> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    description: 'Claude models (Opus / Sonnet / Haiku)',
    defaultBaseUrl: 'https://api.anthropic.com',
    requiresApiKey: true,
    supportsBaseUrl: true,
    models: [
      { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', contextWindow: 200000, supportsVision: true, supportsThinking: true },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', contextWindow: 200000, supportsVision: true, supportsThinking: true },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', contextWindow: 200000, supportsVision: true },
    ],
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    description: 'GPT models',
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresApiKey: true,
    supportsBaseUrl: true,
    models: [
      { id: 'gpt-5.4', name: 'GPT-5.4', contextWindow: 400000, supportsVision: true },
      { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', contextWindow: 400000 },
      { id: 'gpt-5', name: 'GPT-5', contextWindow: 400000, supportsVision: true },
      { id: 'gpt-4.1', name: 'GPT-4.1', contextWindow: 1047576, supportsVision: true },
      { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, supportsVision: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000, supportsVision: true },
    ],
  },
  google: {
    id: 'google',
    label: 'Google Gemini',
    description: 'Gemini models',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    requiresApiKey: true,
    supportsBaseUrl: true,
    models: [
      { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro', contextWindow: 1000000, supportsVision: true, supportsThinking: true },
      { id: 'gemini-3.1-flash', name: 'Gemini 3.1 Flash', contextWindow: 1000000, supportsVision: true },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextWindow: 1000000, supportsVision: true, supportsThinking: true },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextWindow: 1000000, supportsVision: true },
    ],
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    description: 'DeepSeek official channel (V4 + legacy V3.2)',
    defaultBaseUrl: 'https://api.deepseek.com',
    requiresApiKey: true,
    supportsBaseUrl: true,
    models: [
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', contextWindow: 1000000, supportsThinking: true },
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', contextWindow: 1000000, supportsThinking: true },
      { id: 'deepseek-chat', name: 'DeepSeek V3.2 Chat (legacy, retiring 2026-07-24)', contextWindow: 128000 },
      { id: 'deepseek-reasoner', name: 'DeepSeek V3.2 Reasoner (legacy, retiring 2026-07-24)', contextWindow: 128000, supportsThinking: true },
    ],
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    description: 'Ultra-fast inference (Llama / Kimi / GPT-OSS)',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    requiresApiKey: true,
    supportsBaseUrl: true,
    models: [
      { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick', contextWindow: 131072 },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout', contextWindow: 131072 },
      { id: 'qwen/qwen3-32b', name: 'Qwen3 32B', contextWindow: 131072 },
      { id: 'moonshotai/kimi-k2-instruct-0905', name: 'Kimi K2 Instruct 0905', contextWindow: 262144 },
    ],
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    description: 'Multi-model gateway',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    requiresApiKey: true,
    supportsBaseUrl: true,
    models: [
      { id: 'openai/gpt-5.4', name: 'GPT-5.4', contextWindow: 400000, supportsVision: true },
      { id: 'anthropic/claude-opus-4.7', name: 'Claude Opus 4.7', contextWindow: 200000, supportsVision: true },
      { id: 'google/gemini-3.1-pro', name: 'Gemini 3.1 Pro', contextWindow: 1000000, supportsVision: true },
      { id: 'moonshotai/kimi-k2.6', name: 'Kimi K2.6', contextWindow: 256000, supportsVision: true },
      { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', contextWindow: 128000, supportsThinking: true },
      { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick', contextWindow: 131072 },
    ],
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama',
    description: 'Local models',
    defaultBaseUrl: 'http://localhost:11434/v1',
    requiresApiKey: false,
    supportsBaseUrl: true,
    models: [
      { id: 'llama3.3', name: 'Llama 3.3', contextWindow: 131072 },
      { id: 'llama3.2', name: 'Llama 3.2', contextWindow: 128000 },
      { id: 'llama3.2-vision', name: 'Llama 3.2 Vision', contextWindow: 128000, supportsVision: true },
      { id: 'qwen3:8b', name: 'Qwen3 8B', contextWindow: 131072 },
      { id: 'deepseek-r1:8b', name: 'DeepSeek R1 8B', contextWindow: 131072, supportsThinking: true },
      { id: 'deepseek-r1:14b', name: 'DeepSeek R1 14B', contextWindow: 64000, supportsThinking: true },
      { id: 'gemma3', name: 'Gemma 3', contextWindow: 32768 },
    ],
  },
  'openai-compatible': {
    id: 'openai-compatible',
    label: 'OpenAI Compatible',
    description: 'OpenAI protocol compatible (Moonshot / Zhipu / Qwen / vLLM / self-hosted)',
    requiresApiKey: true,
    supportsBaseUrl: true,
    models: [],
  },
};

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
];

export function listProviderModels(): ProviderMeta[] {
  return Object.values(PROVIDER_MODELS);
}

export function getProviderModels(id: string): ProviderMeta | undefined {
  return PROVIDER_MODELS[id];
}

export function findModel(providerId: string, modelId: string): ModelMeta | undefined {
  return PROVIDER_MODELS[providerId]?.models.find((m) => m.id === modelId);
}
