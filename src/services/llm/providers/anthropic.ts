/**
 * Anthropic (Claude) Provider
 */

import type { Message, LLMConfig, LLMOptions, LLMResponse, LLMProvider } from "../types";

export class AnthropicProvider implements LLMProvider {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async call(messages: Message[], options?: LLMOptions): Promise<LLMResponse> {
    // 分离 system 消息 (Anthropic 要求 system 单独传)
    const systemMessage = messages.find((m) => m.role === "system");
    const chatMessages = messages.filter((m) => m.role !== "system");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: options?.maxTokens || 4096,
        system: systemMessage?.content || "",
        messages: chatMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API 错误: ${error}`);
    }

    const data = await response.json();
    return {
      content: data.content[0]?.text || "",
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens || 0,
            completionTokens: data.usage.output_tokens || 0,
            totalTokens:
              (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
          }
        : undefined,
    };
  }
}
