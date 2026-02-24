/**
 * Groq Provider
 * 超快推理服务，兼容 OpenAI API 格式
 */

import type { LLMConfig } from "../types";
import { OpenAICompatibleProvider } from "./openaiCompatible";

export class GroqProvider extends OpenAICompatibleProvider {
  constructor(config: LLMConfig) {
    super(config, {
      defaultBaseUrl: "https://api.groq.com/openai/v1",
    });
  }
}
