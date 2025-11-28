/**
 * LLM Service 统一入口
 */

// 类型导出
export type {
  Message,
  LLMConfig,
  LLMOptions,
  LLMResponse,
  LLMUsage,
  LLMProvider,
  LLMProviderType,
  ProviderMeta,
  ModelMeta,
} from "./types";

// Provider 注册表
export { PROVIDER_REGISTRY } from "./types";

// 配置管理
export { getLLMConfig, setLLMConfig, resetLLMConfig } from "./config";

// Providers
export { 
  AnthropicProvider, 
  OpenAIProvider, 
  MoonshotProvider,
  DeepSeekProvider,
  GroqProvider,
  OpenRouterProvider,
  OllamaProvider,
} from "./providers";

// ============ 统一调用接口 ============

import type { Message, LLMOptions, LLMResponse, LLMProvider } from "./types";
import { getLLMConfig } from "./config";
import { 
  AnthropicProvider, 
  OpenAIProvider, 
  MoonshotProvider,
  DeepSeekProvider,
  GroqProvider,
  OpenRouterProvider,
  OllamaProvider,
} from "./providers";

/**
 * 根据当前配置创建 Provider 实例
 */
export function createProvider(): LLMProvider {
  const config = getLLMConfig();

  // Ollama 不需要 API Key
  if (!config.apiKey && config.provider !== "ollama") {
    throw new Error("请先配置 API Key");
  }

  switch (config.provider) {
    case "anthropic":
      return new AnthropicProvider(config);
    case "openai":
      return new OpenAIProvider(config);
    case "moonshot":
      return new MoonshotProvider(config);
    case "deepseek":
      return new DeepSeekProvider(config);
    case "groq":
      return new GroqProvider(config);
    case "openrouter":
      return new OpenRouterProvider(config);
    case "ollama":
      return new OllamaProvider(config);
    default:
      throw new Error(`不支持的 AI 提供商: ${config.provider}`);
  }
}

/**
 * 调用 LLM (统一入口)
 */
export async function callLLM(
  messages: Message[],
  options?: LLMOptions
): Promise<LLMResponse> {
  const provider = createProvider();
  return provider.call(messages, options);
}
