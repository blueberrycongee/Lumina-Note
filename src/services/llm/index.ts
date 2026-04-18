/**
 * LLM Service 公共出口。
 *
 * Phase 2.5 后,所有 LLM 调用都通过 Electron main 的 agent runtime(AI SDK) 完成。
 * 这里只保留:
 * - 共享的数据类型(Message / Intent / ThinkingMode / ...)
 * - PROVIDER_REGISTRY metadata(用于 UI 展示模型下拉,不绑实现)
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
  ProviderMeta,
  ModelMeta,
  StreamChunk,
  LLMStream,
  IntentType,
  Intent,
  ThinkingMode,
} from "./types";

export { PROVIDER_REGISTRY } from "./types";

// 新的纯数据 provider metadata(Phase 2.3) — 用于 UI 展示,不绑实现
export type {
  ProviderId as AgentProviderId,
  ProviderMeta as AgentProviderMeta,
  ModelMeta as AgentModelMeta,
  OpenAICompatiblePreset,
} from "./providers/metadata";
export {
  PROVIDER_METADATA,
  OPENAI_COMPATIBLE_PRESETS,
  listProviderMetadata,
  getProviderMetadata,
  findModel,
} from "./providers/metadata";

// OpenAI Compatible 通配通道辅助 (Phase 2.6)
export type { OpenAiCompatibleSettings } from "./providers/openai-compatible";
export {
  listOpenAiCompatiblePresets,
  getOpenAiCompatiblePreset,
  buildOpenAiCompatibleSettingsFromPreset,
  buildCustomOpenAiCompatibleSettings,
} from "./providers/openai-compatible";

export {
  buildConfigOverrideForPurpose,
  FOLLOW_MAIN_MODEL,
  getResolvedModelForPurpose,
  hasPurposeModelOverride,
} from "./routing";
export { getLLMConfig, setLLMConfig, resetLLMConfig } from "./config";
export {
  normalizeThinkingMode,
  getThinkingCapability,
  supportsThinkingModeSwitch,
  resolveThinkingModel,
  getThinkingRequestBodyPatch,
} from "./thinking";

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
