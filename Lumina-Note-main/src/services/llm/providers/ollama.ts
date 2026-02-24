/**
 * Ollama Provider
 * 本地模型运行，兼容 OpenAI API 格式
 * 通过 Tauri 后端发送请求，避免 CORS 问题
 */

import type { LLMConfig } from "../types";
import { OpenAICompatibleProvider } from "./openaiCompatible";

export class OllamaProvider extends OpenAICompatibleProvider {
  constructor(config: LLMConfig) {
    super(config, {
      defaultBaseUrl: "http://localhost:11434/v1",
      // Ollama 本地模型通常不需要严格的 token 限制
      customBodyFields: {
        options: {
          num_predict: 4096,
        },
      },
    });
  }
}
