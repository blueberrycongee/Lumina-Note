/**
 * Tauri HTTP Client
 * 使用 Rust 端的 reqwest 库发送 HTTP 请求，绕过 WebView 的 HTTP/2 问题
 * 支持流式传输 (SSE)
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export interface TauriFetchRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timeout_secs?: number;
}

export interface TauriFetchResponse {
  status: number;
  body: string;
  error?: string;
}

/**
 * 使用 Tauri 后端发送 HTTP 请求
 * 这个函数绕过 WebView 的 fetch，使用 Rust 的 reqwest 库
 * 对 HTTP/2 协议的支持更稳定
 */
export async function tauriFetch(request: TauriFetchRequest): Promise<TauriFetchResponse> {
  try {
    const response = await invoke<TauriFetchResponse>("llm_fetch", { request });
    return response;
  } catch (error) {
    // Tauri invoke 失败
    return {
      status: 0,
      body: "",
      error: `Tauri invoke failed: ${error}`,
    };
  }
}

/**
 * 封装为类似 fetch 的 API
 * 方便替换现有代码
 */
export async function tauriFetchJson<T>(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
    signal?: AbortSignal;  // 注意：Tauri 端不支持 AbortSignal，这里仅做兼容
  } = {}
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const response = await tauriFetch({
    url,
    method: options.method || "GET",
    headers: options.headers || {},
    body: options.body,
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

/**
 * 流式 SSE 响应块
 */
export interface StreamChunk {
  request_id: string;
  chunk: string;
  done: boolean;
  error?: string;
}

/**
 * 使用 Tauri 后端发送流式 HTTP 请求
 * 通过 Tauri 事件系统接收 SSE 数据
 */
export async function tauriFetchStream(
  request: TauriFetchRequest,
  onChunk: (chunk: string) => void,
  onError?: (error: string) => void,
): Promise<string> {
  const requestId = `stream-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let fullContent = "";
  let unlisten: UnlistenFn | null = null;

  return new Promise<string>(async (resolve, reject) => {
    try {
      // 监听流式数据事件
      unlisten = await listen<StreamChunk>("llm-stream-chunk", (event) => {
        const { request_id, chunk, done, error } = event.payload;
        
        // 只处理当前请求的事件
        if (request_id !== requestId) return;

        if (error) {
          onError?.(error);
          unlisten?.();
          reject(new Error(error));
          return;
        }

        if (chunk) {
          // 解析 SSE JSON 数据，提取 content
          try {
            const data = JSON.parse(chunk);
            const delta = data.choices?.[0]?.delta;
            if (delta?.content) {
              fullContent += delta.content;
              onChunk(delta.content);
            }
            // 处理 reasoning_content (DeepSeek R1)
            if (delta?.reasoning_content) {
              const reasoningChunk = delta.reasoning_content;
              fullContent += reasoningChunk;
              onChunk(reasoningChunk);
            }
          } catch {
            // 如果不是 JSON，直接使用原始内容
            fullContent += chunk;
            onChunk(chunk);
          }
        }

        if (done) {
          unlisten?.();
          resolve(fullContent);
        }
      });

      // 启动流式请求
      await invoke("llm_fetch_stream", {
        requestId,
        request,
      });
    } catch (error) {
      unlisten?.();
      reject(error);
    }
  });
}
