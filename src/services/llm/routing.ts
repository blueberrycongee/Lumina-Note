import type { LLMConfig } from "./types";

export type TaskModelPurpose = "main" | "chat" | "complex";

export const FOLLOW_MAIN_MODEL = "__follow_main_model__";

function resolveMainModel(config: LLMConfig): string {
  if (config.model === "custom") {
    return config.customModelId?.trim() || "custom";
  }
  return config.model;
}

function resolvePurposeOverride(
  model: string | undefined,
  customModelId: string | undefined,
): string | null {
  if (!model || model === FOLLOW_MAIN_MODEL) {
    return null;
  }
  if (model === "custom") {
    const trimmed = customModelId?.trim();
    return trimmed || "custom";
  }
  return model;
}

export function getResolvedModelForPurpose(
  config: LLMConfig,
  purpose: TaskModelPurpose,
): string {
  if (purpose === "main") {
    return resolveMainModel(config);
  }

  if (purpose === "chat") {
    return (
      resolvePurposeOverride(config.chatModel, config.chatCustomModelId) ??
      resolveMainModel(config)
    );
  }

  return (
    resolvePurposeOverride(
      config.complexTaskModel,
      config.complexTaskCustomModelId,
    ) ?? resolveMainModel(config)
  );
}

export function hasPurposeModelOverride(
  config: LLMConfig,
  purpose: Exclude<TaskModelPurpose, "main">,
): boolean {
  if (purpose === "chat") {
    return (
      resolvePurposeOverride(config.chatModel, config.chatCustomModelId) !== null
    );
  }
  return (
    resolvePurposeOverride(
      config.complexTaskModel,
      config.complexTaskCustomModelId,
    ) !== null
  );
}

export function buildConfigOverrideForPurpose(
  config: LLMConfig,
  purpose: TaskModelPurpose,
): Partial<LLMConfig> | undefined {
  const model = getResolvedModelForPurpose(config, purpose);
  if (purpose === "main" && model === resolveMainModel(config)) {
    return undefined;
  }

  return {
    model,
    customModelId: undefined,
  };
}
