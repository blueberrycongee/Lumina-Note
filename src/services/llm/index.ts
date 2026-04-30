/**
 * LLM Service 公共出口。
 *
 * Runtime LLM calls go through the embedded opencode agent in Electron main.
 * 这里只保留:
 * - 共享的数据类型(Message / ThinkingMode / ...)
 * - PROVIDER_MODELS metadata(用于 UI 展示模型下拉,不绑实现)
 * - thinking / temperature / routing 辅助工具
 * - callLLM / callLLMStream — deprecated direct-call shims; callers should
 *   route user-visible work through the opencode agent instead.
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
  MIMO_ENDPOINTS,
  getMimoEndpointForBaseUrl,
  getMimoModelsForBaseUrl,
} from "./providers/models";
export type {
  ProviderMeta as AgentProviderMeta,
  ModelMeta as AgentModelMeta,
  MimoEndpoint,
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
  "Direct LLM provider calls were removed. Use the opencode agent runtime instead.";

/**
 * Deprecated stub. Runtime calls should go through useOpencodeAgent.
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

// Deprecated stub kept for old imports; provider testing now goes through
// agent_test_provider IPC.
import type { LLMProvider } from "./types";

export function createProvider(_configOverride?: Partial<LLMConfig>): LLMProvider {
  throw new Error(REMOVED_MESSAGE);
}
