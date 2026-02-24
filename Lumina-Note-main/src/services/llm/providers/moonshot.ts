/**
 * Moonshot (Kimi) Provider
 * 支持 thinking 模型的特殊处理 + 流式传输
 */

import type { LLMConfig, LLMOptions, Message } from "../types";
import { OpenAICompatibleProvider } from "./openaiCompatible";

function isMoonshotK25Model(model: string): boolean {
  const normalized = model.toLowerCase();
  return normalized.includes("k2.5") || normalized.includes("k2-5");
}

function isMoonshotThinkingModel(model: string): boolean {
  const normalized = model.toLowerCase();
  return normalized.includes("thinking");
}

export class MoonshotProvider extends OpenAICompatibleProvider {
  constructor(config: LLMConfig) {
    super(config, {
      defaultBaseUrl: "https://api.moonshot.cn/v1",
      supportsReasoning: true,
      reasoningField: "reasoning_content",
    });
  }

  /**
   * 覆盖构建请求体，处理 Moonshot 特定约束。
   * 注意：K2.5 对采样参数有限制，错误值会直接 400，不能移除这里的兜底。
   */
  protected buildRequestBody(messages: Message[], options?: LLMOptions, stream = false) {
    const body = super.buildRequestBody(messages, options, stream);

    if (isMoonshotK25Model(this.config.model)) {
      // Moonshot K2.5 固定参数（文档约束）：
      // - thinking/auto 温度必须 1.0
      // - instant（non-thinking）温度必须 0.6
      // - top_p=0.95, n=1, presence_penalty=0, frequency_penalty=0
      // 这些值如果传错会 400，因此统一在 provider 层强制覆盖。
      body.temperature = this.config.thinkingMode === "instant" ? 0.6 : 1.0;
      body.top_p = 0.95;
      body.n = 1;
      body.presence_penalty = 0;
      body.frequency_penalty = 0;

      // 对 K2.5 使用官方默认上限，避免沿用通用 provider 的 4096。
      if (!options?.maxTokens) {
        body.max_tokens = 32768;
      }
    } else if (isMoonshotThinkingModel(this.config.model)) {
      // 旧的 thinking 模型维持较高 max_tokens。
      body.max_tokens = 16000;
    }
    
    return body;
  }
}
