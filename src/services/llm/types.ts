/**
 * LLM Service 统一类型定义
 */

// ============ 消息类型 ============

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

// ============ Provider 类型 ============

export type LLMProviderType = 
  | "anthropic" 
  | "openai" 
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
}

export interface ModelMeta {
  id: string;
  name: string;
  contextWindow?: number;
  maxTokens?: number;
  supportsThinking?: boolean;
}

// ============ LLM 配置 ============

export interface LLMConfig {
  provider: LLMProviderType;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

// ============ LLM 调用参数 ============

export interface LLMOptions {
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
}

// ============ LLM 响应 ============

export interface LLMResponse {
  content: string;
  usage?: LLMUsage;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ============ Provider 接口 ============

export interface LLMProvider {
  call(messages: Message[], options?: LLMOptions): Promise<LLMResponse>;
}

// ============ Provider 注册表 ============

export const PROVIDER_REGISTRY: Record<LLMProviderType, ProviderMeta> = {
  anthropic: {
    name: "anthropic",
    label: "Anthropic",
    description: "Claude 系列模型",
    defaultBaseUrl: "https://api.anthropic.com",
    models: [
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", contextWindow: 200000 },
      { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", contextWindow: 200000 },
      { id: "claude-3-opus-20240229", name: "Claude 3 Opus", contextWindow: 200000 },
      { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku", contextWindow: 200000 },
    ],
  },
  openai: {
    name: "openai",
    label: "OpenAI",
    description: "GPT 系列模型",
    defaultBaseUrl: "https://api.openai.com/v1",
    models: [
      { id: "gpt-4o", name: "GPT-4o", contextWindow: 128000 },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", contextWindow: 128000 },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo", contextWindow: 128000 },
      { id: "gpt-4", name: "GPT-4", contextWindow: 8192 },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", contextWindow: 16385 },
    ],
  },
  moonshot: {
    name: "moonshot",
    label: "Moonshot",
    description: "Kimi 系列模型",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    models: [
      { id: "kimi-k2-0711-preview", name: "Kimi K2", contextWindow: 131072 },
      { id: "moonshot-v1-128k", name: "Moonshot v1 128K", contextWindow: 128000 },
      { id: "moonshot-v1-32k", name: "Moonshot v1 32K", contextWindow: 32000 },
      { id: "moonshot-v1-8k", name: "Moonshot v1 8K", contextWindow: 8000 },
    ],
  },
  deepseek: {
    name: "deepseek",
    label: "DeepSeek",
    description: "DeepSeek 系列模型",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    models: [
      { id: "deepseek-chat", name: "DeepSeek Chat", contextWindow: 64000 },
      { id: "deepseek-reasoner", name: "DeepSeek R1", contextWindow: 64000, supportsThinking: true },
    ],
  },
  groq: {
    name: "groq",
    label: "Groq",
    description: "超快推理服务",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    models: [
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", contextWindow: 128000 },
      { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B", contextWindow: 128000 },
      { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B", contextWindow: 32768 },
      { id: "gemma2-9b-it", name: "Gemma 2 9B", contextWindow: 8192 },
    ],
  },
  openrouter: {
    name: "openrouter",
    label: "OpenRouter",
    description: "多模型聚合网关",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    models: [
      { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", contextWindow: 200000 },
      { id: "openai/gpt-4o", name: "GPT-4o", contextWindow: 128000 },
      { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash", contextWindow: 1000000 },
      { id: "deepseek/deepseek-r1", name: "DeepSeek R1", contextWindow: 64000 },
      { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B", contextWindow: 128000 },
    ],
  },
  ollama: {
    name: "ollama",
    label: "Ollama",
    description: "本地模型",
    defaultBaseUrl: "http://localhost:11434/v1",
    models: [
      { id: "llama3.2", name: "Llama 3.2", contextWindow: 128000 },
      { id: "qwen2.5:14b", name: "Qwen 2.5 14B", contextWindow: 32768 },
      { id: "deepseek-r1:14b", name: "DeepSeek R1 14B", contextWindow: 64000 },
      { id: "mistral", name: "Mistral 7B", contextWindow: 32768 },
      { id: "gemma2:9b", name: "Gemma 2 9B", contextWindow: 8192 },
    ],
  },
};
