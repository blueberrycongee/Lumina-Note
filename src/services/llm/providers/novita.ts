/**
 * Novita Provider
 * OpenAI-compatible API endpoint for Novita AI
 */

import type { LLMConfig } from "../types";
import { OpenAICompatibleProvider } from "./openaiCompatible";

export class NovitaProvider extends OpenAICompatibleProvider {
  constructor(config: LLMConfig) {
    super(config, {
      defaultBaseUrl: "https://api.novita.ai/openai",
    });
  }
}
