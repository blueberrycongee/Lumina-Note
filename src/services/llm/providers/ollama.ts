/**
 * Ollama Provider
 * 本地模型运行，兼容 OpenAI API 格式
 */

import type { Message, LLMConfig, LLMOptions, LLMResponse, LLMProvider } from "../types";

export class OllamaProvider implements LLMProvider {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async call(messages: Message[], options?: LLMOptions): Promise<LLMResponse> {
    const baseUrl = this.config.baseUrl || "http://localhost:11434/v1";

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Ollama 通常不需要 API Key，但如果配置了就使用
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: options?.temperature ?? 0.7,
        // Ollama 本地模型通常没有 max_tokens 限制
        options: {
          num_predict: options?.maxTokens || 4096,
        },
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      // 提供更友好的错误信息
      if (errorText.includes("connection refused") || response.status === 0) {
        throw new Error("无法连接到 Ollama 服务。请确保 Ollama 正在运行 (ollama serve)");
      }
      throw new Error(`Ollama API 错误: ${errorText}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0]?.message?.content || "",
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens || 0,
            completionTokens: data.usage.completion_tokens || 0,
            totalTokens: data.usage.total_tokens || 0,
          }
        : undefined,
    };
  }
}
