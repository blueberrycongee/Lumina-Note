/**
 * Anthropic (Claude) Provider
 * 支持多模态输入（图片）
 * 通过 Tauri 后端发送请求
 */

import type { Message, MessageContent, LLMConfig, LLMOptions, LLMResponse, LLMProvider } from "../types";
import { llmFetchJson } from "../httpClient";
import { getCurrentTranslations } from "@/stores/useLocaleStore";

// 转换消息内容为 Anthropic 格式
function convertContent(
  content: MessageContent
): string | Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> {
  if (typeof content === "string") {
    return content;
  }
  
  return content.map(item => {
    if (item.type === "text") {
      return { type: "text", text: item.text };
    } else if (item.type === "image") {
      return {
        type: "image",
        source: {
          type: "base64",
          media_type: item.source.mediaType,
          data: item.source.data
        }
      };
    }
    return { type: "text", text: "" };
  });
}

// 提取 system 消息的纯文本内容
function getSystemText(content: MessageContent): string {
  if (typeof content === "string") {
    return content;
  }
  return content
    .filter(item => item.type === "text")
    .map(item => (item as { type: "text"; text: string }).text)
    .join("\n");
}

export class AnthropicProvider implements LLMProvider {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async call(messages: Message[], options?: LLMOptions): Promise<LLMResponse> {
    const baseUrl = this.config.baseUrl || "https://api.anthropic.com";
    
    // 分离 system 消息 (Anthropic 要求 system 单独传)
    const systemMessage = messages.find(m => m.role === "system");
    const chatMessages = messages.filter(m => m.role !== "system");

    const result = await llmFetchJson<{
      content: Array<{ text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    }>(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: {
        model: this.config.model,
        max_tokens: options?.maxTokens || 4096,
        system: systemMessage ? getSystemText(systemMessage.content) : "",
        messages: chatMessages.map(m => ({
          role: m.role,
          content: convertContent(m.content),
        })),
      },
      timeout: 120,
    });

    if (!result.ok || !result.data) {
      const t = getCurrentTranslations();
      throw new Error(t.ai.providerError.replace("{provider}", "Anthropic").replace("{error}", String(result.error)));
    }

    const data = result.data;
    return {
      content: data.content[0]?.text || "",
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens || 0,
        completionTokens: data.usage.output_tokens || 0,
        totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
      } : undefined,
    };
  }
}
