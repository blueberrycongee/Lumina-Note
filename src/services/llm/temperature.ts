import {
  findModelInCatalog,
  type ModelMeta,
  type ModelTemperatureSpec,
} from "./providers/models";
import type { LLMProviderType, ReasoningEffort, ThinkingMode } from "./types";

function includesAny(text: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

function clampTemperature(value: number): number {
  if (!Number.isFinite(value)) return 0.7;
  return Math.min(2, Math.max(0, value));
}

// True iff this model's reasoning is actually on for the given selection.
// For `effort-only` models, the resolved effort (user's selection falling back
// to `defaultEffort`) must be anything other than `none`. Other strategies are
// not currently subject to `fixedWhenReasoning`.
function isReasoningOn(
  meta: ModelMeta | undefined,
  reasoningEffort: ReasoningEffort | undefined,
): boolean {
  const reasoning = meta?.reasoning;
  if (!reasoning || reasoning.strategy !== "effort-only") return false;
  const effective = reasoningEffort ?? reasoning.defaultEffort;
  return effective !== "none";
}

// Resolve a fixed (forced) temperature from the catalog spec, given the user's
// thinking mode and reasoning effort. Order of precedence:
//   1. `fixed` (unconditional)
//   2. `fixedWhenInstant` when mode === instant
//   3. `fixedWhenReasoning` when the model is effort-only and reasoning is on
//   4. `fixedWhenThinking` otherwise (auto/thinking)
function resolveFixedFromSpec(
  spec: ModelTemperatureSpec | undefined,
  meta: ModelMeta | undefined,
  mode: ThinkingMode,
  reasoningEffort: ReasoningEffort | undefined,
): number | undefined {
  if (!spec) return undefined;
  if (spec.fixed !== undefined) return spec.fixed;
  if (mode === "instant") {
    return spec.fixedWhenInstant;
  }
  if (spec.fixedWhenReasoning !== undefined && isReasoningOn(meta, reasoningEffort)) {
    return spec.fixedWhenReasoning;
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
  reasoningEffort?: ReasoningEffort;
}): number {
  const { provider, model, configuredTemperature, reasoningEffort } = params;
  const mode: ThinkingMode = params.thinkingMode === "instant" ? "instant"
    : params.thinkingMode === "thinking" ? "thinking"
    : "auto";
  const meta = findModelInCatalog(provider, model);
  const spec = meta?.temperature;
  const fixed = resolveFixedFromSpec(spec, meta, mode, reasoningEffort);
  if (fixed !== undefined) {
    return fixed;
  }
  if (configuredTemperature === undefined) {
    return getRecommendedTemperature(provider, model);
  }
  return clampTemperature(configuredTemperature);
}
