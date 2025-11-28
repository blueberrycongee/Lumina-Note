# Roo-Code 多 Provider 实现详解

本文档详细记录了 Roo-Code 项目中多 LLM Provider 的实现方式，供 Lumina Note 项目参考。

---

## 1. 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                     Task (调用方)                        │
│                           │                              │
│                 buildApiHandler(config)                  │
│                           │                              │
│                           ▼                              │
│  ┌─────────────────────────────────────────────────┐    │
│  │                  ApiHandler                      │    │
│  │  - createMessage(): ApiStream                    │    │
│  │  - getModel(): { id, info }                     │    │
│  │  - countTokens(): Promise<number>               │    │
│  └─────────────────────────────────────────────────┘    │
│                           │                              │
│       ┌───────────────────┼───────────────────┐         │
│       ▼                   ▼                   ▼         │
│  ┌──────────┐       ┌──────────┐       ┌──────────┐    │
│  │ Anthropic│       │  OpenAI  │       │  Ollama  │    │
│  │ Handler  │       │  Handler │       │  Handler │    │
│  └──────────┘       └──────────┘       └──────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 核心接口定义

### ApiHandler 接口

```typescript
// src/api/index.ts
export interface ApiHandler {
  createMessage(
    systemPrompt: string,
    messages: Anthropic.Messages.MessageParam[],
    metadata?: ApiHandlerCreateMessageMetadata,
  ): ApiStream

  getModel(): { id: string; info: ModelInfo }
  countTokens(content: Array<Anthropic.Messages.ContentBlockParam>): Promise<number>
}

export interface ApiHandlerCreateMessageMetadata {
  taskId: string
  mode?: string
  tools?: OpenAI.Chat.ChatCompletionTool[]
  tool_choice?: OpenAI.Chat.ChatCompletionCreateParams["tool_choice"]
  toolProtocol?: "xml" | "native"
  parallelToolCalls?: boolean
}
```

---

## 3. Provider 类型分类

```typescript
// packages/types/src/provider-settings.ts

// 动态提供商 - 需要 API 调用获取模型列表
export const dynamicProviders = [
  "openrouter", "vercel-ai-gateway", "huggingface", "litellm",
  "deepinfra", "io-intelligence", "requesty", "unbound", 
  "glama", "roo", "chutes",
] as const

// 本地提供商 - localhost 获取模型
export const localProviders = ["ollama", "lmstudio"] as const

// 内部提供商 - VSCode API
export const internalProviders = ["vscode-lm"] as const

// 自定义提供商 - 完全可配置
export const customProviders = ["openai"] as const

// 模拟提供商
export const fauxProviders = ["fake-ai", "human-relay"] as const

// 所有提供商
export const providerNames = [
  ...dynamicProviders,
  ...localProviders,
  ...internalProviders,
  ...customProviders,
  ...fauxProviders,
  "anthropic", "bedrock", "cerebras", "claude-code", "doubao",
  "deepseek", "featherless", "fireworks", "gemini", "groq",
  "mistral", "moonshot", "minimax", "openai-native", "qwen-code",
  "sambanova", "vertex", "xai", "zai", "baseten",
] as const

export type ProviderName = (typeof providerNames)[number]
```

---

## 4. Provider Settings 配置系统

使用 Zod 进行类型安全验证：

```typescript
// 基础配置
const baseProviderSettingsSchema = z.object({
  includeMaxTokens: z.boolean().optional(),
  modelTemperature: z.number().nullish(),
  rateLimitSeconds: z.number().optional(),
  enableReasoningEffort: z.boolean().optional(),
  reasoningEffort: z.enum(["disable", "none", "minimal", "low", "medium", "high"]).optional(),
  modelMaxTokens: z.number().optional(),
  toolProtocol: z.enum(["xml", "native"]).optional(),
})

// Anthropic 配置
const anthropicSchema = baseProviderSettingsSchema.extend({
  apiKey: z.string().optional(),
  anthropicBaseUrl: z.string().optional(),
  apiModelId: z.string().optional(),
})

// OpenAI 兼容配置
const openAiSchema = baseProviderSettingsSchema.extend({
  openAiBaseUrl: z.string().optional(),
  openAiApiKey: z.string().optional(),
  openAiModelId: z.string().optional(),
  openAiCustomModelInfo: modelInfoSchema.nullish(),
  openAiStreamingEnabled: z.boolean().optional(),
  openAiHeaders: z.record(z.string(), z.string()).optional(),
})

// Ollama 配置
const ollamaSchema = baseProviderSettingsSchema.extend({
  ollamaModelId: z.string().optional(),
  ollamaBaseUrl: z.string().optional(),
  ollamaApiKey: z.string().optional(),
})

// 合并所有配置
export const providerSettingsSchema = z.object({
  apiProvider: providerNamesSchema.optional(),
  ...anthropicSchema.shape,
  ...openAiSchema.shape,
  ...ollamaSchema.shape,
  // ... 其他 provider schemas
})

export type ProviderSettings = z.infer<typeof providerSettingsSchema>
```

---

## 5. 基类 BaseProvider

```typescript
// src/api/providers/base-provider.ts
export abstract class BaseProvider implements ApiHandler {
  abstract createMessage(
    systemPrompt: string,
    messages: Anthropic.Messages.MessageParam[],
    metadata?: ApiHandlerCreateMessageMetadata,
  ): ApiStream

  abstract getModel(): { id: string; info: ModelInfo }

  // 工具 schema 转换 (OpenAI strict mode)
  protected convertToolsForOpenAI(tools: any[] | undefined): any[] | undefined {
    if (!tools) return undefined
    return tools.map((tool) =>
      tool.type === "function"
        ? {
            ...tool,
            function: {
              ...tool.function,
              parameters: this.convertToolSchemaForOpenAI(tool.function.parameters),
            },
          }
        : tool,
    )
  }

  // 默认 token 计数 (tiktoken)
  async countTokens(content: Anthropic.Messages.ContentBlockParam[]): Promise<number> {
    if (content.length === 0) return 0
    return countTokens(content, { useWorker: true })
  }
}
```

---

## 6. 工厂函数 buildApiHandler

```typescript
// src/api/index.ts
export function buildApiHandler(configuration: ProviderSettings): ApiHandler {
  const { apiProvider, ...options } = configuration

  switch (apiProvider) {
    case "anthropic":
      return new AnthropicHandler(options)
    case "openai":
      return new OpenAiHandler(options)
    case "ollama":
      return new NativeOllamaHandler(options)
    case "gemini":
      return new GeminiHandler(options)
    case "deepseek":
      return new DeepSeekHandler(options)
    case "openrouter":
      return new OpenRouterHandler(options)
    case "bedrock":
      return new AwsBedrockHandler(options)
    case "mistral":
      return new MistralHandler(options)
    case "groq":
      return new GroqHandler(options)
    case "lmstudio":
      return new LmStudioHandler(options)
    // ... 40+ providers
    default:
      return new AnthropicHandler(options)
  }
}
```

---

## 7. 流式响应 ApiStream

```typescript
// src/api/transform/stream.ts
export type ApiStream = AsyncGenerator<ApiStreamChunk>

export type ApiStreamChunk =
  | ApiStreamTextChunk
  | ApiStreamUsageChunk
  | ApiStreamReasoningChunk
  | ApiStreamToolCallPartialChunk
  | ApiStreamError

export interface ApiStreamTextChunk {
  type: "text"
  text: string
}

export interface ApiStreamReasoningChunk {
  type: "reasoning"
  text: string
}

export interface ApiStreamUsageChunk {
  type: "usage"
  inputTokens: number
  outputTokens: number
  cacheWriteTokens?: number
  cacheReadTokens?: number
  totalCost?: number
}

export interface ApiStreamToolCallPartialChunk {
  type: "tool_call_partial"
  index: number
  id?: string
  name?: string
  arguments?: string
}
```

---

## 8. 消息格式转换

```typescript
// src/api/transform/openai-format.ts
export function convertToOpenAiMessages(
  anthropicMessages: Anthropic.Messages.MessageParam[],
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = []

  for (const msg of anthropicMessages) {
    if (typeof msg.content === "string") {
      openAiMessages.push({ role: msg.role, content: msg.content })
    } else {
      // 处理复杂内容: 图片、工具调用等
      if (msg.role === "user") {
        // 分离 tool_result 和普通消息
        const toolResults = msg.content.filter((p) => p.type === "tool_result")
        const others = msg.content.filter((p) => p.type !== "tool_result")

        toolResults.forEach((tr) => {
          openAiMessages.push({
            role: "tool",
            tool_call_id: tr.tool_use_id,
            content: typeof tr.content === "string" ? tr.content : tr.content?.map((p) => p.text).join("\n"),
          })
        })

        if (others.length > 0) {
          openAiMessages.push({
            role: "user",
            content: others.map((p) =>
              p.type === "image"
                ? { type: "image_url", image_url: { url: `data:${p.source.media_type};base64,${p.source.data}` } }
                : { type: "text", text: p.text },
            ),
          })
        }
      } else if (msg.role === "assistant") {
        const toolUses = msg.content.filter((p) => p.type === "tool_use")
        const texts = msg.content.filter((p) => p.type === "text")

        openAiMessages.push({
          role: "assistant",
          content: texts.map((p) => p.text).join("\n") || undefined,
          tool_calls: toolUses.length > 0
            ? toolUses.map((tu) => ({
                id: tu.id,
                type: "function",
                function: { name: tu.name, arguments: JSON.stringify(tu.input) },
              }))
            : undefined,
        })
      }
    }
  }

  return openAiMessages
}
```

---

## 9. 具体 Provider 实现

### 9.1 Anthropic Handler

```typescript
// src/api/providers/anthropic.ts
export class AnthropicHandler extends BaseProvider {
  private client: Anthropic

  constructor(options: ApiHandlerOptions) {
    super()
    this.client = new Anthropic({
      baseURL: options.anthropicBaseUrl || undefined,
      apiKey: options.apiKey,
    })
  }

  async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
    const { id: modelId, maxTokens, temperature } = this.getModel()

    const stream = await this.client.messages.create({
      model: modelId,
      max_tokens: maxTokens ?? 8192,
      temperature,
      system: [{ text: systemPrompt, type: "text", cache_control: { type: "ephemeral" } }],
      messages,
      stream: true,
    })

    for await (const chunk of stream) {
      switch (chunk.type) {
        case "message_start":
          yield {
            type: "usage",
            inputTokens: chunk.message.usage.input_tokens,
            outputTokens: chunk.message.usage.output_tokens,
          }
          break
        case "content_block_start":
          if (chunk.content_block.type === "text") {
            yield { type: "text", text: chunk.content_block.text }
          } else if (chunk.content_block.type === "thinking") {
            yield { type: "reasoning", text: chunk.content_block.thinking }
          }
          break
        case "content_block_delta":
          if (chunk.delta.type === "text_delta") {
            yield { type: "text", text: chunk.delta.text }
          }
          break
      }
    }
  }

  getModel() {
    return { id: this.options.apiModelId || "claude-sonnet-4-20250514", info: anthropicModels[modelId] }
  }
}
```

### 9.2 OpenAI Handler

```typescript
// src/api/providers/openai.ts
export class OpenAiHandler extends BaseProvider {
  private client: OpenAI

  constructor(options: ApiHandlerOptions) {
    super()
    this.client = new OpenAI({
      baseURL: options.openAiBaseUrl ?? "https://api.openai.com/v1",
      apiKey: options.openAiApiKey ?? "not-provided",
    })
  }

  async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
    const openAiMessages = [
      { role: "system", content: systemPrompt },
      ...convertToOpenAiMessages(messages),
    ]

    const stream = await this.client.chat.completions.create({
      model: this.options.openAiModelId,
      messages: openAiMessages,
      temperature: this.options.modelTemperature ?? 0,
      stream: true,
      stream_options: { include_usage: true },
    })

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta
      if (delta?.content) {
        yield { type: "text", text: delta.content }
      }
      if (chunk.usage) {
        yield {
          type: "usage",
          inputTokens: chunk.usage.prompt_tokens || 0,
          outputTokens: chunk.usage.completion_tokens || 0,
        }
      }
    }
  }

  getModel() {
    return { id: this.options.openAiModelId || "", info: openAiModelInfoSaneDefaults }
  }
}
```

### 9.3 Ollama Handler

```typescript
// src/api/providers/ollama.ts
export class OllamaHandler extends BaseProvider {
  private client: OpenAI

  constructor(options: ApiHandlerOptions) {
    super()
    this.client = new OpenAI({
      baseURL: (options.ollamaBaseUrl || "http://localhost:11434") + "/v1",
      apiKey: options.ollamaApiKey || "ollama",
    })
  }

  async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
    const stream = await this.client.chat.completions.create({
      model: this.options.ollamaModelId,
      messages: [{ role: "system", content: systemPrompt }, ...convertToOpenAiMessages(messages)],
      temperature: this.options.modelTemperature ?? 0,
      stream: true,
    })

    for await (const chunk of stream) {
      if (chunk.choices[0]?.delta?.content) {
        yield { type: "text", text: chunk.choices[0].delta.content }
      }
    }
  }

  getModel() {
    return { id: this.options.ollamaModelId || "", info: openAiModelInfoSaneDefaults }
  }
}
```

---

## 10. ModelInfo 模型信息

```typescript
// packages/types/src/model.ts
export const modelInfoSchema = z.object({
  maxTokens: z.number().nullish(),
  contextWindow: z.number(),
  supportsImages: z.boolean().optional(),
  supportsPromptCache: z.boolean(),
  supportsReasoningBudget: z.boolean().optional(),
  supportsReasoningEffort: z.union([z.boolean(), z.array(z.string())]).optional(),
  supportsNativeTools: z.boolean().optional(),
  defaultToolProtocol: z.enum(["xml", "native"]).optional(),
  inputPrice: z.number().optional(),
  outputPrice: z.number().optional(),
  cacheWritesPrice: z.number().optional(),
  cacheReadsPrice: z.number().optional(),
})

export type ModelInfo = z.infer<typeof modelInfoSchema>

// 示例模型定义
export const anthropicModels: Record<string, ModelInfo> = {
  "claude-sonnet-4-20250514": {
    maxTokens: 8192,
    contextWindow: 200000,
    supportsImages: true,
    supportsPromptCache: true,
    supportsNativeTools: true,
    inputPrice: 3.0,
    outputPrice: 15.0,
  },
}
```

---

## 11. 简化实现建议 (Lumina Note)

对于 Lumina Note，可以简化为以下结构：

```typescript
// src/services/llm/types.ts
export interface LLMProvider {
  name: string
  createMessage(systemPrompt: string, messages: Message[]): AsyncGenerator<StreamChunk>
  getModel(): { id: string; info: ModelInfo }
}

export type StreamChunk =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "tool_call"; id: string; name: string; arguments: string }

// src/services/llm/providers/index.ts
export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.provider) {
    case "anthropic":
      return new AnthropicProvider(config)
    case "openai":
      return new OpenAIProvider(config)
    case "ollama":
      return new OllamaProvider(config)
    default:
      throw new Error(`Unknown provider: ${config.provider}`)
  }
}

// 使用示例
const provider = createProvider({ provider: "anthropic", apiKey: "..." })
for await (const chunk of provider.createMessage(systemPrompt, messages)) {
  if (chunk.type === "text") {
    console.log(chunk.text)
  }
}
```

### 核心简化点

1. **统一消息格式**: 使用 Anthropic 格式作为内部标准
2. **工厂模式**: `createProvider()` 根据配置创建具体实现
3. **AsyncGenerator**: 流式响应统一使用异步生成器
4. **类型安全**: Zod 验证配置，TypeScript 类型推导

---

## 参考文件路径

```
Roo-Code/
├── src/api/
│   ├── index.ts                    # ApiHandler 接口 + buildApiHandler
│   ├── providers/
│   │   ├── base-provider.ts        # 基类
│   │   ├── anthropic.ts            # Anthropic 实现
│   │   ├── openai.ts               # OpenAI 兼容实现
│   │   ├── ollama.ts               # Ollama 实现
│   │   └── ...                     # 40+ 其他 providers
│   └── transform/
│       ├── stream.ts               # ApiStream 类型定义
│       ├── openai-format.ts        # 消息格式转换
│       └── r1-format.ts            # DeepSeek R1 格式
├── packages/types/src/
│   ├── provider-settings.ts        # ProviderSettings 配置
│   └── model.ts                    # ModelInfo 类型
└── src/shared/
    └── api.ts                      # ApiHandlerOptions 等
```
