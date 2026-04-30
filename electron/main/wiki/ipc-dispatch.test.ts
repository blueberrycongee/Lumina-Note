// Phase 6.4 IPC integration: wiki_get_settings / wiki_set_settings /
// wiki_reset_settings round-trip through dispatchAgentCommand.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { dispatchAgentCommand, isAgentCommand } from '../agent-v2/ipc-dispatch.js'
import { DEFAULT_WIKI_SETTINGS, WikiSettingsStore } from './settings-store.js'

let baseDir = ''
beforeEach(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-wiki-ipc-'))
})
afterEach(() => {
  try {
    fs.rmSync(baseDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

function buildCtx() {
  const wikiSettings = new WikiSettingsStore({ baseDir })
  return { wikiSettings }
}

describe('isAgentCommand routes wiki_*', () => {
  it('accepts wiki_ prefix', () => {
    expect(isAgentCommand('wiki_get_settings')).toBe(true)
    expect(isAgentCommand('wiki_set_settings')).toBe(true)
    expect(isAgentCommand('wiki_reset_settings')).toBe(true)
    expect(isAgentCommand('wiki_anything_else')).toBe(true)
  })
})

describe('wiki_* dispatch', () => {
  it('wiki_get_settings returns defaults', async () => {
    const ctx = buildCtx()
    const out = await dispatchAgentCommand(ctx, 'wiki_get_settings', {})
    expect(out).toEqual(DEFAULT_WIKI_SETTINGS)
  })

  it('wiki_set_settings persists patch and returns merged', async () => {
    const ctx = buildCtx()
    const merged = (await dispatchAgentCommand(ctx, 'wiki_set_settings', {
      settings: { enabled: true, quietMs: 1500 },
    })) as { enabled: boolean; quietMs: number }
    expect(merged.enabled).toBe(true)
    expect(merged.quietMs).toBe(1500)

    const fresh = new WikiSettingsStore({ baseDir })
    expect(fresh.get().enabled).toBe(true)
    expect(fresh.get().quietMs).toBe(1500)
  })

  it('wiki_reset_settings wipes saved file', async () => {
    const ctx = buildCtx()
    await dispatchAgentCommand(ctx, 'wiki_set_settings', {
      settings: { enabled: true },
    })
    const reset = await dispatchAgentCommand(ctx, 'wiki_reset_settings', {})
    expect(reset).toEqual(DEFAULT_WIKI_SETTINGS)
  })

  it('returns null when wikiSettings is not provided in ctx', async () => {
    const ctx = {}
    expect(await dispatchAgentCommand(ctx, 'wiki_get_settings', {})).toBeNull()
    expect(
      await dispatchAgentCommand(ctx, 'wiki_set_settings', { settings: {} }),
    ).toBeNull()
  })
})
