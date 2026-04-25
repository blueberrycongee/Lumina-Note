/**
 * AiSdkProvider — 把 Vercel AI SDK 的 streamText 包成我们 ProviderInterface。
 *
 * 传入的 LanguageModel 由 providers/registry.ts 实例化; ToolDefinition 转 AI SDK 的 ToolSet;
 * 我们自己的 Message 栈转换成 AI SDK 的 ModelMessage 栈; fullStream 的 TextStreamPart
 * 映射到我们 ProviderChunk(text / tool_call / usage / finish / error)。
 *
 * 只覆盖 agent loop 实际使用的事件:text-delta / reasoning-delta(合并到 text) / tool-call /
 * finish / error / abort。其余 AI SDK 细节事件(start / start-step / finish-step /
 * message-metadata / raw / source / file) 忽略。
 */

import {
  jsonSchema,
  streamText,
  tool,
  type LanguageModel,
  type ModelMessage,
  type TextStreamPart,
  type ToolSet,
} from 'ai'

import type {
  ContentBlock,
  Message,
  ProviderChunk,
  ProviderInterface,
  ToolDefinition,
} from '../types.js'

export interface AiSdkProviderOptions {
  model: LanguageModel
  /** 传给 streamText 的温度/采样参数透传 */
  temperature?: number
  topP?: number
  maxOutputTokens?: number
}

type SdkStreamPart = TextStreamPart<ToolSet>

export class AiSdkProvider implements ProviderInterface {
  constructor(private readonly options: AiSdkProviderOptions) {}

  async *stream(
    messages: Message[],
    tools: ToolDefinition[],
    signal: AbortSignal,
  ): AsyncIterable<ProviderChunk> {
    const { fullStream } = streamText({
      model: this.options.model,
      messages: convertMessages(messages),
      tools: convertTools(tools),
      abortSignal: signal,
      temperature: this.options.temperature,
      topP: this.options.topP,
      maxOutputTokens: this.options.maxOutputTokens,
    })
    yield* mapFullStream(fullStream)
  }
}

// ── Conversion: Our Message[] → AI SDK ModelMessage[] ──────────────────────

export function convertMessages(messages: Message[]): ModelMessage[] {
  const out: Array<Record<string, unknown>> = []
  for (const msg of messages) {
    if (msg.role === 'system') {
      out.push({
        role: 'system',
        content: flattenText(msg.content),
      })
      continue
    }
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        out.push({ role: 'user', content: msg.content })
        continue
      }
      // Split blocks: tool_result blocks become a separate `role: 'tool'` message
      const toolResultBlocks = msg.content.filter((b) => b.type === 'tool_result')
      const otherBlocks = msg.content.filter((b) => b.type !== 'tool_result')
      if (otherBlocks.length > 0) {
        out.push({
          role: 'user',
          content: otherBlocks.map(convertUserBlock).filter(Boolean),
        })
      }
      if (toolResultBlocks.length > 0) {
        out.push({
          role: 'tool',
          content: toolResultBlocks.map((b) => {
            const br = b as Extract<ContentBlock, { type: 'tool_result' }>
            return {
              type: 'tool-result',
              toolCallId: br.tool_use_id,
              toolName: 'unknown',
              output: { type: 'text' as const, value: br.content },
            }
          }),
        })
      }
      continue
    }
    if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        out.push({ role: 'assistant', content: msg.content })
        continue
      }
      out.push({
        role: 'assistant',
        content: msg.content.map(convertAssistantBlock).filter(Boolean),
      })
      continue
    }
    if (msg.role === 'tool') {
      // Our internal ToolResult-only message
      const content = Array.isArray(msg.content) ? msg.content : []
      out.push({
        role: 'tool',
        content: content
          .filter((b) => b.type === 'tool_result')
          .map((b) => {
            const br = b as Extract<ContentBlock, { type: 'tool_result' }>
            return {
              type: 'tool-result',
              toolCallId: br.tool_use_id,
              toolName: 'unknown',
              output: { type: 'text' as const, value: br.content },
            }
          }),
      })
    }
  }
  // The AI SDK types for messages are stricter than the local agent format; the
  // conversion keeps the unsafe boundary contained here.
  return out as unknown as ModelMessage[]
}

function flattenText(content: Message['content']): string {
  if (typeof content === 'string') return content
  return content
    .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
}

function convertUserBlock(block: ContentBlock): Record<string, unknown> | null {
  if (block.type === 'text') {
    return { type: 'text', text: block.text }
  }
  return null
}

function convertAssistantBlock(
  block: ContentBlock,
): Record<string, unknown> | null {
  if (block.type === 'text') {
    return { type: 'text', text: block.text }
  }
  if (block.type === 'tool_use') {
    return {
      type: 'tool-call',
      toolCallId: block.id,
      toolName: block.name,
      input: block.input,
    }
  }
  return null
}

// ── Conversion: Our ToolDefinition[] → AI SDK ToolSet ──────────────────────

export function convertTools(
  tools: ToolDefinition[],
): ToolSet | undefined {
  if (!tools || tools.length === 0) return undefined
  const out: Record<string, ReturnType<typeof tool>> = {}
  for (const def of tools) {
    out[def.name] = tool({
      description: def.description,
      inputSchema: jsonSchema(def.input_schema),
    })
  }
  return out as ToolSet
}

// ── Conversion: AI SDK fullStream → our ProviderChunk ──────────────────────

export async function* mapFullStream(
  parts: AsyncIterable<SdkStreamPart>,
): AsyncIterable<ProviderChunk> {
  for await (const part of parts) {
    switch (part.type) {
      case 'text-delta':
      case 'reasoning-delta':
        if (part.text) {
          yield { type: 'text', text: part.text }
        }
        break
      case 'tool-call':
        yield {
          type: 'tool_call',
          tool_call: {
            id: part.toolCallId,
            name: part.toolName,
            input: (part as { input: Record<string, unknown> }).input,
          },
        }
        break
      case 'finish': {
        const usage = part.totalUsage
        if (usage) {
          yield {
            type: 'usage',
            usage: {
              prompt_tokens: usage.inputTokens ?? 0,
              completion_tokens: usage.outputTokens ?? 0,
              total_tokens: usage.totalTokens ?? 0,
            },
          }
        }
        yield { type: 'finish', finish_reason: part.finishReason }
        break
      }
      case 'error':
        yield {
          type: 'error',
          error:
            part.error instanceof Error
              ? part.error.message
              : typeof part.error === 'string'
                ? part.error
                : JSON.stringify(part.error),
        }
        break
      case 'abort':
        yield { type: 'finish', finish_reason: 'stop' }
        break
      // Ignored: text-start, text-end, reasoning-start, reasoning-end,
      // tool-input-start, tool-input-end, tool-input-delta, source, file,
      // tool-result, tool-error, tool-output-denied, tool-approval-request,
      // start, start-step, finish-step, message-metadata, response-metadata, raw.
      default:
        break
    }
  }
}
