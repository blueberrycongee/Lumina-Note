/**
 * LLM Service 统一类型定义
 */

import type { QuoteRange } from "@/types/chat";

// ============ 消息类型 ============

// 图片内容
export interface ImageContent {
  type: "image";
  source: {
    type: "base64";
    mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    data: string; // base64 encoded
  };
}

// 文本内容
export interface TextContent {
  type: "text";
  text: string;
}

// 消息内容可以是纯文本字符串，或多模态内容数组
export type MessageContent = string | (TextContent | ImageContent)[];

export interface FileAttachment {
  type: "file";
  name: string;
  path?: string;
}

export interface QuoteAttachment {
  type: "quote";
  text: string;
  source: string;
  sourcePath?: string;
  summary: string;
  locator?: string;
  range?: QuoteRange;
}

export type MessageAttachment = FileAttachment | QuoteAttachment;

export interface Message {
  role: "user" | "assistant" | "system";
  content: MessageContent;
  attachments?: MessageAttachment[];
}

// ============ Provider 类型 ============

export type LLMProviderType =
  | "anthropic"
  | "openai"
  | "google"
  | "deepseek"
  | "moonshot"
  | "glm"
  | "mimo"
  | "groq"
  | "openrouter"
  | "ollama"
  | "openai-compatible";

// ============ Provider 元数据 ============



// ============ LLM 配置 ============

export interface LLMConfig {
  provider: LLMProviderType;
  apiKey: string;
  apiKeyConfigured?: boolean;
  model: string;
  customModelId?: string;
  baseUrl?: string;
  temperature?: number;
  thinkingMode?: ThinkingMode;
  reasoningEffort?: ReasoningEffort;
}

// ============ LLM 调用参数 ============

export interface LLMOptions {
  signal?: AbortSignal;
  temperature?: number;
  useDefaultTemperature?: boolean;
  maxTokens?: number;
  tools?: unknown[];  // Function Calling 工具定义
}

export type ThinkingMode = "thinking" | "instant";

// Optional second axis: when a model supports tunable reasoning depth on top of
// the binary thinking toggle (e.g. DeepSeek V4 Pro's `reasoning_effort: "high"`,
// OpenAI GPT-5.x `reasoning.effort`, Anthropic `output_config.effort`).
// Each provider maps these levels to its native parameter shape.
// `none` opts out of reasoning entirely (OpenAI / Anthropic / DeepSeek).
// `xhigh` is GPT-5.5's "extreme" tier — most other providers cap at `high` or `max`.
// `max` is Anthropic's and DeepSeek V4 Pro's "maximum thinking" tier.
export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";

// ============ LLM 响应 ============

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMResponse {
  content: string;
  toolCalls?: LLMToolCall[];  // Function Calling 模式下的工具调用
  usage?: LLMUsage;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ============ 流式响应类型 ============

export type StreamChunk =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "usage"; inputTokens: number; outputTokens: number; totalTokens: number }
  | { type: "error"; error: string };

export type LLMStream = AsyncGenerator<StreamChunk>;

// ============ Provider 接口 ============

export interface LLMProvider {
  call(messages: Message[], options?: LLMOptions): Promise<LLMResponse>;
  stream?(messages: Message[], options?: LLMOptions): LLMStream;
}
