import type { LLMProviderType, ReasoningEffort, ThinkingMode } from "./types";

export type ThinkingCapability =
  | { strategy: "none" }
  | {
      strategy: "param-toggle";
      parameter: "thinking";
      // When present, the model also supports tunable reasoning depth.
      // UI should render an effort selector restricted to these values.
      efforts?: ReasoningEffort[];
    }
  | { strategy: "separate-model"; thinkingModel: string; instantModel: string };

const DEFAULT_THINKING_MODE: ThinkingMode = "auto";
const KIMI_K25_MODEL = "kimi-k2.5";
const DEEPSEEK_CHAT_MODEL = "deepseek-chat";
const DEEPSEEK_REASONER_MODEL = "deepseek-reasoner";
const DEEPSEEK_V4_PRO_MODEL = "deepseek-v4-pro";
const DEEPSEEK_V4_FLASH_MODEL = "deepseek-v4-flash";

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

export function supportsThinkingModeSwitch(
  provider: LLMProviderType,
  model?: string
): boolean {
  return getThinkingCapability(provider, model).strategy !== "none";
}

// Returns the supported effort levels for a (provider, model) pair, or null
// when the model does not expose a reasoning-effort axis. UI can use this to
// decide whether to render an effort selector and which options to offer.
export function supportedReasoningEfforts(
  provider: LLMProviderType,
  model?: string
): ReasoningEffort[] | null {
  const capability = getThinkingCapability(provider, model);
  if (capability.strategy !== "param-toggle") return null;
  if (!capability.efforts || capability.efforts.length === 0) return null;
  return capability.efforts;
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

export function getThinkingRequestBodyPatch(params: {
  provider: LLMProviderType;
  model: string;
  thinkingMode?: ThinkingMode;
  reasoningEffort?: ReasoningEffort;
}): Record<string, unknown> | undefined {
  const { provider, model, reasoningEffort } = params;
  const mode = normalizeThinkingMode(params.thinkingMode);
  const capability = getThinkingCapability(provider, model);

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
