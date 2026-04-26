// Translates persisted thinkingMode + reasoningEffort into the per-provider
// NATIVE option blob that opencode ships through to the Vercel AI SDK call as
// `providerOptions`. The shape MUST mirror what each provider's SDK expects:
//
//   DeepSeek V4:  { thinking: { type: "enabled" }, reasoning_effort: "high" }
//   OpenAI 5.5:   { reasoning: { effort: "high" } }                (nested object)
//   Kimi K2.5:    { thinking: { type: "disabled" } }               (only when forcing instant)
//
// The renderer counterpart is src/services/llm/thinking.ts — keep this file's
// per-provider branches in lock-step with that one. The two are duplicated
// (rather than shared) because the electron tsconfig does not include src/
// and pulling everything cross-tree adds more weight than this small fork.

import type { ProviderId } from './registry.js'
import type { ReasoningEffort, ThinkingMode } from './settings-store.js'

const KIMI_K25_MODEL = 'kimi-k2.5'
const DEEPSEEK_V4_PRO_MODEL = 'deepseek-v4-pro'
const DEEPSEEK_V4_FLASH_MODEL = 'deepseek-v4-flash'
const GPT_55_PRO_MODEL = 'gpt-5.5-pro'
const GPT_55_MODEL = 'gpt-5.5'

const GPT_55_EFFORTS: ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh']
const DEEPSEEK_V4_PRO_EFFORTS: ReasoningEffort[] = ['high']

function matchesModelId(model: string, target: string): boolean {
  const m = model.trim().toLowerCase()
  const t = target.toLowerCase()
  return m === t || m.endsWith(`/${t}`)
}

export function buildModelOptionsBlob(params: {
  provider: ProviderId
  modelId: string
  thinkingMode?: ThinkingMode
  reasoningEffort?: ReasoningEffort
}): Record<string, unknown> | undefined {
  const { provider, modelId, thinkingMode, reasoningEffort } = params

  // OpenAI GPT-5.5: always reasons; only effort tunable. Omit when no effort
  // is selected so the API default (medium) applies.
  if (
    provider === 'openai' &&
    (matchesModelId(modelId, GPT_55_PRO_MODEL) || matchesModelId(modelId, GPT_55_MODEL))
  ) {
    if (!reasoningEffort || !GPT_55_EFFORTS.includes(reasoningEffort)) return undefined
    return { reasoning: { effort: reasoningEffort } }
  }

  // DeepSeek V4: thinking defaults to off; explicitly enable on thinking mode.
  // V4 Pro additionally accepts reasoning_effort:"high".
  if (
    provider === 'deepseek' &&
    (matchesModelId(modelId, DEEPSEEK_V4_PRO_MODEL) ||
      matchesModelId(modelId, DEEPSEEK_V4_FLASH_MODEL))
  ) {
    if (thinkingMode !== 'thinking') return undefined
    const blob: Record<string, unknown> = { thinking: { type: 'enabled' } }
    if (
      matchesModelId(modelId, DEEPSEEK_V4_PRO_MODEL) &&
      reasoningEffort &&
      DEEPSEEK_V4_PRO_EFFORTS.includes(reasoningEffort)
    ) {
      blob.reasoning_effort = reasoningEffort
    }
    return blob
  }

  // Moonshot Kimi K2.5 (via openai-compatible): thinking on by default; only
  // explicitly disable when user forces instant.
  if (provider === 'openai-compatible' && matchesModelId(modelId, KIMI_K25_MODEL)) {
    if (thinkingMode === 'instant') return { thinking: { type: 'disabled' } }
    return undefined
  }

  return undefined
}
