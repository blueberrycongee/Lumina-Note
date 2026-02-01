/**
 * LLM Service 统一类型定义
 */

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

export interface Message {
  role: "user" | "assistant" | "system";
  content: MessageContent;
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
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", contextWindow: 200000, supportsVision: true },
      { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", contextWindow: 200000, supportsVision: true },
      { id: "claude-3-opus-20240229", name: "Claude 3 Opus", contextWindow: 200000, supportsVision: true },
      { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku", contextWindow: 200000, supportsVision: true },
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
      { id: "gpt-4o", name: "GPT-4o", contextWindow: 128000, supportsVision: true },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", contextWindow: 128000, supportsVision: true },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo", contextWindow: 128000, supportsVision: true },
      { id: "gpt-4", name: "GPT-4", contextWindow: 8192 },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", contextWindow: 16385 },
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
      { id: "gemini-2.5-pro-preview-06-05", name: "Gemini 2.5 Pro Preview", contextWindow: 1000000, supportsVision: true },
      { id: "gemini-2.5-flash-preview-05-20", name: "Gemini 2.5 Flash Preview", contextWindow: 1000000, supportsVision: true },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", contextWindow: 1000000, supportsVision: true },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", contextWindow: 1000000, supportsVision: true },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", contextWindow: 1000000, supportsVision: true },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", contextWindow: 2000000, supportsVision: true },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", contextWindow: 1000000, supportsVision: true },
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
      { id: "kimi-k2-0711-preview", name: "Kimi K2", contextWindow: 131072 },
      { id: "kimi-k2-thinking", name: "Kimi K2 Thinking", contextWindow: 131072, supportsThinking: true },
      { id: "moonshot-v1-128k", name: "Moonshot v1 128K", contextWindow: 128000 },
      { id: "moonshot-v1-32k", name: "Moonshot v1 32K", contextWindow: 32000 },
      { id: "moonshot-v1-8k", name: "Moonshot v1 8K", contextWindow: 8000 },
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
      { id: "deepseek-chat", name: "DeepSeek Chat", contextWindow: 64000 },
      { id: "deepseek-reasoner", name: "DeepSeek R1", contextWindow: 64000, supportsThinking: true },
      { id: "custom", name: "Custom Model", contextWindow: 64000 },
    ],
  },
  groq: {
    name: "groq",
    label: "Groq",
    description: "Ultra-fast inference",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    supportsFunctionCalling: true,
    models: [
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", contextWindow: 128000 },
      { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B", contextWindow: 128000 },
      { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B", contextWindow: 32768 },
      { id: "gemma2-9b-it", name: "Gemma 2 9B", contextWindow: 8192 },
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
      { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", contextWindow: 200000, supportsVision: true },
      { id: "openai/gpt-4o", name: "GPT-4o", contextWindow: 128000, supportsVision: true },
      { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash", contextWindow: 1000000, supportsVision: true },
      { id: "deepseek/deepseek-r1", name: "DeepSeek R1", contextWindow: 64000 },
      { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B", contextWindow: 128000 },
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
      { id: "llama3.2", name: "Llama 3.2", contextWindow: 128000 },
      { id: "llama3.2-vision", name: "Llama 3.2 Vision", contextWindow: 128000, supportsVision: true },
      { id: "llava", name: "LLaVA", contextWindow: 4096, supportsVision: true },
      { id: "qwen2.5:14b", name: "Qwen 2.5 14B", contextWindow: 32768 },
      { id: "deepseek-r1:14b", name: "DeepSeek R1 14B", contextWindow: 64000 },
      { id: "mistral", name: "Mistral 7B", contextWindow: 32768 },
      { id: "gemma2:9b", name: "Gemma 2 9B", contextWindow: 8192 },
      { id: "custom", name: "Custom Model", contextWindow: 128000 },
    ],
  },
};
