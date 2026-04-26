// Translates persisted thinkingMode + reasoningEffort into the per-provider
// NATIVE option blob that opencode ships through to the Vercel AI SDK call as
// `providerOptions`. The shape MUST mirror what each provider's SDK expects:
//
//   DeepSeek V4:   { extra_body: { thinking: { type: "enabled" } }, reasoning_effort: "high" }
//                  (DeepSeek's `thinking` field is forwarded under `extra_body`,
//                   while `reasoning_effort` stays at the top level.)
//   OpenAI 5.5:    { reasoning: { effort: "high" } }              (nested object)
//   Anthropic 4.x: { output_config: { effort: "low" }, thinking: { type: "adaptive" } }
//                  (`high` is the API default — when it's the resolved effort
//                   we omit `output_config.effort` entirely per Anthropic docs.)
//   Kimi K2.5/6:   { thinking: { type: "disabled" } }             (only when forcing instant)
//
// The renderer counterpart is src/services/llm/thinking.ts. The (provider,
// modelId) → ModelReasoningSpec mapping is centralised in
// ./model-capabilities.ts; this file only knows how to emit the native shapes.

import { lookupReasoningSpec } from './model-capabilities.js'
import type { ProviderId } from './registry.js'
import type { ReasoningEffort, ThinkingMode } from './settings-store.js'

export function buildModelOptionsBlob(params: {
  provider: ProviderId
  modelId: string
  thinkingMode?: ThinkingMode
  reasoningEffort?: ReasoningEffort
}): Record<string, unknown> | undefined {
  const { provider, modelId, thinkingMode, reasoningEffort } = params
  const spec = lookupReasoningSpec(provider, modelId)
  if (!spec || spec.strategy === 'none' || spec.strategy === 'separate-model') {
    return undefined
  }

  if (spec.strategy === 'effort-only') {
    if (!reasoningEffort || !spec.efforts.includes(reasoningEffort)) return undefined
    switch (spec.nativeShape) {
      case 'openai-reasoning':
        return { reasoning: { effort: reasoningEffort } }
      case 'anthropic-output-config': {
        const blob: Record<string, unknown> = {
          thinking: { type: 'adaptive' },
        }
        if (reasoningEffort !== 'high') {
          blob.output_config = { effort: reasoningEffort }
        }
        return blob
      }
    }
  }

  // param-toggle
  switch (spec.nativeShape) {
    case 'deepseek-v4': {
      if (thinkingMode !== 'thinking') return undefined
      const blob: Record<string, unknown> = {
        extra_body: { thinking: { type: 'enabled' } },
      }
      if (reasoningEffort && spec.efforts?.includes(reasoningEffort)) {
        blob.reasoning_effort = reasoningEffort
      }
      return blob
    }
    case 'moonshot-kimi': {
      if (thinkingMode === 'instant') return { thinking: { type: 'disabled' } }
      return undefined
    }
  }

  return undefined
}
