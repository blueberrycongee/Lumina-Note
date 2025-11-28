/**
 * Groq Provider
 * 超快推理服务，兼容 OpenAI API 格式
 */

import type { Message, LLMConfig, LLMOptions, LLMResponse, LLMProvider } from "../types";

export class GroqProvider implements LLMProvider {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async call(messages: Message[], options?: LLMOptions): Promise<LLMResponse> {
    const baseUrl = this.config.baseUrl || "https://api.groq.com/openai/v1";

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens || 4096,
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API 错误: ${errorText}`);
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
