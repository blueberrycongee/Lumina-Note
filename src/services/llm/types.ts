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
  | "gemini"
  | "moonshot" 
  | "deepseek"
  | "groq"
  | "openrouter"
  | "ollama";

// ============ Provider 元数据 ============

export interface ProviderMeta {
  name: string;
  label: string;
  description: string;
  defaultBaseUrl?: string;
  models: ModelMeta[];
  supportsFunctionCalling: boolean; // 是否支持 Function Calling
}

export interface ModelMeta {
  id: string;
  name: string;
  contextWindow?: number;
  maxTokens?: number;
  supportsThinking?: boolean;
  supportsVision?: boolean; // 是否支持图片输入
}

// ============ 意图识别 ============

export type IntentType = "chat" | "search" | "edit" | "create" | "organize" | "flashcard" | "complex";

export interface Intent {
  type: IntentType;
  confidence: number;
  reasoning: string;
}

// ============ 路由配置 ============

export interface RoutingConfig {
  enabled: boolean;
  
  // 意图识别模型 (用于分析用户意图)
  intentProvider?: LLMProviderType;
  intentApiKey?: string;
  intentModel?: string;
  intentCustomModelId?: string;
  intentBaseUrl?: string;

  // 聊天/轻量级模型 (用于 Chat 模式和简单意图)
  chatProvider?: LLMProviderType;
  chatApiKey?: string;
  chatModel?: string;
  chatCustomModelId?: string;
  chatBaseUrl?: string;

  // 路由规则：哪些意图路由到聊天模型
  // 例如: ["chat", "search"] -> 这些意图使用 chatModel，其他使用主模型
  targetIntents: IntentType[];
}

// ============ LLM 配置 ============

export interface LLMConfig {
  provider: LLMProviderType;
  apiKey: string;
  model: string;
  customModelId?: string;
  baseUrl?: string;
  temperature?: number;
  
  // 路由配置
  routing?: RoutingConfig;
  
  // Deep Research 网络搜索
  tavilyApiKey?: string;
}

// ============ LLM 调用参数 ============

export interface LLMOptions {
  signal?: AbortSignal;
  temperature?: number;
  useDefaultTemperature?: boolean;
  maxTokens?: number;
  tools?: unknown[];  // Function Calling 工具定义
}

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

// ============ Provider 注册表 ============

export const PROVIDER_REGISTRY: Record<LLMProviderType, ProviderMeta> = {
  anthropic: {
    name: "anthropic",
    label: "Anthropic",
    description: "Claude models",
    defaultBaseUrl: "https://api.anthropic.com",
    supportsFunctionCalling: true,
    models: [
      { id: "claude-opus-4-6", name: "Claude Opus 4.6", contextWindow: 200000, supportsVision: true },
      { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", contextWindow: 200000, supportsVision: true },
      { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", contextWindow: 200000, supportsVision: true },
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4 (Legacy)", contextWindow: 200000, supportsVision: true },
      { id: "custom", name: "Custom Model", contextWindow: 200000, supportsVision: true },
    ],
  },
  openai: {
    name: "openai",
    label: "OpenAI",
    description: "GPT models",
    defaultBaseUrl: "https://api.openai.com/v1",
    supportsFunctionCalling: true,
    models: [
      { id: "gpt-5.2", name: "GPT-5.2", contextWindow: 400000, supportsVision: true },
      { id: "gpt-5.2-chat-latest", name: "GPT-5.2 Chat (Latest)", contextWindow: 400000, supportsVision: true },
      { id: "gpt-5.2-mini", name: "GPT-5.2 Mini", contextWindow: 400000 },
      { id: "gpt-5.2-nano", name: "GPT-5.2 Nano", contextWindow: 400000 },
      { id: "gpt-5.2-codex", name: "GPT-5.2 Codex", contextWindow: 400000 },
      { id: "gpt-5", name: "GPT-5", contextWindow: 400000, supportsVision: true },
      { id: "gpt-5-chat-latest", name: "GPT-5 Chat (Latest)", contextWindow: 400000, supportsVision: true },
      { id: "gpt-5-mini", name: "GPT-5 Mini", contextWindow: 400000 },
      { id: "gpt-5-nano", name: "GPT-5 Nano", contextWindow: 400000 },
      { id: "gpt-4.1", name: "GPT-4.1", contextWindow: 1047576, supportsVision: true },
      { id: "gpt-4o", name: "GPT-4o", contextWindow: 128000, supportsVision: true },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", contextWindow: 128000, supportsVision: true },
      { id: "custom", name: "Custom Model", contextWindow: 128000 },
    ],
  },
  gemini: {
    name: "gemini",
    label: "Google Gemini",
    description: "Gemini models",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    supportsFunctionCalling: true,
    models: [
      { id: "gemini-3-pro-preview", name: "Gemini 3 Pro Preview", contextWindow: 1000000, supportsVision: true },
      { id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview", contextWindow: 1000000, supportsVision: true },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", contextWindow: 1000000, supportsVision: true },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", contextWindow: 1000000, supportsVision: true },
      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite", contextWindow: 1000000, supportsVision: true },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", contextWindow: 1000000, supportsVision: true },
      { id: "custom", name: "Custom Model", contextWindow: 128000, supportsVision: true },
    ],
  },
  moonshot: {
    name: "moonshot",
    label: "Moonshot",
    description: "Kimi models",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    supportsFunctionCalling: true,
    models: [
      { id: "kimi-k2.5", name: "Kimi K2.5", contextWindow: 256000, supportsVision: true, supportsThinking: true },
      { id: "kimi-k2-0905-preview", name: "Kimi K2 0905 Preview", contextWindow: 256000 },
      { id: "kimi-k2-turbo-preview", name: "Kimi K2 Turbo Preview", contextWindow: 256000 },
      { id: "kimi-k2-thinking", name: "Kimi K2 Thinking", contextWindow: 256000, supportsThinking: true },
      { id: "kimi-k2-thinking-turbo", name: "Kimi K2 Thinking Turbo", contextWindow: 256000, supportsThinking: true },
      { id: "kimi-k2-0711-preview", name: "Kimi K2 0711 Preview", contextWindow: 131072 },
      { id: "moonshot-v1-128k", name: "Moonshot v1 128K (Legacy)", contextWindow: 128000 },
      { id: "custom", name: "Custom Model", contextWindow: 128000 },
    ],
  },
  deepseek: {
    name: "deepseek",
    label: "DeepSeek",
    description: "DeepSeek models",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    supportsFunctionCalling: true,
    models: [
      { id: "deepseek-chat", name: "DeepSeek V3.2 (Chat)", contextWindow: 128000 },
      { id: "deepseek-reasoner", name: "DeepSeek V3.2 (Reasoner)", contextWindow: 128000, supportsThinking: true },
      { id: "custom", name: "Custom Model", contextWindow: 128000 },
    ],
  },
  groq: {
    name: "groq",
    label: "Groq",
    description: "Ultra-fast inference",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    supportsFunctionCalling: true,
    models: [
      { id: "meta-llama/llama-4-maverick-17b-128e-instruct", name: "Llama 4 Maverick", contextWindow: 131072 },
      { id: "meta-llama/llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout", contextWindow: 131072 },
      { id: "qwen/qwen3-32b", name: "Qwen3 32B", contextWindow: 131072 },
      { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B", contextWindow: 131072 },
      { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B", contextWindow: 131072 },
      { id: "moonshotai/kimi-k2-instruct-0905", name: "Kimi K2 Instruct 0905", contextWindow: 262144 },
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", contextWindow: 128000 },
      { id: "custom", name: "Custom Model", contextWindow: 128000 },
    ],
  },
  openrouter: {
    name: "openrouter",
    label: "OpenRouter",
    description: "Multi-model gateway",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    supportsFunctionCalling: true,
    models: [
      { id: "openai/gpt-5.2", name: "GPT-5.2", contextWindow: 400000, supportsVision: true },
      { id: "openai/gpt-5.2-chat", name: "GPT-5.2 Chat", contextWindow: 400000, supportsVision: true },
      { id: "openai/gpt-5.2-codex", name: "GPT-5.2 Codex", contextWindow: 400000 },
      { id: "anthropic/claude-opus-4.6", name: "Claude Opus 4.6", contextWindow: 200000, supportsVision: true },
      { id: "google/gemini-3-flash-preview", name: "Gemini 3 Flash Preview", contextWindow: 1000000, supportsVision: true },
      { id: "moonshotai/kimi-k2.5", name: "Kimi K2.5", contextWindow: 256000, supportsVision: true },
      { id: "deepseek/deepseek-r1", name: "DeepSeek R1", contextWindow: 128000 },
      { id: "meta-llama/llama-4-maverick-17b-128e-instruct", name: "Llama 4 Maverick", contextWindow: 131072 },
      { id: "custom", name: "Custom Model", contextWindow: 128000 },
    ],
  },
  ollama: {
    name: "ollama",
    label: "Ollama",
    description: "Local models",
    defaultBaseUrl: "http://localhost:11434/v1",
    supportsFunctionCalling: false, // 本地模型 FC 支持不稳定，使用 XML 模式
    models: [
      { id: "llama3.3", name: "Llama 3.3", contextWindow: 131072 },
      { id: "llama3.2", name: "Llama 3.2", contextWindow: 128000 },
      { id: "llama3.2-vision", name: "Llama 3.2 Vision", contextWindow: 128000, supportsVision: true },
      { id: "qwen3:8b", name: "Qwen3 8B", contextWindow: 131072 },
      { id: "llava", name: "LLaVA", contextWindow: 4096, supportsVision: true },
      { id: "qwen2.5:14b", name: "Qwen 2.5 14B", contextWindow: 32768 },
      { id: "deepseek-r1:8b", name: "DeepSeek R1 8B", contextWindow: 131072 },
      { id: "deepseek-r1:14b", name: "DeepSeek R1 14B", contextWindow: 64000 },
      { id: "gemma3", name: "Gemma 3", contextWindow: 32768 },
      { id: "mistral", name: "Mistral 7B", contextWindow: 32768 },
      { id: "gemma2:9b", name: "Gemma 2 9B", contextWindow: 8192 },
      { id: "custom", name: "Custom Model", contextWindow: 128000 },
    ],
  },
};
