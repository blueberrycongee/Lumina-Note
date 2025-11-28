/**
 * DeepSeek Provider
 * 支持 DeepSeek R1 的 reasoning_content
 */

import type { Message, LLMConfig, LLMOptions, LLMResponse, LLMProvider } from "../types";

export class DeepSeekProvider implements LLMProvider {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async call(messages: Message[], options?: LLMOptions): Promise<LLMResponse> {
    const baseUrl = this.config.baseUrl || "https://api.deepseek.com/v1";
    const isReasonerModel = this.config.model.includes("reasoner");

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
        temperature: isReasonerModel ? 1.0 : (options?.temperature ?? 0.7),
        max_tokens: options?.maxTokens || 8192,
        stream: false,
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API 错误: ${errorText}`);
    }

    const data = await response.json();
    const message = data.choices[0]?.message;

    // 处理 R1 模型的 reasoning_content
    let content = "";
    if (message) {
      if (message.reasoning_content) {
        content += `<thinking>\n${message.reasoning_content}\n</thinking>\n\n`;
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
