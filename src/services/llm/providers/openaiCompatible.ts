/**
 * OpenAI 兼容 Provider 基类
 * 适用于：OpenAI, Groq, OpenRouter, Ollama, Moonshot 等兼容 OpenAI API 格式的服务
 * 
 * 所有请求通过 Tauri 后端发送，避免 CORS 和 HTTP/2 问题
 */

import type { 
  Message, 
  MessageContent, 
  LLMConfig, 
  LLMOptions, 
  LLMResponse, 
  LLMProvider, 
  LLMStream,
  StreamChunk
} from "../types";
import { llmFetchJson, llmFetchStream, HttpRequest } from "../httpClient";

// ============ 消息格式转换 ============

/**
 * 转换消息内容为 OpenAI 格式（支持多模态）
 */
function convertContent(
  content: MessageContent
): string | Array<{ type: string; text?: string; image_url?: { url: string } }> {
  if (typeof content === "string") {
    return content;
  }
  
  return content.map(item => {
    if (item.type === "text") {
      return { type: "text", text: item.text };
    } else if (item.type === "image") {
      return {
        type: "image_url",
        image_url: {
          url: `data:${item.source.mediaType};base64,${item.source.data}`
        }
      };
    }
    return { type: "text", text: "" };
  });
}

// ============ Provider 配置 ============

export interface OpenAICompatibleConfig {
  /** 默认 Base URL */
  defaultBaseUrl: string;
  /** 额外请求头 */
  extraHeaders?: Record<string, string>;
  /** 是否支持 reasoning_content（DeepSeek R1, Moonshot Thinking） */
  supportsReasoning?: boolean;
  /** reasoning 字段名（默认 reasoning_content，OpenRouter 用 reasoning） */
  reasoningField?: string;
  /** 是否是 thinking 模型（强制 temperature=1.0） */
  isThinkingModel?: (model: string) => boolean;
  /** 自定义请求体字段 */
  customBodyFields?: Record<string, unknown>;
}

// ============ 基类实现 ============

export class OpenAICompatibleProvider implements LLMProvider {
  protected config: LLMConfig;
  protected providerConfig: OpenAICompatibleConfig;

  constructor(config: LLMConfig, providerConfig: OpenAICompatibleConfig) {
    this.config = config;
    this.providerConfig = providerConfig;
  }

  /**
   * 获取 API URL
   */
  protected getUrl(): string {
    const baseUrl = this.config.baseUrl || this.providerConfig.defaultBaseUrl;
    return `${baseUrl}/chat/completions`;
  }

  /**
   * 获取请求头
   */
  protected getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // API Key（Ollama 可选）
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    // 额外请求头
    if (this.providerConfig.extraHeaders) {
      Object.assign(headers, this.providerConfig.extraHeaders);
    }

    return headers;
  }

  /**
   * 获取 temperature（thinking 模型强制 1.0）
   */
  protected getTemperature(options?: LLMOptions): number | undefined {
    const isThinking = this.providerConfig.isThinkingModel?.(this.config.model);
    if (isThinking) return 1.0;
    if (options?.useDefaultTemperature) return undefined;
    return options?.temperature ?? 0.7;
  }

  /**
   * 构建请求体
   */
  protected buildRequestBody(messages: Message[], options?: LLMOptions, stream = false): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: messages.map(m => ({
        role: m.role,
        content: convertContent(m.content),
      })),
      max_tokens: options?.maxTokens || 4096,
      stream,
    };

    const temperature = this.getTemperature(options);
    if (temperature !== undefined) {
      body.temperature = temperature;
    }

    // 流式时请求 usage
    if (stream) {
      body.stream_options = { include_usage: true };
    }

    // 自定义字段
    if (this.providerConfig.customBodyFields) {
      Object.assign(body, this.providerConfig.customBodyFields);
    }

    // Function Calling
    if (options?.tools && options.tools.length > 0) {
      body.tools = options.tools;
      body.tool_choice = "auto";
    }

    return body;
  }

  /**
   * 解析响应内容
   */
  protected parseResponse(data: Record<string, unknown>): LLMResponse {
    const message = (data.choices as Array<{ message?: Record<string, unknown> }>)?.[0]?.message;
    
    let content = "";
    if (message) {
      // 处理 reasoning content
      const reasoningField = this.providerConfig.reasoningField || "reasoning_content";
      const reasoning = message[reasoningField] as string | undefined;
      if (reasoning && this.providerConfig.supportsReasoning) {
        content += `<thinking>\n${reasoning}\n</thinking>\n\n`;
      }
      content += (message.content as string) || "";
    }

    // 解析 tool_calls
    const toolCalls = (message?.tool_calls as Array<{
      id: string;
      function: { name: string; arguments: string };
    }>)?.map(tc => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments || "{}"),
    }));

    // 解析 usage
    const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;

    return {
      content,
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      usage: usage ? {
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
      } : undefined,
    };
  }

  /**
   * 非流式调用
   */
  async call(messages: Message[], options?: LLMOptions): Promise<LLMResponse> {
    const url = this.getUrl();
    const headers = this.getHeaders();
    const body = this.buildRequestBody(messages, options, false);

    const result = await llmFetchJson<Record<string, unknown>>(url, {
      method: "POST",
      headers,
      body,
      timeout: 120,
    });

    if (!result.ok || !result.data) {
      throw new Error(`API 错误 (${result.status}): ${result.error}`);
    }

    return this.parseResponse(result.data);
  }

  /**
   * 流式调用
   */
  async *stream(messages: Message[], options?: LLMOptions): LLMStream {
    const url = this.getUrl();
    const headers = this.getHeaders();
    const body = this.buildRequestBody(messages, options, true);

    const request: HttpRequest = {
      url,
      method: "POST",
      headers,
      body: JSON.stringify(body),
      timeout_secs: 300,
    };

    // 使用自定义解析器处理 reasoning_content
    const reasoningField = this.providerConfig.reasoningField || "reasoning_content";
    const supportsReasoning = this.providerConfig.supportsReasoning;

    const parseChunk = (chunk: string): StreamChunk[] => {
      const results: StreamChunk[] = [];
      try {
        const data = JSON.parse(chunk);
        const delta = data.choices?.[0]?.delta;

        // reasoning content
        if (supportsReasoning && delta?.[reasoningField]) {
          results.push({ type: "reasoning", text: delta[reasoningField] });
        }

        // 正常文本内容
        if (delta?.content) {
          results.push({ type: "text", text: delta.content });
        }

        // usage
        if (data.usage) {
          results.push({
            type: "usage",
            inputTokens: data.usage.prompt_tokens || 0,
            outputTokens: data.usage.completion_tokens || 0,
            totalTokens: data.usage.total_tokens || 0,
          });
        }
      } catch {
        // JSON 解析失败，跳过
      }
      return results;
    };

    yield* llmFetchStream(request, parseChunk);
  }
}
