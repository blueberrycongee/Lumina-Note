/**
 * LLM Service 公共出口。
 *
 * Phase 2.5 后,所有 LLM 调用都通过 Electron main 的 agent runtime(AI SDK) 完成。
 * 这里只保留:
 * - 共享的数据类型(Message / ThinkingMode / ...)
 * - PROVIDER_MODELS metadata(用于 UI 展示模型下拉,不绑实现)
 * - thinking / temperature / routing 辅助工具
 * - callLLM / callLLMStream — 遗留 API,Phase 5 前端重接 agent runtime 时会替换成真实路径
 */

export type {
  Message,
  MessageContent,
  MessageAttachment,
  FileAttachment,
  QuoteAttachment,
  ImageContent,
  TextContent,
  LLMConfig,
  LLMOptions,
  LLMResponse,
  LLMToolCall,
  LLMUsage,
  LLMProvider,
  LLMProviderType,
  StreamChunk,
  LLMStream,
  ThinkingMode,
  ReasoningEffort,
} from "./types";

export {
  PROVIDER_MODELS,
  listProviderModels,
  getProviderModels,
  findModel,
  findModelInCatalog,
} from "./providers/models";
export type {
  ProviderMeta as AgentProviderMeta,
  ModelMeta as AgentModelMeta,
  ModelReasoningSpec,
  ModelTemperatureSpec,
  ModelApiConstraints,
} from "./providers/models";

// 新的纯数据 provider metadata(Phase 2.3) — 用于 UI 展示,不绑实现
export type {
  OpenAICompatiblePreset,
} from "./providers/metadata";
export {
  PROVIDER_METADATA,
  listProviderModels as listProviderMetadata,
  getProviderModels as getProviderMetadata,
} from "./providers/metadata";
export { OPENAI_COMPATIBLE_PRESETS } from "./providers/models";

// OpenAI Compatible 通配通道辅助 (Phase 2.6)
export type { OpenAiCompatibleSettings } from "./providers/openai-compatible";
export {
  listOpenAiCompatiblePresets,
  getOpenAiCompatiblePreset,
  buildOpenAiCompatibleSettingsFromPreset,
  buildCustomOpenAiCompatibleSettings,
} from "./providers/openai-compatible";

export { getLLMConfig, setLLMConfig, resetLLMConfig } from "./config";
export {
  normalizeThinkingMode,
  getThinkingCapability,
  supportsThinkingModeSwitch,
  supportsBinaryThinkingToggle,
  supportedReasoningEfforts,
  resolveThinkingModel,
  getThinkingRequestBodyPatch,
  getDefaultReasoningEffort,
} from "./thinking";
export type { ThinkingCapability } from "./thinking";

import type {
  LLMConfig,
  LLMOptions,
  LLMResponse,
  LLMStream,
  Message,
} from "./types";

const REMOVED_MESSAGE =
  "LLM provider layer removed in Phase 2.5. Use the agent runtime (Electron main) via IPC instead.";

/**
 * Stub — 老 callLLM API 已被 TS agent + AI SDK 替代。保留签名让现有 callers 编译通过;
 * 运行时若被调用会直接抛,Phase 5 会重新布线前端。
 */
export async function callLLM(
  _messages: Message[],
  _options?: LLMOptions,
  _configOverride?: Partial<LLMConfig>,
): Promise<LLMResponse> {
  throw new Error(REMOVED_MESSAGE);
}

/**
 * Stub — 同上。
 */
export async function* callLLMStream(
  _messages: Message[],
  _options?: LLMOptions,
  _configOverride?: Partial<LLMConfig>,
): LLMStream {
  throw new Error(REMOVED_MESSAGE);
}

// createProvider 老 API: 直接抛错。唯一一个前端 caller (AISettingsModal) 的 test connection
// 功能会在 Phase 2.8 提供替代 IPC 路径。保留 LLMProvider 返回类型让调用点编译通过。
import type { LLMProvider } from "./types";

export function createProvider(_configOverride?: Partial<LLMConfig>): LLMProvider {
  throw new Error(REMOVED_MESSAGE);
}
