/**
 * Test-connection helpers for image-generation providers.
 *
 * Each provider exposes a lightweight read endpoint we can hit with the key
 * to confirm the credential is valid without paying for a real generation.
 *
 *  - OpenAI       — GET /v1/models                    (Bearer token)
 *  - Google       — GET /v1beta/models?key=…          (query-string key)
 *  - ByteDance    — GET /api/v3/models                (Bearer token, OpenAI-compat)
 *
 * The check is deliberately shallow: a 200 response means "key is recognised
 * by this base URL." It does NOT prove the key is entitled to image generation
 * specifically — that surfaces when generate_image actually fires.
 */

import type { ImageProviderId } from './registry.js'
import { getImageProvider } from './registry.js'

export interface ImageTestResult {
  success: boolean
  latencyMs?: number
  error?: string
}

const TIMEOUT_MS = 10_000

export async function testImageProviderConnection(input: {
  providerId: ImageProviderId
  apiKey: string
  baseUrl?: string
}): Promise<ImageTestResult> {
  const { providerId, apiKey } = input
  if (!apiKey || apiKey.trim().length === 0) {
    return { success: false, error: 'missing api key' }
  }

  const entry = getImageProvider(providerId)
  if (!entry) {
    return { success: false, error: `unknown provider: ${providerId}` }
  }

  const baseUrl = (input.baseUrl ?? entry.defaultBaseUrl).replace(/\/$/, '')
  const start = Date.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)

  try {
    let url: string
    let init: RequestInit

    switch (providerId) {
      case 'openai-image': {
        url = `${baseUrl}/models`
        init = {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey.trim()}` },
          signal: ctrl.signal,
        }
        break
      }
      case 'google-image': {
        url = `${baseUrl}/models?key=${encodeURIComponent(apiKey.trim())}`
        init = { method: 'GET', signal: ctrl.signal }
        break
      }
      case 'bytedance-image': {
        url = `${baseUrl}/models`
        init = {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey.trim()}` },
          signal: ctrl.signal,
        }
        break
      }
    }

    const res = await fetch(url, init)
    const latencyMs = Date.now() - start
    if (res.ok) return { success: true, latencyMs }

    const body = await res.text().catch(() => '')
    const trimmed = body.length > 200 ? body.slice(0, 200) + '…' : body
    return {
      success: false,
      latencyMs,
      error: `HTTP ${res.status}${trimmed ? `: ${trimmed}` : ''}`,
    }
  } catch (err) {
    const latencyMs = Date.now() - start
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { success: false, latencyMs, error: 'timeout' }
    }
    return {
      success: false,
      latencyMs,
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    clearTimeout(timer)
  }
}
