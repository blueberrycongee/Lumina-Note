/**
 * LLM HTTP proxy — replaces Tauri Rust backend's llm_fetch / llm_fetch_stream
 *
 * In Electron, the renderer has direct network access, so we could call
 * fetch() directly. But httpClient.ts is wired to go through IPC, so we
 * proxy in main to avoid touching that file in Phase 1.
 */

import https from 'https'
import http from 'http'
import { URL } from 'url'
import { BrowserWindow } from 'electron'

export interface HttpRequest {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
  timeout_secs?: number
}

export interface HttpResponse {
  status: number
  body: string
  error?: string
}

export async function handleLlmFetch(request: HttpRequest): Promise<HttpResponse> {
  return new Promise((resolve) => {
    try {
      const url = new URL(request.url)
      const lib = url.protocol === 'https:' ? https : http
      const timeout = (request.timeout_secs ?? 120) * 1000

      const req = lib.request(
        { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: request.method, headers: request.headers, timeout },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end', () => {
            resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf-8') })
          })
        },
      )
      req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '', error: 'Request timeout' }) })
      req.on('error', (e) => resolve({ status: 0, body: '', error: e.message }))
      if (request.body) req.write(request.body)
      req.end()
    } catch (e) {
      resolve({ status: 0, body: '', error: String(e) })
    }
  })
}

export async function handleLlmFetchStream(
  requestId: string,
  request: HttpRequest,
  win: BrowserWindow,
): Promise<void> {
  return new Promise((resolve) => {
    try {
      const url = new URL(request.url)
      const lib = url.protocol === 'https:' ? https : http
      const timeout = (request.timeout_secs ?? 120) * 1000

      const emit = (payload: object) => {
        if (!win.isDestroyed()) win.webContents.send('__tauri_event__', 'llm-stream-chunk', payload)
      }

      const req = lib.request(
        { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: request.method, headers: request.headers, timeout },
        (res) => {
          let buffer = ''
          res.on('data', (chunk: Buffer) => {
            buffer += chunk.toString('utf-8')
            // SSE lines
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''
            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed || trimmed === 'data: [DONE]') continue
              const data = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed
              emit({ request_id: requestId, chunk: data, done: false })
            }
          })
          res.on('end', () => {
            if (buffer.trim() && buffer.trim() !== 'data: [DONE]') {
              const data = buffer.trim().startsWith('data: ') ? buffer.trim().slice(6) : buffer.trim()
              emit({ request_id: requestId, chunk: data, done: false })
            }
            emit({ request_id: requestId, chunk: '', done: true })
            resolve()
          })
          res.on('error', (e: Error) => {
            emit({ request_id: requestId, chunk: '', done: true, error: e.message })
            resolve()
          })
        },
      )
      req.on('timeout', () => { req.destroy(); emit({ request_id: requestId, chunk: '', done: true, error: 'Request timeout' }); resolve() })
      req.on('error', (e) => { emit({ request_id: requestId, chunk: '', done: true, error: e.message }); resolve() })
      if (request.body) req.write(request.body)
      req.end()
    } catch (e) {
      const win2 = win
      if (!win2.isDestroyed()) win2.webContents.send('__tauri_event__', 'llm-stream-chunk', { request_id: requestId, chunk: '', done: true, error: String(e) })
      resolve()
    }
  })
}
