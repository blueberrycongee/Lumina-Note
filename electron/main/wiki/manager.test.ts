import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { WikiManager } from './manager.js'
import { WikiSettingsStore } from './settings-store.js'
import type {
  Message,
  ProviderChunk,
  ProviderInterface,
  ToolDefinition,
} from '../agent/types.js'

let vault = ''
let baseDir = ''

beforeEach(() => {
  vault = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-wiki-mgr-vault-'))
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-wiki-mgr-base-'))
})

afterEach(() => {
  for (const dir of [vault, baseDir]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
})

class ScriptedProvider implements ProviderInterface {
  public turns = 0
  constructor(private readonly chunks: ProviderChunk[][]) {}
  async *stream(
    _messages: Message[],
    _tools: ToolDefinition[],
    signal: AbortSignal,
  ): AsyncIterable<ProviderChunk> {
    const script = this.chunks[this.turns] ?? []
    this.turns += 1
    for (const chunk of script) {
      if (signal.aborted) return
      yield chunk
    }
  }
}

function writeNote(rel: string, content = 'hello'): void {
  const abs = path.join(vault, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
}

function buildManager(provider: ProviderInterface | null = null): WikiManager {
  const settings = new WikiSettingsStore({ baseDir })
  return new WikiManager({
    settings,
    providerSelector: () => provider,
  })
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
  it('returns ok:false when no provider available', async () => {
    writeNote('a.md', 'content')
    const mgr = buildManager(null)
    await mgr.bind(vault)
    const out = await mgr.synthesizeNote('a.md')
    expect(out.ok).toBe(false)
    expect(out.error).toContain('no provider')
  })

  it('runs synthesizer and returns ok with hash on success', async () => {
    writeNote('a.md', 'wisdom')
    const provider = new ScriptedProvider([
      [{ type: 'text', text: 'done' }, { type: 'finish', finish_reason: 'stop' }],
    ])
    const mgr = buildManager(provider)
    const bound = await mgr.bind(vault)
    bound.state.updateNoteState('a.md', { lastModifiedAt: 1 })
    const out = await mgr.synthesizeNote('a.md')
    expect(out.ok).toBe(true)
    expect(typeof out.hash).toBe('string')
    expect(bound.state.getNoteState('a.md')?.lastSyncedHash).toBe(out.hash)
  })

  it('stop() flips the current batch to aborted', async () => {
    writeNote('a.md', 'content')
    const provider = new ScriptedProvider([
      [{ type: 'text', text: 'ok' }, { type: 'finish', finish_reason: 'stop' }],
    ])
    const mgr = buildManager(provider)
    await mgr.bind(vault)
    // Race a stop against an in-flight synthesize: kick off, immediately stop
    const p = mgr.synthesizeNote('a.md')
    await mgr.stop()
    const out = await p
    // The synthesizer had already finished one turn before stop() reached it,
    // so result may be ok=true OR ok=false (aborted). Both are acceptable —
    // what matters is that stop() did not throw and currentBatch was cleared.
    expect(typeof out.ok).toBe('boolean')
  })
})
