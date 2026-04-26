// Electron-side mirror of the renderer's per-model reasoning specs.
//
// The electron tsconfig does not include src/, so we cannot import the
// renderer catalog directly. This file lists ONLY the (providerId, modelId)
// pairs that need a request-body patch in the opencode bridge — i.e.
// param-toggle and effort-only models. Models with no reasoning capability
// (or with the `separate-model` strategy, which doesn't emit a blob) are
// omitted intentionally.
//
// MUST stay in lock-step with src/services/llm/providers/models.ts. When a
// new model with a `param-toggle` or `effort-only` reasoning spec is added
// over there, mirror it here.
//
// `nativeShape` decides the on-API JSON shape (see thinking-options.ts).

import type { ProviderId } from './registry.js'
import type { ReasoningEffort } from './settings-store.js'

export type ModelReasoningSpec =
  | { strategy: 'none' }
  | {
      strategy: 'param-toggle'
      nativeShape: 'deepseek-v4' | 'moonshot-kimi'
      efforts?: ReasoningEffort[]
      defaultEffort?: ReasoningEffort
    }
  | {
      strategy: 'separate-model'
      thinkingModelId: string
      instantModelId: string
    }
  | {
      strategy: 'effort-only'
      nativeShape: 'openai-reasoning' | 'anthropic-output-config'
      efforts: ReasoningEffort[]
      defaultEffort: ReasoningEffort
    }

const GPT_5x_EFFORTS: ReasoningEffort[] = ['none', 'low', 'medium', 'high', 'xhigh']
const ANTHROPIC_OPUS_47_EFFORTS: ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']
const ANTHROPIC_SONNET_46_EFFORTS: ReasoningEffort[] = ['low', 'medium', 'high', 'max']

// Keyed as `<providerId>::<modelId>` for direct lookup. Lookups should also
// honor a leading `vendor/` prefix (handled by `lookupReasoningSpec`).
const TABLE: Record<string, ModelReasoningSpec> = {
  'openai::gpt-5.5': {
    strategy: 'effort-only',
    nativeShape: 'openai-reasoning',
    efforts: GPT_5x_EFFORTS,
    defaultEffort: 'medium',
  },
  'openai::gpt-5.5-pro': {
    strategy: 'effort-only',
    nativeShape: 'openai-reasoning',
    efforts: GPT_5x_EFFORTS,
    defaultEffort: 'medium',
  },
  'openai::gpt-5.4': {
    strategy: 'effort-only',
    nativeShape: 'openai-reasoning',
    efforts: GPT_5x_EFFORTS,
    defaultEffort: 'none',
  },
  'openai::gpt-5.4-mini': {
    strategy: 'effort-only',
    nativeShape: 'openai-reasoning',
    efforts: GPT_5x_EFFORTS,
    defaultEffort: 'none',
  },
  'openai::gpt-5': {
    strategy: 'effort-only',
    nativeShape: 'openai-reasoning',
    efforts: GPT_5x_EFFORTS,
    defaultEffort: 'none',
  },
  'anthropic::claude-opus-4-7': {
    strategy: 'effort-only',
    nativeShape: 'anthropic-output-config',
    efforts: ANTHROPIC_OPUS_47_EFFORTS,
    defaultEffort: 'high',
  },
  'anthropic::claude-sonnet-4-6': {
    strategy: 'effort-only',
    nativeShape: 'anthropic-output-config',
    efforts: ANTHROPIC_SONNET_46_EFFORTS,
    defaultEffort: 'high',
  },
  'anthropic::claude-opus-4-6': {
    strategy: 'effort-only',
    nativeShape: 'anthropic-output-config',
    efforts: ANTHROPIC_SONNET_46_EFFORTS,
    defaultEffort: 'high',
  },
  'anthropic::claude-opus-4-5': {
    strategy: 'effort-only',
    nativeShape: 'anthropic-output-config',
    efforts: ANTHROPIC_SONNET_46_EFFORTS,
    defaultEffort: 'high',
  },
  'deepseek::deepseek-v4-pro': {
    strategy: 'param-toggle',
    nativeShape: 'deepseek-v4',
    efforts: ['high', 'max'],
  },
  'deepseek::deepseek-v4-flash': {
    strategy: 'param-toggle',
    nativeShape: 'deepseek-v4',
  },
  // Top-level moonshot provider (W5). Same `moonshot-kimi` shape as the
  // openai-compatible entries below, just reachable via the new provider id.
  'moonshot::kimi-k2.6': {
    strategy: 'param-toggle',
    nativeShape: 'moonshot-kimi',
  },
  'moonshot::kimi-k2.5': {
    strategy: 'param-toggle',
    nativeShape: 'moonshot-kimi',
  },
  'moonshot::kimi-k2-thinking': {
    strategy: 'param-toggle',
    nativeShape: 'moonshot-kimi',
  },
  'moonshot::kimi-k2-thinking-turbo': {
    strategy: 'param-toggle',
    nativeShape: 'moonshot-kimi',
  },
  // Back-compat: existing user configs that still target openai-compatible
  // with a moonshot baseUrl + Kimi modelId continue to emit the right blob.
  'openai-compatible::kimi-k2.5': {
    strategy: 'param-toggle',
    nativeShape: 'moonshot-kimi',
  },
  'openai-compatible::kimi-k2.6': {
    strategy: 'param-toggle',
    nativeShape: 'moonshot-kimi',
  },
}

export function lookupReasoningSpec(
  provider: ProviderId,
  modelId: string,
): ModelReasoningSpec | undefined {
  const normalized = modelId.trim().toLowerCase()
  const direct = TABLE[`${provider}::${normalized}`]
  if (direct) return direct

  if (normalized.includes('/')) {
    const tail = normalized.split('/').pop()
    if (tail) {
      const tailHit = TABLE[`${provider}::${tail}`]
      if (tailHit) return tailHit
    }
  }
  return undefined
}
