import { findModelInCatalog, type ModelReasoningSpec } from "./providers/models";
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
//
// This is the renderer-facing capability shape. Per-model native shape lives in
// ModelReasoningSpec (providers/models.ts) — translated below.
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

const DEFAULT_THINKING_MODE: ThinkingMode = "thinking";

// Accepts a wider input than `ThinkingMode` so persisted state from older
// clients (which may still carry the legacy `"auto"` value) deserializes
// cleanly — anything that isn't a current literal collapses to the default.
export function normalizeThinkingMode(mode?: string): ThinkingMode {
  if (mode === "thinking" || mode === "instant") {
    return mode;
  }
  return DEFAULT_THINKING_MODE;
}

function specToCapability(spec: ModelReasoningSpec | undefined): ThinkingCapability {
  if (!spec || spec.strategy === "none") {
    return { strategy: "none" };
  }
  if (spec.strategy === "param-toggle") {
    const out: ThinkingCapability = { strategy: "param-toggle", parameter: "thinking" };
    if (spec.efforts && spec.efforts.length > 0) {
      out.efforts = spec.efforts;
    }
    return out;
  }
  if (spec.strategy === "separate-model") {
    return {
      strategy: "separate-model",
      thinkingModel: spec.thinkingModelId,
      instantModel: spec.instantModelId,
    };
  }
  // effort-only
  return {
    strategy: "effort-only",
    parameter: "reasoning",
    efforts: spec.efforts,
  };
}

export function getThinkingCapability(
  provider: LLMProviderType,
  model?: string
): ThinkingCapability {
  if (!model) {
    return { strategy: "none" };
  }
  const spec = findModelInCatalog(provider, model)?.reasoning;
  return specToCapability(spec);
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
  return capability.instantModel;
}

// Returns the per-provider API default effort for a (provider, model) pair,
// or null when the model has no effort axis. UI uses this to pick a sensible
// initial value when the user has not made an explicit selection or has just
// switched to a model whose previous selection is no longer valid.
export function getDefaultReasoningEffort(
  provider: LLMProviderType,
  model?: string,
): ReasoningEffort | null {
  if (!model) return null;
  const spec = findModelInCatalog(provider, model)?.reasoning;
  if (!spec) return null;
  if (spec.strategy === "effort-only" || spec.strategy === "param-toggle") {
    return spec.defaultEffort ?? null;
  }
  return null;
}
