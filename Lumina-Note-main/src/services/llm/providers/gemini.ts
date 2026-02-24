/**
 * Google Gemini Provider
 * 支持 Gemini 2.5 Flash/Pro 等模型
 * 支持多模态输入（图片）
 * 通过 Tauri 后端发送请求
 */

import type { Message, MessageContent, LLMConfig, LLMOptions, LLMResponse, LLMProvider } from "../types";
import { llmFetchJson } from "../httpClient";
import { getCurrentTranslations } from "@/stores/useLocaleStore";
import { resolveTemperature } from "../temperature";

// Gemini 消息部分的类型
type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

export class GeminiProvider implements LLMProvider {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async call(messages: Message[], options?: LLMOptions): Promise<LLMResponse> {
    const baseUrl = this.config.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
    const model = this.config.model || "gemini-2.5-flash";

    // 转换消息格式为 Gemini 格式
    const contents = this.convertMessages(messages);

    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: options?.maxTokens || 8192,
    };
    generationConfig.temperature = resolveTemperature({
      provider: this.config.provider,
      model: this.config.model,
      configuredTemperature: options?.temperature ?? this.config.temperature,
    });

    const result = await llmFetchJson<{
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    }>(`${baseUrl}/models/${model}:generateContent?key=${this.config.apiKey}`, {
      method: "POST",
      body: {
        contents,
        generationConfig,
      },
      timeout: 120,
    });

    if (!result.ok || !result.data) {
      const t = getCurrentTranslations();
      throw new Error(t.ai.providerError.replace("{provider}", "Gemini").replace("{error}", String(result.error)));
    }

    const data = result.data;
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const usage = data.usageMetadata ? {
      promptTokens: data.usageMetadata.promptTokenCount || 0,
      completionTokens: data.usageMetadata.candidatesTokenCount || 0,
      totalTokens: data.usageMetadata.totalTokenCount || 0,
    } : undefined;

    return { content, usage };
  }

  /**
   * 转换消息内容为 Gemini parts 格式
   */
  private convertContent(content: MessageContent): GeminiPart[] {
    if (typeof content === "string") {
      return [{ text: content }];
    }
    
    return content.map(item => {
      if (item.type === "text") {
        return { text: item.text };
      } else if (item.type === "image") {
        return {
          inline_data: {
            mime_type: item.source.mediaType,
            data: item.source.data
          }
        };
      }
      return { text: "" };
    });
  }

  /**
   * 将标准消息格式转换为 Gemini 格式
   */
  private convertMessages(messages: Message[]): Array<{ role: string; parts: GeminiPart[] }> {
    const contents: Array<{ role: string; parts: GeminiPart[] }> = [];
    
    for (const msg of messages) {
      // Gemini 只支持 "user" 和 "model" 角色
      let role: string;
      if (msg.role === "assistant") {
        role = "model";
      } else if (msg.role === "system") {
        role = "user";
      } else {
        role = "user";
      }

      const parts = this.convertContent(msg.content);

      // 合并连续的相同角色消息
      const lastContent = contents[contents.length - 1];
      if (lastContent && lastContent.role === role) {
        lastContent.parts.push(...parts);
      } else {
        contents.push({ role, parts });
      }
    }

    // Gemini 要求第一条消息必须是 user
    if (contents.length > 0 && contents[0].role === "model") {
      const t = getCurrentTranslations();
      contents.unshift({
        role: "user",
        parts: [{ text: t.common.continue }],
      });
    }

    return contents;
  }
}
