import { findModelInCatalog, type ModelTemperatureSpec } from "./providers/models";
import type { LLMProviderType, ThinkingMode } from "./types";

function includesAny(text: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

function clampTemperature(value: number): number {
  if (!Number.isFinite(value)) return 0.7;
  return Math.min(2, Math.max(0, value));
}

// Resolve a fixed (forced) temperature from the catalog spec, given the user's
// thinking mode. `fixed` always wins; otherwise `fixedWhenThinking` applies
// for any non-instant mode (matches the existing K2.5 contract where `auto`
// behaves as thinking-on at the API level).
function resolveFixedFromSpec(
  spec: ModelTemperatureSpec | undefined,
  mode: ThinkingMode,
): number | undefined {
  if (!spec) return undefined;
  if (spec.fixed !== undefined) return spec.fixed;
  if (mode === "instant") {
    return spec.fixedWhenInstant;
  }
  return spec.fixedWhenThinking;
}

/**
 * 模型默认温度（Best Practice）
 * - 仅在用户未手动设置温度时生效
 * - 不强制覆盖用户输入
 *
 * 优先读取 catalog 的 `temperature.recommended`；无配置时退回到字符串启发式
 * （codex/coder/code/flash/turbo/haiku 等），最后是 provider 兜底。启发式仅
 * 兜底未在 catalog 中声明的自定义/模糊模型 id。
 */
export function getRecommendedTemperature(provider: LLMProviderType, model: string): number {
  const spec = findModelInCatalog(provider, model)?.temperature;
  if (spec?.recommended !== undefined) {
    return spec.recommended;
  }

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
 * - 模型在 catalog 中声明了 fixed/fixedWhenThinking/fixedWhenInstant：强制覆盖
 * - 用户有设置：使用用户值（并做 [0, 2] 裁剪）
 * - 用户未设置：使用模型推荐默认温度
 */
export function resolveTemperature(params: {
  provider: LLMProviderType;
  model: string;
  configuredTemperature?: number;
  thinkingMode?: ThinkingMode;
}): number {
  const { provider, model, configuredTemperature } = params;
  const mode: ThinkingMode = params.thinkingMode === "instant" ? "instant"
    : params.thinkingMode === "thinking" ? "thinking"
    : "auto";
  const spec = findModelInCatalog(provider, model)?.temperature;
  const fixed = resolveFixedFromSpec(spec, mode);
  if (fixed !== undefined) {
    return fixed;
  }
  if (configuredTemperature === undefined) {
    return getRecommendedTemperature(provider, model);
  }
  return clampTemperature(configuredTemperature);
}
