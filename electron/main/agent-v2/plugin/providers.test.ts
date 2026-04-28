import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  fetchImageProvider,
  isRetryableImageResponseStatus,
} from './providers.js'

describe('image provider retry policy', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retries transient HTTP failures', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('busy', { status: 500 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))

    const res = await fetchImageProvider('https://example.test/images', {}, {
      retryDelaysMs: [0],
    })

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry auth or request errors', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))

    const res = await fetchImageProvider('https://example.test/images', {}, {
      retryDelaysMs: [0],
    })

    expect(res.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries network-level fetch failures', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))

    const res = await fetchImageProvider('https://example.test/images', {}, {
      retryDelaysMs: [0],
    })

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('classifies only transient statuses as retryable', () => {
    expect(isRetryableImageResponseStatus(408)).toBe(true)
    expect(isRetryableImageResponseStatus(429)).toBe(true)
    expect(isRetryableImageResponseStatus(500)).toBe(true)
    expect(isRetryableImageResponseStatus(400)).toBe(false)
    expect(isRetryableImageResponseStatus(401)).toBe(false)
  })
})
