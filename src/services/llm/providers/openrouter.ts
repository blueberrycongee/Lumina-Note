/**
 * OpenRouter Provider
 * 多模型聚合网关，兼容 OpenAI API 格式
 */

import type { Message, LLMConfig, LLMOptions, LLMResponse, LLMProvider } from "../types";

export class OpenRouterProvider implements LLMProvider {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async call(messages: Message[], options?: LLMOptions): Promise<LLMResponse> {
    const baseUrl = this.config.baseUrl || "https://openrouter.ai/api/v1";

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
        "HTTP-Referer": "https://lumina-note.app",
        "X-Title": "Lumina Note",
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
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(`OpenRouter API 错误: ${errorJson.error?.message || errorText}`);
      } catch {
        throw new Error(`OpenRouter API 错误: ${errorText}`);
      }
    }

    const data = await response.json();
    const message = data.choices[0]?.message;

    // 处理可能的 reasoning 内容 (某些模型如 DeepSeek R1)
    let content = "";
    if (message) {
      if (message.reasoning) {
        content += `<thinking>\n${message.reasoning}\n</thinking>\n\n`;
      }
      content += message.content || "";
    }

    return {
      content,
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
