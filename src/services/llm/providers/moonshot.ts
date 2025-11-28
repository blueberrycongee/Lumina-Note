/**
 * Moonshot (Kimi) Provider
 * 支持 thinking 模型的特殊处理
 */

import type { Message, LLMConfig, LLMOptions, LLMResponse, LLMProvider } from "../types";

export class MoonshotProvider implements LLMProvider {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async call(messages: Message[], options?: LLMOptions): Promise<LLMResponse> {
    const baseUrl = this.config.baseUrl || "https://api.moonshot.cn/v1";
    const isThinkingModel = this.config.model.includes("thinking");

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
        // Thinking 模型需要 temperature=1.0 和更大的 max_tokens
        temperature: isThinkingModel ? 1.0 : (options?.temperature ?? 0.7),
        max_tokens: isThinkingModel ? 16000 : (options?.maxTokens || 4096),
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.type === "engine_overloaded_error") {
          throw new Error("服务器繁忙，请稍后重试");
        }
        throw new Error(`Moonshot API 错误: ${errorJson.error?.message || errorText}`);
      } catch (e) {
        if (e instanceof Error && e.message.includes("服务器繁忙")) throw e;
        throw new Error(`Moonshot API 错误: ${errorText}`);
      }
    }

    const data = await response.json();
    const message = data.choices[0]?.message;

    // 处理 thinking 模型的 reasoning_content
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
