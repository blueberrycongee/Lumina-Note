/**
 * 统一 HTTP 客户端
 * 所有 LLM 请求都通过 Tauri 后端发送，避免 WebView 的 CORS 和 HTTP/2 问题
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { StreamChunk } from "./types";

// ============ 类型定义 ============

export interface HttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timeout_secs?: number;
}

export interface HttpResponse {
  status: number;
  body: string;
  error?: string;
}

interface TauriStreamChunk {
  request_id: string;
  chunk: string;
  done: boolean;
  error?: string;
}

// ============ 非流式请求 ============

/**
 * 发送 HTTP 请求（通过 Tauri 后端）
 */
export async function llmFetch(request: HttpRequest): Promise<HttpResponse> {
  try {
    const response = await invoke<HttpResponse>("llm_fetch", { request });
    return response;
  } catch (error) {
    return {
      status: 0,
      body: "",
      error: `Tauri invoke failed: ${error}`,
    };
  }
}

/**
 * 发送 JSON 请求并解析响应
 */
export async function llmFetchJson<T>(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    timeout?: number;
  } = {}
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const response = await llmFetch({
    url,
    method: options.method || "POST",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    timeout_secs: options.timeout || 120,
  });

  if (response.error) {
    return { ok: false, status: response.status, error: response.error };
  }

  if (response.status >= 200 && response.status < 300) {
    try {
      const data = JSON.parse(response.body) as T;
      return { ok: true, status: response.status, data };
    } catch {
      return { ok: false, status: response.status, error: "Failed to parse JSON response" };
    }
  } else {
    return { ok: false, status: response.status, error: response.body };
  }
}

// ============ 流式请求 ============

/**
 * 发送流式 HTTP 请求（通过 Tauri 后端）
 * 返回 AsyncGenerator，可以用 for await 遍历
 */
export async function* llmFetchStream(
  request: HttpRequest,
  parseChunk?: (chunk: string) => StreamChunk[]
): AsyncGenerator<StreamChunk> {
  const requestId = `stream-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  
  // 默认的 chunk 解析器（OpenAI 兼容格式）
  const defaultParser = (chunk: string): StreamChunk[] => {
    const results: StreamChunk[] = [];
    try {
      const data = JSON.parse(chunk);
      const delta = data.choices?.[0]?.delta;

      // reasoning_content (DeepSeek R1, Moonshot Thinking)
      if (delta?.reasoning_content) {
        results.push({ type: "reasoning", text: delta.reasoning_content });
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

  const parser = parseChunk || defaultParser;

  // 使用异步队列来桥接回调和 AsyncGenerator
  type QueueItem = StreamChunk | { type: "done" } | { type: "stream_error"; error: string };
  const queue: QueueItem[] = [];
  let resolveNext: (() => void) | null = null;
  let streamDone = false;
  let streamError: string | null = null;
  let unlisten: UnlistenFn | null = null;

  try {
    // 监听流式数据事件
    unlisten = await listen<TauriStreamChunk>("llm-stream-chunk", (event) => {
      const { request_id, chunk, done, error } = event.payload;
      
      // 只处理当前请求的事件
      if (request_id !== requestId) return;
      
      if (error) {
        queue.push({ type: "stream_error", error });
        streamDone = true;
      } else if (done) {
        queue.push({ type: "done" });
        streamDone = true;
      } else if (chunk) {
        // 解析并入队
        const chunks = parser(chunk);
        for (const c of chunks) {
          queue.push(c);
        }
      }

      // 唤醒等待的 generator
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    });

    // 启动流式请求
    invoke("llm_fetch_stream", { requestId, request }).catch((e) => {
      streamError = String(e);
      streamDone = true;
      if (resolveNext) resolveNext();
    });

    // Generator 循环
    while (true) {
      // 如果队列有数据，取出并 yield
      while (queue.length > 0) {
        const item = queue.shift()!;
        if (item.type === "done") {
          return;
        }
        if (item.type === "stream_error") {
          yield { type: "error", error: item.error };
          return;
        }
        yield item as StreamChunk;
      }

      // 如果流已结束且队列为空，退出
      if (streamDone && queue.length === 0) {
        if (streamError) {
          yield { type: "error", error: streamError };
        }
        return;
      }

      // 等待新数据
      await new Promise<void>((resolve) => {
        resolveNext = resolve;
        // 设置超时，避免永久阻塞
        setTimeout(() => {
          if (resolveNext === resolve) {
            resolveNext = null;
            resolve();
          }
        }, 100);
      });
    }
  } finally {
    unlisten?.();
  }
}
