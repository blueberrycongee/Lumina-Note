import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createWebDAVHandlers,
  type ClientFactory,
  type WebDAVConfig,
} from './webdav.js'

let baseDir = ''
let configPath = ''

beforeEach(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-webdav-'))
  configPath = path.join(baseDir, 'config.json')
})

afterEach(() => {
  try {
    fs.rmSync(baseDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

interface StubClient {
  exists: ReturnType<typeof vi.fn>
  getDirectoryContents: ReturnType<typeof vi.fn>
  getFileContents: ReturnType<typeof vi.fn>
  putFileContents: ReturnType<typeof vi.fn>
  createDirectory: ReturnType<typeof vi.fn>
  deleteFile: ReturnType<typeof vi.fn>
}

function buildStub(): StubClient {
  return {
    exists: vi.fn().mockResolvedValue(true),
    getDirectoryContents: vi.fn().mockResolvedValue([]),
    getFileContents: vi.fn().mockResolvedValue(Buffer.from('hi')),
    putFileContents: vi.fn().mockResolvedValue(undefined),
    createDirectory: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
  }
}

function buildHandlers(stub: StubClient = buildStub()) {
  const factory: ClientFactory = () => stub as never
  const handlers = createWebDAVHandlers({ configPath, clientFactory: factory })
  return { handlers, stub }
}

const baseConfig: WebDAVConfig = {
  server_url: 'https://dav.example/',
  username: 'u',
  password: 'p',
  remote_base_path: '/notes',
  auto_sync: false,
  sync_interval_secs: 300,
}

describe('webdav_set_config / webdav_get_config', () => {
  it('persists set + reloads via get', async () => {
    const { handlers } = buildHandlers()
    await handlers.webdav_set_config({ config: baseConfig })
    const out = (await handlers.webdav_get_config({})) as WebDAVConfig
    expect(out.server_url).toBe(baseConfig.server_url)
    expect(out.remote_base_path).toBe('/notes')

    // Reload from disk via a fresh handlers instance
    const fresh = createWebDAVHandlers({ configPath, clientFactory: () => buildStub() as never })
    const reread = (await fresh.webdav_get_config({})) as WebDAVConfig
    expect(reread.username).toBe('u')
  })
})

describe('webdav_test_connection', () => {
  it('returns true when exists() resolves', async () => {
    const { handlers, stub } = buildHandlers()
    const ok = await handlers.webdav_test_connection({ config: baseConfig })
    expect(ok).toBe(true)
    expect(stub.exists).toHaveBeenCalledWith('/notes')
  })

  it('returns false when client throws', async () => {
    const stub = buildStub()
    stub.exists.mockRejectedValueOnce(new Error('401'))
    const { handlers } = buildHandlers(stub)
    const ok = await handlers.webdav_test_connection({ config: baseConfig })
    expect(ok).toBe(false)
  })
})

describe('webdav_upload', () => {
  it('writes content under remote_base_path and pre-creates parents', async () => {
    const { handlers, stub } = buildHandlers()
    await handlers.webdav_set_config({ config: baseConfig })
    await handlers.webdav_upload({ remotePath: 'sub/page.md', content: 'hello' })
    expect(stub.createDirectory).toHaveBeenCalledWith('/notes/sub', {
      recursive: true,
    })
    expect(stub.putFileContents).toHaveBeenCalledWith(
      '/notes/sub/page.md',
      'hello',
      { overwrite: true },
    )
  })

  it('still uploads when parent createDirectory throws (best effort)', async () => {
    const stub = buildStub()
    stub.createDirectory.mockRejectedValueOnce(new Error('405'))
    const { handlers } = buildHandlers(stub)
    await handlers.webdav_set_config({ config: baseConfig })
    await handlers.webdav_upload({ remotePath: 'a.md', content: 'x' })
    expect(stub.putFileContents).toHaveBeenCalled()
  })
})

describe('webdav_create_dir', () => {
  it('treats 405/already-exists as success', async () => {
    const stub = buildStub()
    stub.createDirectory.mockRejectedValueOnce(new Error('405 Method Not Allowed'))
    const { handlers } = buildHandlers(stub)
    await handlers.webdav_set_config({ config: baseConfig })
    await expect(
      handlers.webdav_create_dir({ remotePath: 'sub' }),
    ).resolves.toBeNull()
  })

  it('rethrows other errors', async () => {
    const stub = buildStub()
    stub.createDirectory.mockRejectedValueOnce(new Error('500 boom'))
    const { handlers } = buildHandlers(stub)
    await handlers.webdav_set_config({ config: baseConfig })
    await expect(
      handlers.webdav_create_dir({ remotePath: 'sub' }),
    ).rejects.toThrow(/500/)
  })
})

describe('webdav_delete', () => {
  it('routes to client.deleteFile with joined remote path', async () => {
    const { handlers, stub } = buildHandlers()
    await handlers.webdav_set_config({ config: baseConfig })
    await handlers.webdav_delete({ remotePath: 'old.md' })
    expect(stub.deleteFile).toHaveBeenCalledWith('/notes/old.md')
  })
})

describe('webdav_list_remote / webdav_list_all_remote', () => {
  it('maps webdav FileStat into RemoteEntry shape', async () => {
    const stub = buildStub()
    stub.getDirectoryContents.mockResolvedValueOnce([
      {
        filename: '/notes/a.md',
        type: 'file',
        size: 11,
        lastmod: 'Mon, 01 Jan 2024 00:00:00 GMT',
        etag: '"abc"',
        mime: 'text/markdown',
      },
    ])
    const { handlers } = buildHandlers(stub)
    await handlers.webdav_set_config({ config: baseConfig })
    const out = (await handlers.webdav_list_remote({})) as Array<{
      path: string
      is_dir: boolean
      size: number
      etag: string | null
    }>
    expect(out).toHaveLength(1)
    expect(out[0].path).toBe('/notes/a.md')
    expect(out[0].is_dir).toBe(false)
    expect(out[0].size).toBe(11)
    expect(out[0].etag).toBe('"abc"')
  })
})

describe('webdav_download', () => {
  it('returns utf-8 string', async () => {
    const stub = buildStub()
    stub.getFileContents.mockResolvedValueOnce(Buffer.from('payload', 'utf-8'))
    const { handlers } = buildHandlers(stub)
    await handlers.webdav_set_config({ config: baseConfig })
    const out = await handlers.webdav_download({ remotePath: 'p.md' })
    expect(out).toBe('payload')
  })
})

describe('webdav_scan_local', () => {
  it('skips .git / node_modules / dotfiles', async () => {
    const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-scan-'))
    try {
      fs.writeFileSync(path.join(vault, 'a.md'), 'x')
      fs.mkdirSync(path.join(vault, '.git'))
      fs.writeFileSync(path.join(vault, '.git', 'HEAD'), '')
      fs.mkdirSync(path.join(vault, 'sub'))
      fs.writeFileSync(path.join(vault, 'sub', 'b.md'), 'y')
      const { handlers } = buildHandlers()
      const out = (await handlers.webdav_scan_local({ vaultPath: vault })) as Array<{
        relative_path: string
        is_dir: boolean
      }>
      const files = out.filter((e) => !e.is_dir).map((e) => e.relative_path).sort()
      expect(files).toEqual(['a.md', path.join('sub', 'b.md')])
    } finally {
      fs.rmSync(vault, { recursive: true, force: true })
    }
  })
})

describe('sync stubs', () => {
  it('returns empty plan / success result', async () => {
    const { handlers } = buildHandlers()
    expect(await handlers.webdav_compute_sync_plan({})).toMatchObject({
      items: [],
      upload_count: 0,
    })
    expect(await handlers.webdav_quick_sync({})).toMatchObject({
      success: true,
      uploaded: 0,
    })
  })
})
