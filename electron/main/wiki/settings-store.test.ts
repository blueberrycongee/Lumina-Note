import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_WIKI_SETTINGS,
  WikiSettingsStore,
} from './settings-store.js'

let baseDir = ''

beforeEach(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-wiki-set-'))
})

afterEach(() => {
  try {
    fs.rmSync(baseDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

describe('WikiSettingsStore', () => {
  it('returns defaults when file missing', () => {
    const store = new WikiSettingsStore({ baseDir })
    expect(store.get()).toEqual(DEFAULT_WIKI_SETTINGS)
  })

  it('persists patches via set()', () => {
    const store = new WikiSettingsStore({ baseDir })
    store.set({ enabled: true, quietMs: 1000 })
    const file = path.join(baseDir, 'lumina-wiki-settings.json')
    const persisted = JSON.parse(fs.readFileSync(file, 'utf-8'))
    expect(persisted.enabled).toBe(true)
    expect(persisted.quietMs).toBe(1000)
  })

  it('reload reflects external file change', () => {
    const a = new WikiSettingsStore({ baseDir })
    a.set({ enabled: true })
    const b = new WikiSettingsStore({ baseDir })
    expect(b.get().enabled).toBe(true)
  })

  it('reset() clears file and returns defaults', () => {
    const store = new WikiSettingsStore({ baseDir })
    store.set({ enabled: true })
    expect(store.reset()).toEqual(DEFAULT_WIKI_SETTINGS)
    const file = path.join(baseDir, 'lumina-wiki-settings.json')
    expect(fs.existsSync(file)).toBe(false)
  })

  it('drops invalid types and falls back to defaults', () => {
    const store = new WikiSettingsStore({ baseDir })
    const merged = store.set({
      // @ts-expect-error -- intentional bad type
      enabled: 'yes',
      quietMs: -5,
      excludeGlobs: ['ok', 1, '', 'also-ok'] as unknown as string[],
    })
    expect(merged.enabled).toBe(DEFAULT_WIKI_SETTINGS.enabled)
    expect(merged.quietMs).toBe(DEFAULT_WIKI_SETTINGS.quietMs)
    expect(merged.excludeGlobs).toEqual(['ok', 'also-ok'])
  })

  it('returns immutable snapshots (mutating return does not change store)', () => {
    const store = new WikiSettingsStore({ baseDir })
    store.set({ excludeGlobs: ['a'] })
    const snap = store.get()
    snap.excludeGlobs.push('b')
    expect(store.get().excludeGlobs).toEqual(['a'])
  })

  it('survives malformed JSON by returning defaults', () => {
    fs.writeFileSync(
      path.join(baseDir, 'lumina-wiki-settings.json'),
      '{not json',
    )
    const store = new WikiSettingsStore({ baseDir })
    expect(store.get()).toEqual(DEFAULT_WIKI_SETTINGS)
  })
})
