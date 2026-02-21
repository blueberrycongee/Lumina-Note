/**
 * Custom Provider — 用户自定义 OpenAI 兼容服务
 * 用户需要手动填写 Base URL 和 Model ID
 */

import type { LLMConfig } from "../types";
import { OpenAICompatibleProvider } from "./openaiCompatible";

export class CustomProvider extends OpenAICompatibleProvider {
  constructor(config: LLMConfig) {
    super(config, {
      defaultBaseUrl: config.baseUrl || "https://api.openai.com/v1",
    });
  }
}
