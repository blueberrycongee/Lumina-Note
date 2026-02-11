import type { LLMProviderType, ThinkingMode } from "./types";

export type ThinkingCapability =
  | { strategy: "none" }
  | { strategy: "param-toggle"; parameter: "thinking" }
  | { strategy: "separate-model"; thinkingModel: string; instantModel: string };

const DEFAULT_THINKING_MODE: ThinkingMode = "auto";
const KIMI_K25_MODEL = "kimi-k2.5";
const DEEPSEEK_CHAT_MODEL = "deepseek-chat";
const DEEPSEEK_REASONER_MODEL = "deepseek-reasoner";

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

  if (provider === "moonshot" && matchesModelId(model, KIMI_K25_MODEL)) {
    return { strategy: "param-toggle", parameter: "thinking" };
  }

  if (
    provider === "deepseek" &&
    (matchesModelId(model, DEEPSEEK_CHAT_MODEL) ||
      matchesModelId(model, DEEPSEEK_REASONER_MODEL))
  ) {
    return {
      strategy: "separate-model",
      thinkingModel: DEEPSEEK_REASONER_MODEL,
      instantModel: DEEPSEEK_CHAT_MODEL,
    };
  }

  return { strategy: "none" };
}

export function supportsThinkingModeSwitch(
  provider: LLMProviderType,
  model?: string
): boolean {
  return getThinkingCapability(provider, model).strategy !== "none";
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
}): Record<string, unknown> | undefined {
  const { provider, model } = params;
  const mode = normalizeThinkingMode(params.thinkingMode);
  const capability = getThinkingCapability(provider, model);

  if (capability.strategy === "param-toggle" && mode === "instant") {
    return {
      thinking: {
        type: "disabled",
      },
    };
  }

  return undefined;
}
