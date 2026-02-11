/**
 * LLM Service 统一入口
 */

// 类型导出
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

// Provider 注册表
export { PROVIDER_REGISTRY } from "./types";

// 配置管理
export { getLLMConfig, setLLMConfig, resetLLMConfig } from "./config";

// Providers
export {
  AnthropicProvider,
  OpenAIProvider,
  GeminiProvider,
  MoonshotProvider,
  DeepSeekProvider,
  ZAIProvider,
  GroqProvider,
  OpenRouterProvider,
  OllamaProvider,
} from "./providers";

// ============ 统一调用接口 ============

import type { Message, LLMOptions, LLMResponse, LLMStream, LLMConfig } from "./types";
import { getLLMConfig } from "./config";
import { createProvider } from "./factory";
import { getCurrentTranslations } from "@/stores/useLocaleStore";

// 导出 Router
export { IntentRouter, intentRouter } from "./router";
export { QueryRewriter, queryRewriter } from "./rewrite";
export { createProvider } from "./factory";
export {
  normalizeThinkingMode,
  getThinkingCapability,
  supportsThinkingModeSwitch,
  resolveThinkingModel,
  getThinkingRequestBodyPatch,
} from "./thinking";

/**
 * 调用 LLM (统一入口)
 * 包含重试机制，应对 HTTP/2 协议错误等临时性网络问题
 */
export async function callLLM(
  messages: Message[],
  options?: LLMOptions,
  configOverride?: Partial<LLMConfig>
): Promise<LLMResponse> {
  console.log('[AI Debug] callLLM() called with', messages.length, 'messages');

  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const provider = createProvider(configOverride);
      const config = getLLMConfig();
      const finalOptions = options?.useDefaultTemperature
        ? { ...options }
        : {
            ...options,
            temperature: options?.temperature ?? config.temperature,
          };
      console.log('[AI Debug] Provider created, calling provider.call()');
      const response = await provider.call(messages, finalOptions);
      console.log('[AI Debug] Provider.call() returned successfully');
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error('[AI Debug] Error in callLLM():', lastError);

      // 检查是否是可重试的网络错误
      const isRetryable =
        lastError.message.includes("Failed to fetch") ||
        lastError.message.includes("HTTP2") ||
        lastError.message.includes("network") ||
        lastError.message.includes("ECONNRESET");

      if (isRetryable && attempt < MAX_RETRIES) {
        console.warn(`[LLM] 请求失败 (尝试 ${attempt}/${MAX_RETRIES})，${RETRY_DELAY}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        continue;
      }

      throw lastError;
    }
  }

  const t = getCurrentTranslations();
  throw lastError || new Error(t.common.unknownError);
}

/**
 * 流式调用 LLM (统一入口)
 * 返回 AsyncGenerator，逐块 yield 内容
 */
export async function* callLLMStream(
  messages: Message[],
  options?: LLMOptions,
  configOverride?: Partial<LLMConfig>
): LLMStream {
  const provider = createProvider(configOverride);
  const config = getLLMConfig();
  const finalOptions = options?.useDefaultTemperature
    ? { ...options }
    : {
        ...options,
        temperature: options?.temperature ?? config.temperature,
      };

  console.log('[AI Debug] callLLMStream - provider.stream exists:', !!provider.stream);

  // 检查 Provider 是否支持流式
  if (!provider.stream) {
    // 降级：不支持流式的 Provider 一次性返回
    console.log('[AI Debug] callLLMStream - falling back to non-streaming');
    const response = await provider.call(messages, finalOptions);
    yield { type: "text", text: response.content };
    if (response.usage) {
      yield {
        type: "usage",
        inputTokens: response.usage.promptTokens,
        outputTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
      };
    }
    return;
  }

  // 使用 Provider 的流式方法
  console.log('[AI Debug] callLLMStream - using provider.stream()');
  yield* provider.stream(messages, finalOptions);
}
