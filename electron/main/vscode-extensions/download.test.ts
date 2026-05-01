import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  downloadVsixToCache,
  type BinaryFetchLike,
} from './download.js'
import type { VscodeExtensionRemoteVersion } from './sources.js'

let tmpDir = ''

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-vsix-download-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const remote: VscodeExtensionRemoteVersion = {
  extensionId: 'openai.chatgpt',
  source: 'open-vsx',
  version: '6.1.0',
  downloadUrl: 'https://example.com/openai.chatgpt-6.1.0.vsix',
  itemUrl: 'https://example.com/item',
}

describe('downloadVsixToCache', () => {
  it('downloads a VSIX atomically and records sha256', async () => {
    const bytes = Buffer.from('fake-vsix')
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      async arrayBuffer() {
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      },
    })) satisfies BinaryFetchLike

    const result = await downloadVsixToCache(remote, {
      cacheDir: tmpDir,
      fetch: fetcher,
    })

    expect(fetcher).toHaveBeenCalledWith(remote.downloadUrl)
    expect(result.filePath).toBe(path.join(tmpDir, 'openai.chatgpt-6.1.0.vsix'))
    expect(result.byteLength).toBe(bytes.length)
    expect(result.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(fs.readFileSync(result.filePath)).toEqual(bytes)
    expect(fs.readdirSync(tmpDir).some((name) => name.endsWith('.tmp'))).toBe(false)
  })

  it('fails closed on HTTP errors', async () => {
    await expect(
      downloadVsixToCache(remote, {
        cacheDir: tmpDir,
        fetch: vi.fn(async () => ({
          ok: false,
          status: 503,
          async arrayBuffer() {
            return new ArrayBuffer(0)
          },
        })) satisfies BinaryFetchLike,
      }),
    ).rejects.toThrow(/HTTP 503/)
  })

  it('rejects empty downloads', async () => {
    await expect(
      downloadVsixToCache(remote, {
        cacheDir: tmpDir,
        fetch: vi.fn(async () => ({
          ok: true,
          status: 200,
          async arrayBuffer() {
            return new ArrayBuffer(0)
          },
        })) satisfies BinaryFetchLike,
      }),
    ).rejects.toThrow(/was empty/)
  })
})
