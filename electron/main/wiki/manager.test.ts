import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WikiManager } from './manager.js'
import { WikiSettingsStore } from './settings-store.js'
import type { OpencodeServerInfo } from './synthesizer.js'

let vault = ''
let baseDir = ''

const FAKE_INFO: OpencodeServerInfo = {
  url: 'http://127.0.0.1:65535',
  username: 'opencode',
  password: 'test-pw',
}

beforeEach(() => {
  vault = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-wiki-mgr-vault-'))
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-wiki-mgr-base-'))
})

afterEach(() => {
  vi.unstubAllGlobals()
  for (const dir of [vault, baseDir]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
})

function writeNote(rel: string, content = 'hello'): void {
  const abs = path.join(vault, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
}

function buildManager(
  serverInfo: OpencodeServerInfo | null = null,
): WikiManager {
  const settings = new WikiSettingsStore({ baseDir })
  return new WikiManager({
    settings,
    serverInfoResolver: () => serverInfo,
  })
}

function stubFetchOk(): void {
  const stub = vi.fn(async (url: string | URL | Request) => {
    const u =
      typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
    if (u.includes('/session/') && u.includes('/message')) {
      return new Response('{}', { status: 200 })
    }
    return new Response(JSON.stringify({ id: 'sess_test' }), { status: 200 })
  })
  vi.stubGlobal('fetch', stub)
}

describe('WikiManager.bind / start / stop', () => {
  it('bind returns the bound vault and reuses on same path', async () => {
    const mgr = buildManager()
    const a = await mgr.bind(vault)
    const b = await mgr.bind(vault)
    expect(a).toBe(b)
    expect(a.vaultPath).toBe(vault)
  })

  it('start does nothing when settings.enabled = false (default)', async () => {
    const mgr = buildManager()
    await mgr.bind(vault)
    await mgr.start()
    // no exception is the assertion
  })

  it('throws if any operation runs before bind', async () => {
    const mgr = buildManager()
    await expect(mgr.rebuild()).rejects.toThrow(/not bound/)
  })
})

describe('WikiManager.rebuild', () => {
  it('marks every .md note (excluding wiki/, .lumina/, etc.) as dirty', async () => {
    writeNote('a.md')
    writeNote('sub/b.md')
    writeNote('wiki/should-skip.md')
    writeNote('.lumina/skip.md')
    writeNote('node_modules/skip.md')
    writeNote('not-md.txt')
    const mgr = buildManager()
    const bound = await mgr.bind(vault)
    const count = await mgr.rebuild()
    expect(count).toBe(2)
    const states = bound.state.getAllStates()
    expect(Object.keys(states).sort()).toEqual(['a.md', 'sub/b.md'])
    for (const key of Object.keys(states)) {
      expect(states[key].lastSyncedAt).toBeUndefined()
      expect(states[key].lastSyncedHash).toBeUndefined()
    }
  })
})

describe('WikiManager.synthesizeNote', () => {
  it('returns ok:false when opencode server is not ready', async () => {
    writeNote('a.md', 'content')
    const mgr = buildManager(null)
    await mgr.bind(vault)
    const out = await mgr.synthesizeNote('a.md')
    expect(out.ok).toBe(false)
    expect(out.error).toContain('not ready')
  })

  it('runs synthesizer and returns ok with hash on success', async () => {
    writeNote('a.md', 'wisdom')
    stubFetchOk()
    const mgr = buildManager(FAKE_INFO)
    const bound = await mgr.bind(vault)
    bound.state.updateNoteState('a.md', { lastModifiedAt: 1 })
    const out = await mgr.synthesizeNote('a.md')
    expect(out.ok).toBe(true)
    expect(typeof out.hash).toBe('string')
    expect(bound.state.getNoteState('a.md')?.lastSyncedHash).toBe(out.hash)
  })

  it('stop() does not throw mid-flight', async () => {
    writeNote('a.md', 'content')
    stubFetchOk()
    const mgr = buildManager(FAKE_INFO)
    await mgr.bind(vault)
    const p = mgr.synthesizeNote('a.md')
    await mgr.stop()
    const out = await p
    expect(typeof out.ok).toBe('boolean')
  })
})
