import type { ReasoningEffort } from '../types';

// Per-model temperature constraint. Each field is independently optional.
// - `fixed` overrides user input unconditionally.
// - `fixedWhenThinking` / `fixedWhenInstant` apply when the user-selected
//   thinking mode matches. With the post-W4 binary union (thinking|instant)
//   `thinking` is the default state, so `fixedWhenThinking` covers both
//   explicit selection and the default.
// - `fixedWhenReasoning` applies for `effort-only` models when reasoning is
//   actually on — i.e. the resolved effort is anything other than `none`
//   (undefined falls back to the model's `defaultEffort`). OpenAI o-series /
//   GPT-5.5 and Anthropic extended thinking both require temperature=1.0
//   while reasoning is enabled.
// - `recommended` is the default when the user has not configured a value
//   and no fixed override fires.
export interface ModelTemperatureSpec {
  recommended?: number;
  fixed?: number;
  fixedWhenThinking?: number;
  fixedWhenInstant?: number;
  fixedWhenReasoning?: number;
}

// Reasoning capability metadata. Lumina's opencode path does not translate
// this into providerOptions; opencode/provider defaults own request shaping.
// `nativeShape` is retained as descriptive catalog data for docs/tests and
// compatibility with older metadata consumers.
export type ModelReasoningSpec =
  | { strategy: 'none' }
  | {
      // DeepSeek V4 / Kimi K2.5/K2.6 / Zhipu GLM: thinking is a binary model
      // capability. Lumina keeps this as metadata only.
      strategy: 'param-toggle';
      nativeShape: 'deepseek-v4' | 'binary-thinking';
      // When the model also accepts a tunable depth (DeepSeek V4 Pro:
      // ['high','max']), declare it here as catalog metadata.
      efforts?: ReasoningEffort[];
      // Per-provider API default, retained for temperature constraints and
      // compatibility with older local state.
      defaultEffort?: ReasoningEffort;
    }
  | {
      // Legacy DeepSeek chat/reasoner — same provider exposes two model ids.
      strategy: 'separate-model';
      thinkingModelId: string;
      instantModelId: string;
    }
  | {
      // OpenAI GPT-5.x / Anthropic Claude 4.x / Xiaomi MiMo — model always
      // reasons (or has a `none` opt-out within the same effort axis); only
      // depth is tunable at the provider API level.
      strategy: 'effort-only';
      nativeShape: 'openai-reasoning' | 'anthropic-output-config' | 'mimo-reasoning';
      efforts: ReasoningEffort[];
      // REQUIRED for effort-only: the API's behavior when no effort is
      // explicitly sent. OpenAI defaults to `medium`, Anthropic to `high`,
      // GPT-5.4 family to `none`.
      defaultEffort: ReasoningEffort;
    };

// Hard API constraints — the provider rejects with HTTP 400 if the user
// supplies any value other than `fixed`. Currently descriptive: only the
// temperature slider in AISettingsModal consumes them (W5). Bridge / agent
// enforcement will follow as needed.
export interface ModelApiConstraints {
  topP?: { fixed: number };
  presencePenalty?: { fixed: number };
  frequencyPenalty?: { fixed: number };
  n?: { fixed: number };
}

export interface ModelMeta {
  id: string;
  name: string;
  contextWindow?: number;
  supportsVision?: boolean;
  /** True iff this model exposes ANY thinking-related capability. Kept as a top-level boolean for the "show brain icon next to model" UI in AISettingsModal. */
  supportsThinking?: boolean;
  /** Full reasoning capability descriptor. */
  reasoning?: ModelReasoningSpec;
  /** Per-model temperature constraints. */
  temperature?: ModelTemperatureSpec;
  /**
   * Hard API constraints other than temperature (top_p, penalties, n). See
   * ModelApiConstraints. Renderer-only consumer for now (AISettingsModal's
   * lock surface in W5); bridge enforcement may follow.
   */
  apiConstraints?: ModelApiConstraints;
  /**
   * Allowed `tool_choice` values when the model is reasoning. Currently
   * descriptive only — opencode's bridge does not enforce this yet. Persisted
   * here so future enforcement code can read it from the catalog.
   */
  toolChoiceConstraintsWhenThinking?: Array<'auto' | 'none' | 'required'>;
  /** Optional family grouping for UI (e.g. 'gpt-5.5', 'claude-opus', 'deepseek-thinking'). Reserved for W3. */
  family?: string;
  /** Display-only legacy hint. */
  legacy?: boolean;
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

function mimoReasoning(): ModelReasoningSpec {
  return {
    strategy: 'effort-only',
    nativeShape: 'mimo-reasoning',
    efforts: ['low', 'medium', 'high'],
    defaultEffort: 'medium',
  };
}

export interface MimoEndpoint {
  id: 'official' | 'token-plan-cn' | 'token-plan-sgp' | 'token-plan-ams';
  label: string;
  defaultBaseUrl: string;
  modelSet: 'official' | 'token-plan';
}

export const MIMO_ENDPOINTS: MimoEndpoint[] = [
  {
    id: 'official',
    label: 'Official API',
    defaultBaseUrl: 'https://api.xiaomimimo.com/v1',
    modelSet: 'official',
  },
  {
    id: 'token-plan-cn',
    label: 'Token Plan China',
    defaultBaseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
    modelSet: 'token-plan',
  },
  {
    id: 'token-plan-sgp',
    label: 'Token Plan Singapore',
    defaultBaseUrl: 'https://token-plan-sgp.xiaomimimo.com/v1',
    modelSet: 'token-plan',
  },
  {
    id: 'token-plan-ams',
    label: 'Token Plan Europe',
    defaultBaseUrl: 'https://token-plan-ams.xiaomimimo.com/v1',
    modelSet: 'token-plan',
  },
];

const MIMO_OFFICIAL_MODELS: ModelMeta[] = [
  {
    id: 'mimo-v2.5-pro',
    name: 'MiMo V2.5 Pro',
    contextWindow: 1000000,
    supportsThinking: true,
    reasoning: mimoReasoning(),
  },
  {
    id: 'mimo-v2-pro',
    name: 'MiMo V2 Pro',
    contextWindow: 1000000,
    supportsThinking: true,
    reasoning: mimoReasoning(),
  },
  {
    id: 'mimo-v2-omni',
    name: 'MiMo V2 Omni',
    contextWindow: 262144,
    supportsVision: true,
    supportsThinking: true,
    reasoning: mimoReasoning(),
  },
  {
    id: 'mimo-v2-flash',
    name: 'MiMo V2 Flash',
    contextWindow: 262144,
  },
];

const MIMO_TOKEN_PLAN_MODELS: ModelMeta[] = [
  {
    id: 'mimo-v2.5-pro',
    name: 'MiMo V2.5 Pro',
    contextWindow: 1000000,
    supportsThinking: true,
    reasoning: mimoReasoning(),
  },
  {
    id: 'mimo-v2.5',
    name: 'MiMo V2.5',
    contextWindow: 1000000,
    supportsVision: true,
    supportsThinking: true,
    reasoning: mimoReasoning(),
  },
  {
    id: 'mimo-v2-pro',
    name: 'MiMo V2 Pro',
    contextWindow: 1000000,
    supportsThinking: true,
    reasoning: mimoReasoning(),
  },
  {
    id: 'mimo-v2-omni',
    name: 'MiMo V2 Omni',
    contextWindow: 262144,
    supportsVision: true,
    supportsThinking: true,
    reasoning: mimoReasoning(),
  },
];

function normalizeBaseUrl(baseUrl?: string): string {
  return (baseUrl ?? '').trim().replace(/\/+$/, '').toLowerCase();
}

export function getMimoEndpointForBaseUrl(baseUrl?: string): MimoEndpoint {
  const normalized = normalizeBaseUrl(baseUrl);
  return (
    MIMO_ENDPOINTS.find((endpoint) => normalizeBaseUrl(endpoint.defaultBaseUrl) === normalized) ??
    MIMO_ENDPOINTS[0]
  );
}

export function getMimoModelsForBaseUrl(baseUrl?: string): ModelMeta[] {
  return getMimoEndpointForBaseUrl(baseUrl).modelSet === 'token-plan'
    ? MIMO_TOKEN_PLAN_MODELS
    : MIMO_OFFICIAL_MODELS;
}

function getAllMimoModels(): ModelMeta[] {
  const byId = new Map<string, ModelMeta>();
  for (const model of [...MIMO_OFFICIAL_MODELS, ...MIMO_TOKEN_PLAN_MODELS]) {
    byId.set(model.id, model);
  }
  return Array.from(byId.values());
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
      {
        id: 'claude-opus-4-7',
        name: 'Claude Opus 4.7',
        contextWindow: 200000,
        supportsVision: true,
        supportsThinking: true,
        reasoning: {
          strategy: 'effort-only',
          nativeShape: 'anthropic-output-config',
          efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
          defaultEffort: 'high',
        },
        temperature: { fixedWhenReasoning: 1.0 },
      },
      {
        id: 'claude-sonnet-4-6',
        name: 'Claude Sonnet 4.6',
        contextWindow: 200000,
        supportsVision: true,
        supportsThinking: true,
        reasoning: {
          strategy: 'effort-only',
          nativeShape: 'anthropic-output-config',
          efforts: ['low', 'medium', 'high', 'max'],
          defaultEffort: 'high',
        },
        temperature: { fixedWhenReasoning: 1.0 },
      },
      {
        id: 'claude-haiku-4-5',
        name: 'Claude Haiku 4.5',
        contextWindow: 200000,
        supportsVision: true,
      },
      {
        id: 'claude-opus-4-6',
        name: 'Claude Opus 4.6',
        contextWindow: 200000,
        supportsVision: true,
        supportsThinking: true,
        reasoning: {
          strategy: 'effort-only',
          nativeShape: 'anthropic-output-config',
          efforts: ['low', 'medium', 'high', 'max'],
          defaultEffort: 'high',
        },
        temperature: { fixedWhenReasoning: 1.0 },
      },
      {
        id: 'claude-opus-4-5',
        name: 'Claude Opus 4.5',
        contextWindow: 200000,
        supportsVision: true,
        supportsThinking: true,
        reasoning: {
          strategy: 'effort-only',
          nativeShape: 'anthropic-output-config',
          efforts: ['low', 'medium', 'high', 'max'],
          defaultEffort: 'high',
        },
        temperature: { fixedWhenReasoning: 1.0 },
      },
    ],
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    description: 'GPT models (GPT-5.5 family supports tunable reasoning effort)',
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresApiKey: true,
    supportsBaseUrl: true,
    models: [
      {
        id: 'gpt-5.5-pro',
        name: 'GPT-5.5 Pro',
        contextWindow: 400000,
        supportsVision: true,
        supportsThinking: true,
        reasoning: {
          strategy: 'effort-only',
          nativeShape: 'openai-reasoning',
          efforts: ['none', 'low', 'medium', 'high', 'xhigh'],
          defaultEffort: 'medium',
        },
        temperature: { fixedWhenReasoning: 1.0 },
      },
      {
        id: 'gpt-5.5',
        name: 'GPT-5.5',
        contextWindow: 400000,
        supportsVision: true,
        supportsThinking: true,
        reasoning: {
          strategy: 'effort-only',
          nativeShape: 'openai-reasoning',
          efforts: ['none', 'low', 'medium', 'high', 'xhigh'],
          defaultEffort: 'medium',
        },
        temperature: { fixedWhenReasoning: 1.0 },
      },
      {
        id: 'gpt-5.4',
        name: 'GPT-5.4',
        contextWindow: 400000,
        supportsVision: true,
        supportsThinking: true,
        reasoning: {
          strategy: 'effort-only',
          nativeShape: 'openai-reasoning',
          efforts: ['none', 'low', 'medium', 'high', 'xhigh'],
          defaultEffort: 'none',
        },
        temperature: { fixedWhenReasoning: 1.0 },
      },
      {
        id: 'gpt-5.4-mini',
        name: 'GPT-5.4 Mini',
        contextWindow: 400000,
        supportsThinking: true,
        reasoning: {
          strategy: 'effort-only',
          nativeShape: 'openai-reasoning',
          efforts: ['none', 'low', 'medium', 'high', 'xhigh'],
          defaultEffort: 'none',
        },
        temperature: { fixedWhenReasoning: 1.0 },
      },
      {
        id: 'gpt-5',
        name: 'GPT-5',
        contextWindow: 400000,
        supportsVision: true,
        supportsThinking: true,
        reasoning: {
          strategy: 'effort-only',
          nativeShape: 'openai-reasoning',
          efforts: ['none', 'low', 'medium', 'high', 'xhigh'],
          defaultEffort: 'none',
        },
        temperature: { fixedWhenReasoning: 1.0 },
      },
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
      {
        id: 'deepseek-v4-pro',
        name: 'DeepSeek V4 Pro',
        contextWindow: 1000000,
        supportsThinking: true,
        reasoning: {
          strategy: 'param-toggle',
          nativeShape: 'deepseek-v4',
          efforts: ['high', 'max'],
        },
      },
      {
        id: 'deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        contextWindow: 1000000,
        supportsThinking: true,
        reasoning: {
          strategy: 'param-toggle',
          nativeShape: 'deepseek-v4',
        },
      },
      {
        id: 'deepseek-chat',
        name: 'DeepSeek V3.2 Chat (legacy, retiring 2026-07-24)',
        contextWindow: 128000,
        legacy: true,
        reasoning: {
          strategy: 'separate-model',
          thinkingModelId: 'deepseek-reasoner',
          instantModelId: 'deepseek-chat',
        },
      },
      {
        id: 'deepseek-reasoner',
        name: 'DeepSeek V3.2 Reasoner (legacy, retiring 2026-07-24)',
        contextWindow: 128000,
        supportsThinking: true,
        legacy: true,
        reasoning: {
          strategy: 'separate-model',
          thinkingModelId: 'deepseek-reasoner',
          instantModelId: 'deepseek-chat',
        },
        temperature: { recommended: 1.0 },
      },
    ],
  },
  moonshot: {
    id: 'moonshot',
    label: 'Moonshot (Kimi)',
    description: 'Moonshot Kimi 系列(K2.6 / K2.5 / Thinking)',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    requiresApiKey: true,
    supportsBaseUrl: true,
    models: [
      {
        id: 'kimi-k2.6',
        name: 'Kimi K2.6',
        contextWindow: 256000,
        supportsVision: true,
        supportsThinking: true,
        reasoning: { strategy: 'param-toggle', nativeShape: 'binary-thinking' },
        temperature: { fixedWhenThinking: 1.0, fixedWhenInstant: 0.6 },
        apiConstraints: {
          topP: { fixed: 0.95 },
          presencePenalty: { fixed: 0 },
          frequencyPenalty: { fixed: 0 },
          n: { fixed: 1 },
        },
        toolChoiceConstraintsWhenThinking: ['auto', 'none'],
      },
      {
        id: 'kimi-k2.5',
        name: 'Kimi K2.5',
        contextWindow: 256000,
        supportsVision: true,
        supportsThinking: true,
        reasoning: { strategy: 'param-toggle', nativeShape: 'binary-thinking' },
        temperature: { fixedWhenThinking: 1.0, fixedWhenInstant: 0.6 },
        apiConstraints: {
          topP: { fixed: 0.95 },
          presencePenalty: { fixed: 0 },
          frequencyPenalty: { fixed: 0 },
          n: { fixed: 1 },
        },
        toolChoiceConstraintsWhenThinking: ['auto', 'none'],
      },
      {
        id: 'kimi-k2-thinking',
        name: 'Kimi K2 Thinking',
        contextWindow: 256000,
        supportsThinking: true,
        reasoning: { strategy: 'param-toggle', nativeShape: 'binary-thinking' },
        temperature: { fixedWhenThinking: 1.0, fixedWhenInstant: 0.6 },
        apiConstraints: {
          topP: { fixed: 0.95 },
          presencePenalty: { fixed: 0 },
          frequencyPenalty: { fixed: 0 },
          n: { fixed: 1 },
        },
        toolChoiceConstraintsWhenThinking: ['auto', 'none'],
      },
      {
        id: 'kimi-k2-thinking-turbo',
        name: 'Kimi K2 Thinking Turbo',
        contextWindow: 256000,
        supportsThinking: true,
        reasoning: { strategy: 'param-toggle', nativeShape: 'binary-thinking' },
        temperature: { fixedWhenThinking: 1.0, fixedWhenInstant: 0.6 },
        apiConstraints: {
          topP: { fixed: 0.95 },
          presencePenalty: { fixed: 0 },
          frequencyPenalty: { fixed: 0 },
          n: { fixed: 1 },
        },
        toolChoiceConstraintsWhenThinking: ['auto', 'none'],
      },
      {
        id: 'kimi-k2-turbo-preview',
        name: 'Kimi K2 Turbo Preview',
        contextWindow: 256000,
      },
      {
        id: 'kimi-k2-0905-preview',
        name: 'Kimi K2 0905 Preview',
        contextWindow: 256000,
      },
      {
        id: 'moonshot-v1-128k',
        name: 'Moonshot v1 128K (legacy)',
        contextWindow: 128000,
        legacy: true,
      },
    ],
  },
  glm: {
    id: 'glm',
    label: 'Zhipu (GLM)',
    description: '智谱 GLM 系列 (GLM-5 / GLM-4.7 / GLM-4.5 Air)',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    requiresApiKey: true,
    supportsBaseUrl: true,
    models: [
      {
        id: 'glm-5',
        name: 'GLM-5',
        contextWindow: 200000,
        supportsThinking: true,
        reasoning: { strategy: 'param-toggle', nativeShape: 'binary-thinking' },
      },
      {
        id: 'glm-5-x',
        name: 'GLM-5-X',
        contextWindow: 200000,
        supportsThinking: true,
        reasoning: { strategy: 'param-toggle', nativeShape: 'binary-thinking' },
      },
      {
        id: 'glm-4.7',
        name: 'GLM-4.7',
        contextWindow: 128000,
        supportsThinking: true,
        reasoning: { strategy: 'param-toggle', nativeShape: 'binary-thinking' },
      },
      {
        id: 'glm-4.7-flash',
        name: 'GLM-4.7 Flash',
        contextWindow: 128000,
        // Preserved from the legacy openai-compatible Zhipu preset; users
        // running this model expect the same low-temperature default.
        temperature: { recommended: 0.6 },
      },
      {
        id: 'glm-4.5-air',
        name: 'GLM-4.5 Air',
        contextWindow: 128000,
      },
    ],
  },
  mimo: {
    id: 'mimo',
    label: 'Xiaomi MiMo',
    description: '小米 MiMo 系列 (Official API / Token Plan regional endpoints)',
    defaultBaseUrl: MIMO_ENDPOINTS[0].defaultBaseUrl,
    requiresApiKey: true,
    supportsBaseUrl: true,
    models: MIMO_OFFICIAL_MODELS,
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
    description: 'OpenAI protocol compatible (Qwen / vLLM / self-hosted)',
    requiresApiKey: true,
    supportsBaseUrl: true,
    models: [],
  },
};

export const OPENAI_COMPATIBLE_PRESETS: OpenAICompatiblePreset[] = [
  {
    id: 'qwen',
    label: 'Qwen (DashScope)',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { id: 'qwen-max', name: 'Qwen Max', contextWindow: 131072 },
      { id: 'qwen-plus', name: 'Qwen Plus', contextWindow: 131072 },
      { id: 'qwen-turbo', name: 'Qwen Turbo', contextWindow: 131072 },
      {
        id: 'qwq-32b-preview',
        name: 'QwQ 32B Preview',
        contextWindow: 32768,
        supportsThinking: true,
        reasoning: { strategy: 'none' },
      },
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
  if (providerId === 'mimo') {
    return getAllMimoModels().find((m) => m.id === modelId);
  }
  return PROVIDER_MODELS[providerId]?.models.find((m) => m.id === modelId);
}

// Resolves a (provider, modelId) pair to a ModelMeta, additionally consulting
// OPENAI_COMPATIBLE_PRESETS when the provider is `openai-compatible`, and
// stripping a leading `vendor/` segment so e.g. "moonshotai/kimi-k2.5" resolves
// to the moonshot catalog's "kimi-k2.5" entry. Used by capability lookups
// (thinking.ts, temperature.ts) which historically used substring matching.
//
// W5/W6: legacy users may still have `provider: 'openai-compatible'` configs
// targeting providers we have since promoted to first-class entries (Moonshot
// in W5, Zhipu GLM in W6). For those we iterate the promoted catalogs in
// order and return the first hit so temperature locks / thinking capabilities
// continue to apply in renderer-only metadata surfaces.
const OPENAI_COMPATIBLE_FALLBACK_PROVIDERS = ['moonshot', 'glm', 'mimo'] as const;

export function findModelInCatalog(providerId: string, modelId: string): ModelMeta | undefined {
  const direct = findModel(providerId, modelId);
  if (direct) return direct;

  const normalized = modelId.trim().toLowerCase();
  const tail = normalized.includes('/') ? normalized.split('/').pop()! : normalized;
  if (!tail) return undefined;

  const meta = PROVIDER_MODELS[providerId];
  if (meta) {
    const found = meta.models.find((m) => m.id.toLowerCase() === tail);
    if (found) return found;
  }

  if (providerId === 'openai-compatible') {
    for (const preset of OPENAI_COMPATIBLE_PRESETS) {
      const found = preset.models.find((m) => m.id.toLowerCase() === tail);
      if (found) return found;
    }
    for (const fallbackId of OPENAI_COMPATIBLE_FALLBACK_PROVIDERS) {
      const fallbackMatch = PROVIDER_MODELS[fallbackId]?.models.find(
        (m) => m.id.toLowerCase() === tail,
      );
      if (fallbackMatch) return fallbackMatch;
    }
  }

  return undefined;
}
