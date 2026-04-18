import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDiagnosticsHandlers } from './diagnostics.js'

let root = ''
let logsDir = ''
let outputPath = ''

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-diag-'))
  logsDir = path.join(root, 'debug-logs')
  outputPath = path.join(root, 'out', 'diag.log')
  fs.mkdirSync(logsDir, { recursive: true })
})

afterEach(() => {
  try {
    fs.rmSync(root, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

function build(opts: { maxBytesPerFile?: number } = {}) {
  return createDiagnosticsHandlers({
    getAppInfo: () => ({ version: '1.2.3', logsDir }),
    now: () => new Date('2026-04-18T00:00:00.000Z'),
    maxBytesPerFile: opts.maxBytesPerFile,
  })
}

describe('export_diagnostics', () => {
  it('writes header + "no debug logs" when directory is empty', async () => {
    const handlers = build()
    await handlers.export_diagnostics({ destination: outputPath })
    const content = fs.readFileSync(outputPath, 'utf-8')
    expect(content).toContain('Lumina Diagnostics')
    expect(content).toContain('version: 1.2.3')
    expect(content).toContain('timestamp: 2026-04-18T00:00:00.000Z')
    expect(content).toContain('(no debug logs found)')
  })

  it('includes each log file under the "=====" header', async () => {
    fs.writeFileSync(path.join(logsDir, 'b.log'), 'beta content\n')
    fs.writeFileSync(path.join(logsDir, 'a.log'), 'alpha content\n')
    const handlers = build()
    await handlers.export_diagnostics({ destination: outputPath })
    const content = fs.readFileSync(outputPath, 'utf-8')
    // Files appear in sorted order (a before b)
    const aIdx = content.indexOf('a.log')
    const bIdx = content.indexOf('b.log')
    expect(aIdx).toBeGreaterThan(-1)
    expect(bIdx).toBeGreaterThan(aIdx)
    expect(content).toContain('alpha content')
    expect(content).toContain('beta content')
  })

  it('tails files larger than maxBytesPerFile', async () => {
    const big = path.join(logsDir, 'big.log')
    const prefix = 'A'.repeat(1000)
    const suffix = 'TAIL_MARKER_123'
    fs.writeFileSync(big, prefix + suffix)
    const handlers = build({ maxBytesPerFile: suffix.length })
    await handlers.export_diagnostics({ destination: outputPath })
    const content = fs.readFileSync(outputPath, 'utf-8')
    expect(content).toContain('[... truncated ...]')
    expect(content).toContain('TAIL_MARKER_123')
    // The "A" prefix should have been dropped by the tail truncation
    expect(content.includes('AAAAAAAAAA')).toBe(false)
  })

  it('throws when destination is missing', async () => {
    const handlers = build()
    await expect(handlers.export_diagnostics({})).rejects.toThrow(/destination/)
  })

  it('creates missing parent directories', async () => {
    const nested = path.join(root, 'a', 'b', 'c', 'diag.log')
    const handlers = build()
    await handlers.export_diagnostics({ destination: nested })
    expect(fs.existsSync(nested)).toBe(true)
  })
})
