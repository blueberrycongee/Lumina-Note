import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { hashContent, WikiState } from './state.js'

let vault = ''

beforeEach(() => {
  vault = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-wiki-state-'))
})

afterEach(() => {
  try {
    fs.rmSync(vault, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

describe('WikiState', () => {
  it('returns empty state for fresh vault', () => {
    const state = new WikiState(vault)
    expect(state.getAllStates()).toEqual({})
    expect(state.getNoteState('a.md')).toBeUndefined()
  })

  it('updateNoteState persists to disk', () => {
    const state = new WikiState(vault)
    state.updateNoteState('a.md', { lastModifiedAt: 100 })
    const file = path.join(vault, '.lumina', 'wiki-state.json')
    const persisted = JSON.parse(fs.readFileSync(file, 'utf-8'))
    expect(persisted.notes['a.md'].lastModifiedAt).toBe(100)
  })

  it('reload reads back persisted state', () => {
    const a = new WikiState(vault)
    a.updateNoteState('a.md', { lastModifiedAt: 100 })
    a.markSynced('a.md', 200, 'abc')

    const b = new WikiState(vault)
    expect(b.getNoteState('a.md')).toEqual({
      lastModifiedAt: 100,
      lastSyncedAt: 200,
      lastSyncedHash: 'abc',
    })
  })

  it('markSynced no-ops for unknown note', () => {
    const state = new WikiState(vault)
    state.markSynced('missing.md', 1, 'h')
    expect(state.getNoteState('missing.md')).toBeUndefined()
  })

  it('removeNote drops the entry', () => {
    const state = new WikiState(vault)
    state.updateNoteState('a.md', { lastModifiedAt: 1 })
    state.removeNote('a.md')
    expect(state.getNoteState('a.md')).toBeUndefined()
  })

  it('needsSync = true when never synced', () => {
    const note = path.join(vault, 'note.md')
    fs.writeFileSync(note, 'hello')
    const state = new WikiState(vault)
    state.updateNoteState('note.md', { lastModifiedAt: 1 })
    expect(state.needsSync('note.md', note)).toBe(true)
  })

  it('needsSync = false when content hash unchanged', () => {
    const note = path.join(vault, 'note.md')
    fs.writeFileSync(note, 'hello')
    const state = new WikiState(vault)
    state.updateNoteState('note.md', { lastModifiedAt: 1 })
    state.markSynced('note.md', 2, hashContent('hello'))
    expect(state.needsSync('note.md', note)).toBe(false)
  })

  it('needsSync = true when content changed since last sync', () => {
    const note = path.join(vault, 'note.md')
    fs.writeFileSync(note, 'hello')
    const state = new WikiState(vault)
    state.updateNoteState('note.md', { lastModifiedAt: 1 })
    state.markSynced('note.md', 2, hashContent('hello'))
    fs.writeFileSync(note, 'goodbye')
    expect(state.needsSync('note.md', note)).toBe(true)
  })

  it('needsSync = false when file vanished (avoid thrashing)', () => {
    const state = new WikiState(vault)
    state.updateNoteState('gone.md', { lastModifiedAt: 1 })
    state.markSynced('gone.md', 2, 'xx')
    expect(state.needsSync('gone.md', path.join(vault, 'gone.md'))).toBe(false)
  })

  it('survives malformed json by resetting to empty', () => {
    fs.mkdirSync(path.join(vault, '.lumina'), { recursive: true })
    fs.writeFileSync(path.join(vault, '.lumina', 'wiki-state.json'), '{not json')
    const state = new WikiState(vault)
    expect(state.getAllStates()).toEqual({})
    state.updateNoteState('a.md', { lastModifiedAt: 1 })
    // After save it should be valid JSON now
    const file = JSON.parse(
      fs.readFileSync(path.join(vault, '.lumina', 'wiki-state.json'), 'utf-8'),
    )
    expect(file.notes['a.md'].lastModifiedAt).toBe(1)
  })

  it('hashContent is stable for the same input', () => {
    expect(hashContent('hello')).toBe(hashContent('hello'))
    expect(hashContent('hello')).not.toBe(hashContent('hi'))
  })
})
