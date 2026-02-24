/**
 * DeepSeek Provider
 * 支持 DeepSeek R1 的 reasoning_content + 流式传输
 */

import type { LLMConfig, LLMOptions, Message } from "../types";
import { OpenAICompatibleProvider } from "./openaiCompatible";

export class DeepSeekProvider extends OpenAICompatibleProvider {
  constructor(config: LLMConfig) {
    super(config, {
      defaultBaseUrl: "https://api.deepseek.com/v1",
      supportsReasoning: true,
      reasoningField: "reasoning_content",
    });
  }

  /**
   * 覆盖构建请求体，reasoner 模型需要更大的 max_tokens
   */
  protected buildRequestBody(messages: Message[], options?: LLMOptions, stream = false) {
    const body = super.buildRequestBody(messages, options, stream);
    
    // reasoner 模型需要更大的 max_tokens
    if (this.config.model.includes("reasoner")) {
      body.max_tokens = 8192;
    }
    
    return body;
  }
}
