import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { hashContent, WikiState } from './state.js'
import { WikiTrigger } from './trigger.js'

let vault = ''
let now = 0

beforeEach(() => {
  vault = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-wiki-trigger-'))
  now = 1_000_000
})

afterEach(() => {
  try {
    fs.rmSync(vault, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

function buildTrigger(opts: { quietMs?: number; excludeGlobs?: string[] } = {}) {
  const state = new WikiState(vault)
  const trigger = new WikiTrigger({
    vaultPath: vault,
    state,
    quietMs: opts.quietMs ?? 1000,
    scanIntervalMs: 0,
    excludeGlobs: opts.excludeGlobs,
    now: () => now,
  })
  return { state, trigger }
}

function writeNote(rel: string, content = 'hello'): string {
  const abs = path.join(vault, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
  return abs
}

describe('WikiTrigger.notifyChange', () => {
  it('records lastModifiedAt and emits note-changed', () => {
    const { state, trigger } = buildTrigger()
    const events: string[] = []
    trigger.on('note-changed', (r) => events.push(r))
    trigger.notifyChange('a.md')
    expect(state.getNoteState('a.md')?.lastModifiedAt).toBe(now)
    expect(events).toEqual(['a.md'])
  })

  it('ignores non-markdown files', () => {
    const { state, trigger } = buildTrigger()
    trigger.notifyChange('a.txt')
    expect(state.getNoteState('a.txt')).toBeUndefined()
  })

  it('ignores files inside excluded globs', () => {
    const { state, trigger } = buildTrigger()
    trigger.notifyChange('.lumina/x.md')
    trigger.notifyChange('wiki/index.md')
    trigger.notifyChange('node_modules/x.md')
    expect(state.getAllStates()).toEqual({})
  })

  it('respects custom excludeGlobs', () => {
    const { state, trigger } = buildTrigger({ excludeGlobs: ['private/**'] })
    trigger.notifyChange('private/secret.md')
    trigger.notifyChange('public/note.md')
    expect(Object.keys(state.getAllStates())).toEqual(['public/note.md'])
  })
})

describe('WikiTrigger.notifyRemove', () => {
  it('removes note from state', () => {
    const { state, trigger } = buildTrigger()
    trigger.notifyChange('a.md')
    trigger.notifyRemove('a.md')
    expect(state.getNoteState('a.md')).toBeUndefined()
  })
})

describe('WikiTrigger.runScan', () => {
  it('skips notes that have not satisfied quietMs yet', () => {
    const { trigger } = buildTrigger({ quietMs: 5000 })
    writeNote('a.md', 'content')
    trigger.notifyChange('a.md')
    now += 1000 // less than quietMs
    expect(trigger.runScan()).toEqual([])
  })

  it('returns notes whose change is past quietMs and not yet synced', () => {
    const { trigger } = buildTrigger({ quietMs: 1000 })
    writeNote('a.md', 'content')
    trigger.notifyChange('a.md')
    now += 5000
    const out = trigger.runScan()
    expect(out.map((c) => c.relPath)).toEqual(['a.md'])
    expect(out[0].absPath).toBe(path.join(vault, 'a.md'))
  })

  it('emits synthesize-needed once with full batch', () => {
    const { trigger } = buildTrigger({ quietMs: 1000 })
    writeNote('a.md')
    writeNote('sub/b.md')
    trigger.notifyChange('a.md')
    trigger.notifyChange('sub/b.md')
    now += 5000
    const batches: number[] = []
    trigger.on('synthesize-needed', (n) => batches.push(n.length))
    trigger.runScan()
    expect(batches).toEqual([2])
  })

  it('skips notes already synced with unchanged content', () => {
    const { state, trigger } = buildTrigger({ quietMs: 1000 })
    writeNote('a.md', 'stable')
    trigger.notifyChange('a.md')
    state.markSynced('a.md', now, hashContent('stable'))
    now += 5000
    expect(trigger.runScan()).toEqual([])
  })

  it('re-includes a note whose content changed since last sync', () => {
    const { state, trigger } = buildTrigger({ quietMs: 1000 })
    writeNote('a.md', 'v1')
    trigger.notifyChange('a.md')
    state.markSynced('a.md', now, hashContent('v1'))
    writeNote('a.md', 'v2')
    trigger.notifyChange('a.md')
    now += 5000
    expect(trigger.runScan().map((c) => c.relPath)).toEqual(['a.md'])
  })

  it('does not emit synthesize-needed when batch is empty', () => {
    const { trigger } = buildTrigger({ quietMs: 1000 })
    let count = 0
    trigger.on('synthesize-needed', () => (count += 1))
    trigger.runScan()
    expect(count).toBe(0)
  })
})
