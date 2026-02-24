import type { LLMProviderType, ThinkingMode } from "./types";

function includesAny(text: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

function isMoonshotK25Model(provider: LLMProviderType, model: string): boolean {
  if (provider !== "moonshot") return false;
  const normalized = model.toLowerCase();
  return (
    normalized.includes("kimi-k2.5") ||
    normalized.includes("kimi-k2-5") ||
    normalized.endsWith("/kimi-k2.5")
  );
}

function resolveFixedTemperature(params: {
  provider: LLMProviderType;
  model: string;
  thinkingMode?: ThinkingMode;
}): number | undefined {
  if (!isMoonshotK25Model(params.provider, params.model)) {
    return undefined;
  }
  // Moonshot K2.5 文档约束：temperature 不是自由参数。
  // - thinking/auto: 1.0
  // - instant (non-thinking): 0.6
  // 若传其他值会被服务端拒绝（HTTP 400），因此必须在客户端强制覆盖。
  return params.thinkingMode === "instant" ? 0.6 : 1.0;
}

function clampTemperature(value: number): number {
  if (!Number.isFinite(value)) return 0.7;
  return Math.min(2, Math.max(0, value));
}

/**
 * 模型默认温度（Best Practice）
 * - 仅在用户未手动设置温度时生效
 * - 不强制覆盖用户输入
 */
export function getRecommendedTemperature(provider: LLMProviderType, model: string): number {
  const normalized = model.toLowerCase();

  // 推理/思考模型通常更适合高温，以获取完整思维链
  if (includesAny(normalized, ["thinking", "reasoner", "r1", "k2.5", "k2-5"])) {
    return 1.0;
  }

  // 代码模型通常偏低温以提升稳定性
  if (includesAny(normalized, ["codex", "coder", "code"])) {
    return 0.2;
  }

  // 轻量/极速模型默认略低，减少发散
  if (includesAny(normalized, ["flash-lite", "nano", "mini"])) {
    return 0.5;
  }
  if (includesAny(normalized, ["flash", "turbo", "haiku"])) {
    return 0.6;
  }

  // Provider 层兜底
  switch (provider) {
    case "ollama":
      return 0.6;
    default:
      return 0.7;
  }
}

/**
 * 解析最终温度：
 * - 用户有设置：使用用户值（并做 [0, 2] 裁剪）
 * - 用户未设置：使用模型推荐默认温度
 */
export function resolveTemperature(params: {
  provider: LLMProviderType;
  model: string;
  configuredTemperature?: number;
  thinkingMode?: ThinkingMode;
}): number {
  const { provider, model, configuredTemperature, thinkingMode } = params;
  const fixedTemperature = resolveFixedTemperature({ provider, model, thinkingMode });
  if (fixedTemperature !== undefined) {
    return fixedTemperature;
  }
  if (configuredTemperature === undefined) {
    return getRecommendedTemperature(provider, model);
  }
  return clampTemperature(configuredTemperature);
}
