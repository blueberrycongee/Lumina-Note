/**
 * OpenRouter Provider
 * 多模型聚合网关，兼容 OpenAI API 格式
 */

import type { LLMConfig } from "../types";
import { OpenAICompatibleProvider } from "./openaiCompatible";

export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor(config: LLMConfig) {
    super(config, {
      defaultBaseUrl: "https://openrouter.ai/api/v1",
      extraHeaders: {
        "HTTP-Referer": "https://lumina-note.app",
        "X-Title": "Lumina Note",
      },
      // OpenRouter 的某些模型（如 DeepSeek R1）用 reasoning 字段
      supportsReasoning: true,
      reasoningField: "reasoning",
    });
  }
}
