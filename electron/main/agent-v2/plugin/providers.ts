/**
 * HTTP clients for the three image-generation providers Lumina supports.
 *
 *   - OpenAI gpt-image-2          — /v1/images/generations + /v1/images/edits
 *   - Google Gemini 2.5 Flash     — /v1beta/models/<model>:generateContent
 *   - ByteDance Seedream 4.5      — /api/v3/images/generations (OpenAI-compat)
 *
 * Each provider takes the resolved settings (apiKey + optional baseUrl
 * override) and a normalized request, and returns one or more PNG buffers.
 *
 * Reference images are always passed as base64 PNG bytes — callers read
 * them off disk into Buffer first, then we encode them per provider's
 * particular protocol.
 */

import type { PluginImageProviderId } from './context.js'

export interface ImageGenRequest {
  prompt: string
  /** Up to N reference image bytes (PNG/JPEG). Empty array means text-to-image. */
  referenceImages: Array<{ mimeType: string; bytes: Buffer }>
  /** Aspect ratio passed by the agent; provider-specific mapping below. */
  aspectRatio?: '1:1' | '4:3' | '3:4' | '16:9' | '9:16'
  /** Model id override; defaults to the registry's defaultModelId. */
  modelId?: string
}

export interface ImageGenResult {
  /** PNG bytes for each generated image (always at least 1). */
  images: Buffer[]
  /** Echo of the model id actually used (for sidecar metadata). */
  modelUsed: string
}

const OPENAI_SIZE_MAP: Record<NonNullable<ImageGenRequest['aspectRatio']>, string> = {
  '1:1': '1024x1024',
  '4:3': '1536x1024',
  '3:4': '1024x1536',
  '16:9': '1536x1024',
  '9:16': '1024x1536',
}

const SEEDREAM_SIZE_MAP: Record<NonNullable<ImageGenRequest['aspectRatio']>, string> = {
  '1:1': '2048x2048',
  '4:3': '2048x1536',
  '3:4': '1536x2048',
  '16:9': '2048x1152',
  '9:16': '1152x2048',
}

const IMAGE_FETCH_RETRY_DELAYS_MS = [500, 1500]

export class ImageProviderHttpError extends Error {
  constructor(
    readonly providerLabel: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(`${providerLabel} image API ${status}: ${body.slice(0, 300)}`)
    this.name = 'ImageProviderHttpError'
  }
}

export async function fetchImageProvider(
  url: string | URL,
  init: RequestInit = {},
  options: { retryDelaysMs?: number[] } = {},
): Promise<Response> {
  const retryDelays = options.retryDelaysMs ?? IMAGE_FETCH_RETRY_DELAYS_MS
  let lastError: unknown

  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    try {
      const res = await fetch(url, init)
      if (!isRetryableImageResponseStatus(res.status) || attempt === retryDelays.length) {
        return res
      }
      await res.body?.cancel().catch(() => undefined)
    } catch (err) {
      if (isAbortError(err) || !isRetryableFetchError(err) || attempt === retryDelays.length) {
        throw err
      }
      lastError = err
    }

    await waitForRetry(retryDelays[attempt], init.signal)
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export function isRetryableImageResponseStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function isRetryableFetchError(err: unknown): boolean {
  if (isAbortError(err)) return false
  return err instanceof TypeError || err instanceof Error
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'AbortError' || err.message.toLowerCase().includes('aborted'))
  )
}

function waitForRetry(ms: number, signal?: AbortSignal | null): Promise<void> {
  if (!ms) return Promise.resolve()
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error('The operation was aborted')
  }
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>
    let cleanup = () => {}
    const onAbort = () => {
      clearTimeout(timer)
      cleanup()
      reject(
        signal?.reason instanceof Error
          ? signal.reason
          : new Error('The operation was aborted'),
      )
    }
    cleanup = () => {
      signal?.removeEventListener('abort', onAbort)
    }
    timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
  })
}

export async function dispatchImageGeneration(input: {
  providerId: PluginImageProviderId
  defaults: { defaultModelId: string; defaultBaseUrl: string }
  settings: { apiKey?: string; baseUrl?: string }
  request: ImageGenRequest
  signal?: AbortSignal
}): Promise<ImageGenResult> {
  const { providerId, defaults, settings, request, signal } = input
  if (!settings.apiKey) {
    throw new Error(
      `Image provider '${providerId}' has no API key. ` +
        'Open AI Settings → Image Models to configure one.',
    )
  }
  const baseUrl = (settings.baseUrl ?? defaults.defaultBaseUrl).replace(/\/$/, '')
  const modelId = request.modelId ?? defaults.defaultModelId

  switch (providerId) {
    case 'openai-image':
      return generateOpenAI({ apiKey: settings.apiKey, baseUrl, modelId, request, signal })
    case 'google-image':
      return generateGoogle({ apiKey: settings.apiKey, baseUrl, modelId, request, signal })
    case 'bytedance-image':
      return generateByteDance({
        apiKey: settings.apiKey,
        baseUrl,
        modelId,
        request,
        signal,
      })
  }
}

// ── OpenAI gpt-image-2 ───────────────────────────────────────────────────

async function generateOpenAI(input: {
  apiKey: string
  baseUrl: string
  modelId: string
  request: ImageGenRequest
  signal?: AbortSignal
}): Promise<ImageGenResult> {
  const { apiKey, baseUrl, modelId, request, signal } = input
  const size = request.aspectRatio ? OPENAI_SIZE_MAP[request.aspectRatio] : '1024x1024'

  if (request.referenceImages.length === 0) {
    // Pure text-to-image: JSON body to /images/generations.
    const res = await fetchImageProvider(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        prompt: request.prompt,
        n: 1,
        size,
      }),
      signal,
    })
    return parseOpenAIResponse(res, modelId, 'OpenAI')
  }

  // With reference images: multipart/form-data to /images/edits.
  const form = new FormData()
  form.append('model', modelId)
  form.append('prompt', request.prompt)
  form.append('n', '1')
  form.append('size', size)
  request.referenceImages.forEach((img, idx) => {
    const blob = new Blob([new Uint8Array(img.bytes)], { type: img.mimeType })
    form.append('image[]', blob, `reference-${idx}.png`)
  })

  const res = await fetchImageProvider(`${baseUrl}/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal,
  })
  return parseOpenAIResponse(res, modelId, 'OpenAI')
}

async function parseOpenAIResponse(
  res: Response,
  modelId: string,
  providerLabel: string,
): Promise<ImageGenResult> {
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new ImageProviderHttpError(providerLabel, res.status, text)
  }
  const json = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>
  }
  if (!json.data || json.data.length === 0) {
    throw new Error('OpenAI image API returned no images')
  }
  const images: Buffer[] = []
  for (const item of json.data) {
    if (item.b64_json) {
      images.push(Buffer.from(item.b64_json, 'base64'))
    } else if (item.url) {
      const r = await fetchImageProvider(item.url)
      if (!r.ok) {
        const text = await r.text().catch(() => '')
        throw new ImageProviderHttpError('Generated image download', r.status, text)
      }
      images.push(Buffer.from(await r.arrayBuffer()))
    }
  }
  if (images.length === 0) {
    throw new Error('OpenAI image API returned data with no b64_json or url')
  }
  return { images, modelUsed: modelId }
}

// ── Google Gemini 2.5 Flash Image (Nano Banana) ──────────────────────────

async function generateGoogle(input: {
  apiKey: string
  baseUrl: string
  modelId: string
  request: ImageGenRequest
  signal?: AbortSignal
}): Promise<ImageGenResult> {
  const { apiKey, baseUrl, modelId, request, signal } = input
  // Build parts: text prompt + each reference image as inline_data.
  const parts: Array<
    | { text: string }
    | { inline_data: { mime_type: string; data: string } }
  > = [{ text: request.prompt }]
  for (const img of request.referenceImages) {
    parts.push({
      inline_data: {
        mime_type: img.mimeType,
        data: img.bytes.toString('base64'),
      },
    })
  }

  const url = `${baseUrl}/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`
  const res = await fetchImageProvider(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['IMAGE'],
      },
    }),
    signal,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new ImageProviderHttpError('Gemini', res.status, text)
  }
  const json = (await res.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inline_data?: { mime_type?: string; data?: string }
          inlineData?: { mimeType?: string; data?: string }
        }>
      }
    }>
  }
  const images: Buffer[] = []
  for (const candidate of json.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      // Some clients receive snake_case, others camelCase — accept both.
      const data = part.inline_data?.data ?? part.inlineData?.data
      if (data) images.push(Buffer.from(data, 'base64'))
    }
  }
  if (images.length === 0) {
    throw new Error('Gemini image API returned no image parts')
  }
  return { images, modelUsed: modelId }
}

// ── ByteDance Seedream 4.5 (Volcengine Ark, OpenAI-compat) ───────────────

async function generateByteDance(input: {
  apiKey: string
  baseUrl: string
  modelId: string
  request: ImageGenRequest
  signal?: AbortSignal
}): Promise<ImageGenResult> {
  const { apiKey, baseUrl, modelId, request, signal } = input
  const size = request.aspectRatio ? SEEDREAM_SIZE_MAP[request.aspectRatio] : '2048x2048'

  // Volcengine Ark accepts OpenAI-shaped images/generations, with an optional
  // `image` field carrying base64 references for image-to-image.
  const body: Record<string, unknown> = {
    model: modelId,
    prompt: request.prompt,
    size,
    n: 1,
    response_format: 'b64_json',
  }
  if (request.referenceImages.length > 0) {
    // Pass each reference as a data URL — Ark accepts both URL and base64
    // in the `image` field. We keep it as an array even for single ref so
    // multi-image composition works the same way.
    body.image = request.referenceImages.map(
      (img) => `data:${img.mimeType};base64,${img.bytes.toString('base64')}`,
    )
  }

  const res = await fetchImageProvider(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  })
  return parseOpenAIResponse(res, modelId, 'ByteDance') // Ark reuses the OpenAI shape
}
