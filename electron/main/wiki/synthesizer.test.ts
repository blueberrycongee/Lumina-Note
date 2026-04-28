import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { hashContent, WikiState } from './state.js'
import { WikiSynthesizer, type OpencodeServerInfo } from './synthesizer.js'

let vault = ''
const FAKE_INFO: OpencodeServerInfo = {
  url: 'http://127.0.0.1:65535',
  username: 'opencode',
  password: 'test-pw',
}

beforeEach(() => {
  vault = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-wiki-syn-'))
})

afterEach(() => {
  vi.unstubAllGlobals()
  try {
    fs.rmSync(vault, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

function writeNote(rel: string, content: string): void {
  const abs = path.join(vault, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
}

interface FetchCall {
  url: string
  init?: RequestInit
}

function stubFetch(handlers: {
  createSessionResponse?: () => Response
  promptResponse?: () => Response
}): { calls: FetchCall[] } {
  const calls: FetchCall[] = []
  const stub = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
    calls.push({ url: u, init })
    if (u.includes('/session/') && u.includes('/message')) {
      return (
        handlers.promptResponse?.() ??
        new Response('{}', { status: 200 })
      )
    }
    if (u.includes('/session')) {
      return (
        handlers.createSessionResponse?.() ??
        new Response(JSON.stringify({ id: 'sess_test' }), { status: 200 })
      )
    }
    return new Response('not found', { status: 404 })
  })
  vi.stubGlobal('fetch', stub)
  return { calls }
}

describe('WikiSynthesizer (opencode-backed)', () => {
  it('creates session, sends prompt, marks note synced on success', async () => {
    writeNote('thoughts.md', 'Recursive zettelkasten is underrated.')
    const state = new WikiState(vault)
    state.updateNoteState('thoughts.md', { lastModifiedAt: 1 })
    const { calls } = stubFetch({})

    const syn = new WikiSynthesizer({
      vaultPath: vault,
      state,
      serverInfoResolver: () => FAKE_INFO,
      now: () => 999,
    })

    const result = await syn.synthesizeNote('thoughts.md')
    expect(result.ok).toBe(true)
    expect(result.hash).toBe(hashContent('Recursive zettelkasten is underrated.'))
    expect(result.sessionId).toBe('sess_test')
    expect(state.getNoteState('thoughts.md')?.lastSyncedAt).toBe(999)
    expect(state.getNoteState('thoughts.md')?.lastSyncedHash).toBe(result.hash)

    // Two HTTP calls expected: session.create + session.prompt.
    expect(calls).toHaveLength(2)
    expect(calls[0].url).toContain('/session?directory=')
    expect(calls[1].url).toContain('/session/sess_test/message')
    const body = JSON.parse(String(calls[1].init?.body))
    expect(body.agent).toBe('wiki-sync')
    expect(body.parts).toHaveLength(1)
    expect(body.parts[0].text).toContain('thoughts.md')
    expect(body.parts[0].text).toContain('wiki-sync')
  })

  it('returns soft failure when opencode server is not ready', async () => {
    writeNote('a.md', 'x')
    const state = new WikiState(vault)
    const syn = new WikiSynthesizer({
      vaultPath: vault,
      state,
      serverInfoResolver: () => null,
    })
    const result = await syn.synthesizeNote('a.md')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('not ready')
    // Did not mark synced.
    expect(state.getNoteState('a.md')?.lastSyncedAt).toBeUndefined()
  })

  it('returns error when source note is missing', async () => {
    const state = new WikiState(vault)
    const syn = new WikiSynthesizer({
      vaultPath: vault,
      state,
      serverInfoResolver: () => FAKE_INFO,
    })
    const result = await syn.synthesizeNote('does-not-exist.md')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('failed to read source note')
  })

  it('returns error when session.create fails (does not mark synced)', async () => {
    writeNote('a.md', 'x')
    const state = new WikiState(vault)
    state.updateNoteState('a.md', { lastModifiedAt: 1 })
    stubFetch({
      createSessionResponse: () =>
        new Response('{"error": "auth"}', { status: 401 }),
    })

    const syn = new WikiSynthesizer({
      vaultPath: vault,
      state,
      serverInfoResolver: () => FAKE_INFO,
    })
    const result = await syn.synthesizeNote('a.md')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('401')
    expect(state.getNoteState('a.md')?.lastSyncedAt).toBeUndefined()
  })

  it('returns error when session.prompt fails (does not mark synced)', async () => {
    writeNote('a.md', 'x')
    const state = new WikiState(vault)
    state.updateNoteState('a.md', { lastModifiedAt: 1 })
    stubFetch({
      promptResponse: () => new Response('{"error":"upstream 5xx"}', { status: 502 }),
    })

    const syn = new WikiSynthesizer({
      vaultPath: vault,
      state,
      serverInfoResolver: () => FAKE_INFO,
    })
    const result = await syn.synthesizeNote('a.md')
    expect(result.ok).toBe(false)
    expect(result.sessionId).toBe('sess_test')
    expect(result.error).toContain('502')
    expect(state.getNoteState('a.md')?.lastSyncedAt).toBeUndefined()
  })
})
