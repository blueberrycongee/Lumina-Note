import type { LLMProviderType, ReasoningEffort, ThinkingMode } from "./types";

// Capability shape for a (provider, model) pair. Three real strategies plus none:
//  - param-toggle: send a request param to enable/disable thinking.
//      Optional `efforts[]` means the model also accepts a tunable reasoning depth.
//      Examples: DeepSeek V4 Flash (no efforts), DeepSeek V4 Pro (efforts:["high"]),
//      Moonshot Kimi K2.5 (no efforts).
//  - separate-model: same provider exposes two model ids, one for each side.
//      Example: legacy DeepSeek (chat ↔ reasoner).
//  - effort-only: model always reasons; only the depth is tunable. No binary toggle.
//      Example: OpenAI GPT-5.5 family (efforts:["low","medium","high","xhigh"]).
export type ThinkingCapability =
  | { strategy: "none" }
  | {
      strategy: "param-toggle";
      parameter: "thinking";
      efforts?: ReasoningEffort[];
    }
  | { strategy: "separate-model"; thinkingModel: string; instantModel: string }
  | {
      strategy: "effort-only";
      parameter: "reasoning";
      efforts: ReasoningEffort[];
    };

const DEFAULT_THINKING_MODE: ThinkingMode = "auto";
const KIMI_K25_MODEL = "kimi-k2.5";
const DEEPSEEK_CHAT_MODEL = "deepseek-chat";
const DEEPSEEK_REASONER_MODEL = "deepseek-reasoner";
const DEEPSEEK_V4_PRO_MODEL = "deepseek-v4-pro";
const DEEPSEEK_V4_FLASH_MODEL = "deepseek-v4-flash";
const GPT_55_PRO_MODEL = "gpt-5.5-pro";
const GPT_55_MODEL = "gpt-5.5";

// All efforts OpenAI GPT-5.5 accepts. Both `gpt-5.5` and `gpt-5.5-pro` take the
// same set today; if a future variant narrows the range, branch in getThinkingCapability.
const GPT_55_EFFORTS: ReasoningEffort[] = ["low", "medium", "high", "xhigh"];

function normalizeModelId(model: string): string {
  return model.trim().toLowerCase();
}

function matchesModelId(model: string, target: string): boolean {
  const normalizedModel = normalizeModelId(model);
  const normalizedTarget = normalizeModelId(target);
  return (
    normalizedModel === normalizedTarget ||
    normalizedModel.endsWith(`/${normalizedTarget}`)
  );
}

export function normalizeThinkingMode(mode?: ThinkingMode): ThinkingMode {
  if (mode === "thinking" || mode === "instant") {
    return mode;
  }
  return DEFAULT_THINKING_MODE;
}

export function getThinkingCapability(
  provider: LLMProviderType,
  model?: string
): ThinkingCapability {
  if (!model) {
    return { strategy: "none" };
  }

  if (provider === "openai-compatible" && matchesModelId(model, KIMI_K25_MODEL)) {
    return { strategy: "param-toggle", parameter: "thinking" };
  }

  if (provider === "openai") {
    if (
      matchesModelId(model, GPT_55_PRO_MODEL) ||
      matchesModelId(model, GPT_55_MODEL)
    ) {
      return { strategy: "effort-only", parameter: "reasoning", efforts: GPT_55_EFFORTS };
    }
  }

  if (provider === "deepseek") {
    if (matchesModelId(model, DEEPSEEK_V4_PRO_MODEL)) {
      // V4 Pro is the only DeepSeek tier where `reasoning_effort: "high"` is honored.
      return { strategy: "param-toggle", parameter: "thinking", efforts: ["high"] };
    }
    if (matchesModelId(model, DEEPSEEK_V4_FLASH_MODEL)) {
      return { strategy: "param-toggle", parameter: "thinking" };
    }
    if (
      matchesModelId(model, DEEPSEEK_CHAT_MODEL) ||
      matchesModelId(model, DEEPSEEK_REASONER_MODEL)
    ) {
      return {
        strategy: "separate-model",
        thinkingModel: DEEPSEEK_REASONER_MODEL,
        instantModel: DEEPSEEK_CHAT_MODEL,
      };
    }
  }

  return { strategy: "none" };
}

// True when the model exposes ANY thinking-related control (binary toggle or
// effort selector). UI uses this as the gate for showing the thinking section.
export function supportsThinkingModeSwitch(
  provider: LLMProviderType,
  model?: string
): boolean {
  return getThinkingCapability(provider, model).strategy !== "none";
}

// True when the model honors the binary thinking|instant|auto toggle. False for
// effort-only models (always reasoning, only depth is tunable) — UI should hide
// the three-state selector for those.
export function supportsBinaryThinkingToggle(
  provider: LLMProviderType,
  model?: string
): boolean {
  const capability = getThinkingCapability(provider, model);
  return (
    capability.strategy === "param-toggle" || capability.strategy === "separate-model"
  );
}

// Returns the supported effort levels for a (provider, model) pair, or null
// when the model does not expose a reasoning-effort axis. UI can use this to
// decide whether to render an effort selector and which options to offer.
export function supportedReasoningEfforts(
  provider: LLMProviderType,
  model?: string
): ReasoningEffort[] | null {
  const capability = getThinkingCapability(provider, model);
  if (capability.strategy === "param-toggle" || capability.strategy === "effort-only") {
    if (!capability.efforts || capability.efforts.length === 0) return null;
    return capability.efforts;
  }
  return null;
}

export function resolveThinkingModel(params: {
  provider: LLMProviderType;
  model: string;
  thinkingMode?: ThinkingMode;
}): string {
  const { provider, model } = params;
  const mode = normalizeThinkingMode(params.thinkingMode);
  const capability = getThinkingCapability(provider, model);

  if (capability.strategy !== "separate-model") {
    return model;
  }

  if (mode === "thinking") {
    return capability.thinkingModel;
  }
  if (mode === "instant") {
    return capability.instantModel;
  }

  return model;
}

// Builds the per-call request-body patch in the provider's NATIVE shape. The
// returned object is what gets merged into the request payload (or, for opencode,
// what gets put under `provider.{id}.models.{modelId}.options` so opencode passes
// it through as Vercel AI SDK `providerOptions`).
//
// Provider native shapes (intentionally NOT unified — each SDK reads its own):
//   DeepSeek V4:  { thinking: { type: "enabled" }, reasoning_effort: "high" }
//   OpenAI 5.5:   { reasoning: { effort: "high" } }   (nested object, not flat)
//   Kimi K2.5:    { thinking: { type: "disabled" } }  (only when forcing instant)
export function getThinkingRequestBodyPatch(params: {
  provider: LLMProviderType;
  model: string;
  thinkingMode?: ThinkingMode;
  reasoningEffort?: ReasoningEffort;
}): Record<string, unknown> | undefined {
  const { provider, model, reasoningEffort } = params;
  const mode = normalizeThinkingMode(params.thinkingMode);
  const capability = getThinkingCapability(provider, model);

  // OpenAI GPT-5.5: always reasoning, only effort is tunable. We omit the patch
  // when no effort is selected so the API default (medium) applies.
  if (capability.strategy === "effort-only") {
    if (!reasoningEffort || !capability.efforts.includes(reasoningEffort)) {
      return undefined;
    }
    return { reasoning: { effort: reasoningEffort } };
  }

  if (capability.strategy !== "param-toggle") {
    return undefined;
  }

  // DeepSeek V4: `thinking` defaults to off; we explicitly enable it on
  // thinking mode and additionally pass `reasoning_effort` when the model
  // supports it (currently only V4 Pro accepts "high").
  if (
    provider === "deepseek" &&
    (matchesModelId(model, DEEPSEEK_V4_PRO_MODEL) ||
      matchesModelId(model, DEEPSEEK_V4_FLASH_MODEL))
  ) {
    if (mode !== "thinking") return undefined;
    const patch: Record<string, unknown> = {
      thinking: { type: "enabled" },
    };
    const allowed = capability.efforts;
    if (reasoningEffort && allowed?.includes(reasoningEffort)) {
      patch.reasoning_effort = reasoningEffort;
    }
    return patch;
  }

  // Moonshot Kimi K2.5: thinking is on by default; only explicitly disable
  // when the user picked instant mode.
  if (mode === "instant") {
    return {
      thinking: {
        type: "disabled",
      },
    };
  }

  return undefined;
}
