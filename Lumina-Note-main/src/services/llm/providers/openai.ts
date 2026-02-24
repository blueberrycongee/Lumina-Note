/**
 * OpenAI Provider
 * 兼容所有 OpenAI API 格式的服务
 * 支持多模态输入（图片）
 */

import type { LLMConfig } from "../types";
import { OpenAICompatibleProvider } from "./openaiCompatible";

export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor(config: LLMConfig) {
    super(config, {
      defaultBaseUrl: "https://api.openai.com/v1",
    });
  }
}
