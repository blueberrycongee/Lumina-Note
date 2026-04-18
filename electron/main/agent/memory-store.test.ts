import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MemoryStore } from './memory-store.js'

let tmpVault = ''

beforeEach(() => {
  tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-memory-'))
})

afterEach(() => {
  try {
    fs.rmSync(tmpVault, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

async function waitForFlush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 20))
}

describe('MemoryStore', () => {
  it('creates vault/.lumina/sessions/<id>.jsonl on startSession', async () => {
    const store = new MemoryStore()
    const handle = store.startSession('s1', tmpVault)
    expect(handle).not.toBeNull()
    expect(handle!.filePath).toBe(
      path.join(tmpVault, '.lumina', 'sessions', 's1.jsonl'),
    )
    expect(handle!.summaryPath).toBe(
      path.join(tmpVault, '.lumina', 'sessions', 's1.summary.md'),
    )
    await waitForFlush()
    expect(fs.existsSync(handle!.filePath)).toBe(true)
  })

  it('appendTurn writes NDJSON lines with timestamp + kind + payload', async () => {
    const store = new MemoryStore()
    const handle = store.startSession('s2', tmpVault)!
    store.appendTurn({ kind: 'assistant.turn', payload: { text: 'hi' } })
    store.appendTurn({ kind: 'tool.results', payload: [{ id: 't1' }] })
    store.endSession()
    await waitForFlush()
    const content = fs.readFileSync(handle.filePath, 'utf8').trim()
    const lines = content.split('\n').map((l) => JSON.parse(l))
    const kinds = lines.map((e) => e.kind)
    expect(kinds).toContain('session.start')
    expect(kinds).toContain('assistant.turn')
    expect(kinds).toContain('tool.results')
    expect(kinds).toContain('session.end')
    for (const entry of lines) {
      expect(typeof entry.timestamp).toBe('number')
    }
  })

  it('endSession without active returns null', () => {
    const store = new MemoryStore()
    expect(store.endSession()).toBeNull()
  })

  it('re-calling startSession ends the previous one', async () => {
    const store = new MemoryStore()
    const h1 = store.startSession('s_old', tmpVault)!
    const h2 = store.startSession('s_new', tmpVault)!
    expect(h2.sessionId).toBe('s_new')
    expect(store.getActive()?.sessionId).toBe('s_new')
    // old file should have a session.end entry
    await waitForFlush()
    const oldContent = fs.readFileSync(h1.filePath, 'utf8').trim()
    const lines = oldContent.split('\n').map((l) => JSON.parse(l))
    expect(lines.some((e) => e.kind === 'session.end')).toBe(true)
    store.endSession()
  })

  it('appendTurn is a noop without active session', () => {
    const store = new MemoryStore()
    store.appendTurn({ kind: 'x', payload: {} })
    expect(store.getActive()).toBeNull()
  })

  it('startSession rejects empty workspacePath', () => {
    const store = new MemoryStore()
    expect(store.startSession('s', '')).toBeNull()
    expect(store.startSession('', tmpVault)).toBeNull()
  })

  it('writeSummary option creates summary.md stub', async () => {
    const store = new MemoryStore()
    const handle = store.startSession('s3', tmpVault)!
    store.endSession({ writeSummary: true })
    await waitForFlush()
    expect(fs.existsSync(handle.summaryPath)).toBe(true)
    const summary = fs.readFileSync(handle.summaryPath, 'utf8')
    expect(summary).toContain('summary pending')
  })
})
