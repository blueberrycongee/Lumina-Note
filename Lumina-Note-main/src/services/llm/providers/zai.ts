/**
 * Z.ai (GLM) Provider
 * OpenAI-compatible chat completion API
 */

import type { LLMConfig } from "../types";
import { OpenAICompatibleProvider } from "./openaiCompatible";

export class ZAIProvider extends OpenAICompatibleProvider {
  constructor(config: LLMConfig) {
    super(config, {
      defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
      supportsReasoning: true,
      reasoningField: "reasoning_content",
    });
  }
}
