/**
 * Generic HTTP helper — 原 Tauri reqwest 代理(兼容残存调用方)。
 *
 * 历史上这个模块存在是为了绕开 Tauri WebView 的 HTTP/2 bug,通过 Rust 端发请求。
 * Electron 迁移后 renderer 是 Chromium,fetch() 直接可用,所以这里改为纯 fetch 壳。
 * 目前仅 cloudSync / cloudUpload 引用。
 */

export interface TauriFetchRequest {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
  timeout_secs?: number
}

export interface TauriFetchResponse {
  status: number
  body: string
  error?: string
}

export async function tauriFetch(request: TauriFetchRequest): Promise<TauriFetchResponse> {
  const controller = new AbortController()
  const timeoutMs = (request.timeout_secs ?? 120) * 1000
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    })
    const body = await res.text()
    return { status: res.status, body }
  } catch (error) {
    return {
      status: 0,
      body: '',
      error: `Fetch failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function tauriFetchJson<T>(
  url: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: string
    timeout?: number
    signal?: AbortSignal
  } = {},
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const response = await tauriFetch({
    url,
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body,
    timeout_secs: options.timeout || 120,
  })

  if (response.error) {
    return { ok: false, status: response.status, error: response.error }
  }

  if (response.status >= 200 && response.status < 300) {
    try {
      const data = JSON.parse(response.body) as T
      return { ok: true, status: response.status, data }
    } catch {
      return { ok: false, status: response.status, error: 'Failed to parse JSON response' }
    }
  }
  return { ok: false, status: response.status, error: response.body }
}
