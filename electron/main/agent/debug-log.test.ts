import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DebugLog } from './debug-log.js'

let tmpDir = ''

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-debug-log-'))
})

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

async function waitForFlush(log: DebugLog): Promise<void> {
  // Write is async through a stream — yield once so append reaches disk in tests
  await new Promise((r) => setTimeout(r, 10))
  void log // keep ref
}

describe('DebugLog', () => {
  it('is disabled by default', () => {
    const log = new DebugLog({ baseDir: tmpDir })
    expect(log.isEnabled()).toBe(false)
    expect(log.getFilePath()).toBeNull()
  })

  it('enable() creates a file under baseDir/lumina-agent', async () => {
    const log = new DebugLog({ baseDir: tmpDir })
    const filePath = log.enable({ workspacePath: '/w' })
    expect(filePath).not.toBeNull()
    expect(filePath!).toContain(path.join('lumina-agent', 'session_'))
    expect(log.isEnabled()).toBe(true)
    // WriteStream opens fd lazily on first flush; wait briefly.
    await new Promise((r) => setTimeout(r, 20))
    expect(fs.existsSync(filePath!)).toBe(true)
  })

  it('log writes NDJSON lines with timestamp + kind + payload + session', async () => {
    const log = new DebugLog({ baseDir: tmpDir })
    const filePath = log.enable({ workspacePath: '/w' })!
    log.log('sample.event', { foo: 'bar' }, 'sess-1')
    log.log('another.event', { x: 1 })
    log.disable()
    await waitForFlush(log)
    const content = fs.readFileSync(filePath, 'utf8').trim()
    const lines = content.split('\n')
    // enable + disable entries bracket the two manual entries
    expect(lines.length).toBeGreaterThanOrEqual(3)
    const sample = lines.map((l) => JSON.parse(l))
    const sampleEntry = sample.find((e) => e.kind === 'sample.event')
    expect(sampleEntry).toBeTruthy()
    expect(sampleEntry.session).toBe('sess-1')
    expect(sampleEntry.payload).toEqual({ foo: 'bar' })
    expect(typeof sampleEntry.timestamp).toBe('number')
  })

  it('log() is a noop when disabled', () => {
    const log = new DebugLog({ baseDir: tmpDir })
    log.log('before.enable', { x: 1 })
    expect(log.getFilePath()).toBeNull()
  })

  it('disable() keeps getFilePath for UI to still reveal path', () => {
    const log = new DebugLog({ baseDir: tmpDir })
    const filePath = log.enable()
    log.disable()
    expect(log.isEnabled()).toBe(false)
    expect(log.getFilePath()).toBe(filePath)
  })

  it('enable() is idempotent (second call returns same path)', () => {
    const log = new DebugLog({ baseDir: tmpDir })
    const p1 = log.enable()
    const p2 = log.enable()
    expect(p2).toBe(p1)
  })

  it('respects custom subDir', () => {
    const log = new DebugLog({ baseDir: tmpDir, subDir: 'my-debug' })
    const filePath = log.enable()!
    expect(filePath).toContain(path.join(tmpDir, 'my-debug'))
  })
})
