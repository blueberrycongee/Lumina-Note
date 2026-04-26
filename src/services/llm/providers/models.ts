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

// Reasoning capability — discriminated union mirroring the existing strategies.
// Each variant carries the data needed to produce the per-provider native option blob.
export type ModelReasoningSpec =
  | { strategy: 'none' }
  | {
      // DeepSeek V4 / Kimi K2.5/K2.6: thinking is a binary toggle via a
      // `thinking` field. `nativeShape` describes the on-API shape so the
      // bridge knows which blob to emit.
      strategy: 'param-toggle';
      nativeShape: 'deepseek-v4' | 'moonshot-kimi';
      // When the model also accepts a tunable depth (DeepSeek V4 Pro:
      // ['high','max']), declare it here so the UI renders an effort selector.
      efforts?: ReasoningEffort[];
      // Per-provider API default. UI uses this to pick a sensible value when
      // the user has no explicit selection.
      defaultEffort?: ReasoningEffort;
    }
  | {
      // Legacy DeepSeek chat/reasoner — same provider exposes two model ids.
      strategy: 'separate-model';
      thinkingModelId: string;
      instantModelId: string;
    }
  | {
      // OpenAI GPT-5.x / Anthropic Claude 4.x — model always reasons (or has
      // a `none` opt-out within the same effort axis); only depth is tunable.
      // `nativeShape` decides the on-API blob:
      //   openai-reasoning           → { reasoning: { effort } }
      //   anthropic-output-config    → { output_config: { effort }, thinking: { type: "adaptive" } }
      strategy: 'effort-only';
      nativeShape: 'openai-reasoning' | 'anthropic-output-config';
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
        reasoning: { strategy: 'param-toggle', nativeShape: 'moonshot-kimi' },
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
        reasoning: { strategy: 'param-toggle', nativeShape: 'moonshot-kimi' },
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
        reasoning: { strategy: 'param-toggle', nativeShape: 'moonshot-kimi' },
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
        reasoning: { strategy: 'param-toggle', nativeShape: 'moonshot-kimi' },
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
    id: 'zhipu',
    label: 'Z.ai (GLM)',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { id: 'glm-5', name: 'GLM-5', contextWindow: 128000, supportsVision: true },
      { id: 'glm-4.7', name: 'GLM-4.7', contextWindow: 128000, supportsVision: true },
      {
        id: 'glm-4.7-flash',
        name: 'GLM-4.7 Flash',
        contextWindow: 128000,
        supportsVision: true,
        temperature: { recommended: 0.6 },
      },
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
  return PROVIDER_MODELS[providerId]?.models.find((m) => m.id === modelId);
}

// Resolves a (provider, modelId) pair to a ModelMeta, additionally consulting
// OPENAI_COMPATIBLE_PRESETS when the provider is `openai-compatible`, and
// stripping a leading `vendor/` segment so e.g. "moonshotai/kimi-k2.5" resolves
// to the moonshot catalog's "kimi-k2.5" entry. Used by capability lookups
// (thinking.ts, temperature.ts) which historically used substring matching.
//
// W5: legacy users may still have `provider: 'openai-compatible'` configs with
// a Kimi modelId from before moonshot was promoted to a top-level provider.
// We fall back to the moonshot catalog for those so temperature locks /
// thinking capabilities continue to apply (the bridge mirror keeps emitting
// the right blob via openai-compatible::kimi-* entries in electron-side
// model-capabilities).
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
    const moonshotMatch = PROVIDER_MODELS.moonshot?.models.find(
      (m) => m.id.toLowerCase() === tail,
    );
    if (moonshotMatch) return moonshotMatch;
  }

  return undefined;
}
