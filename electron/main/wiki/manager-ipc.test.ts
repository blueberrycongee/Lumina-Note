// Phase 6.5 IPC: wiki_bind / wiki_rebuild / wiki_synthesize_note / wiki_stop
// round-trip through dispatchAgentCommand.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AgentEventBus } from '../agent/event-bus.js'
import { dispatchAgentCommand } from '../agent/ipc-dispatch.js'
import { AgentRuntime } from '../agent/runtime.js'
import { WikiManager } from './manager.js'
import { WikiSettingsStore } from './settings-store.js'
import type { AgentEvent } from '../agent/types.js'

class SilentBus extends AgentEventBus {
  public events: AgentEvent[] = []
  constructor() {
    super(() => null)
  }
  emit(e: AgentEvent): void {
    this.events.push(e)
  }
}

let vault = ''
let baseDir = ''

beforeEach(() => {
  vault = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-wiki-mipc-vault-'))
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-wiki-mipc-base-'))
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

function buildCtx() {
  const runtime = new AgentRuntime({ eventBus: new SilentBus() })
  const wikiSettings = new WikiSettingsStore({ baseDir })
  const wikiManager = new WikiManager({
    settings: wikiSettings,
    providerSelector: () => null,
  })
  return { runtime, wikiSettings, wikiManager }
}

describe('wiki_bind / wiki_rebuild / wiki_synthesize_note / wiki_stop dispatch', () => {
  it('wiki_bind sets the current vault', async () => {
    const ctx = buildCtx()
    const out = await dispatchAgentCommand(ctx, 'wiki_bind', { vault_path: vault })
    expect(out).toBeNull()
    expect(ctx.wikiManager.getBound()?.vaultPath).toBe(vault)
  })

  it('wiki_bind throws when vault_path missing', async () => {
    const ctx = buildCtx()
    await expect(dispatchAgentCommand(ctx, 'wiki_bind', {})).rejects.toThrow(
      /missing vault_path/,
    )
  })

  it('wiki_rebuild marks every md note as dirty', async () => {
    fs.writeFileSync(path.join(vault, 'a.md'), 'a')
    fs.writeFileSync(path.join(vault, 'b.md'), 'b')
    const ctx = buildCtx()
    await dispatchAgentCommand(ctx, 'wiki_bind', { vault_path: vault })
    const out = (await dispatchAgentCommand(ctx, 'wiki_rebuild', {})) as {
      ok: boolean
      marked: number
    }
    expect(out.ok).toBe(true)
    expect(out.marked).toBe(2)
  })

  it('wiki_synthesize_note returns ok:false when no provider configured', async () => {
    fs.writeFileSync(path.join(vault, 'a.md'), 'a')
    const ctx = buildCtx()
    await dispatchAgentCommand(ctx, 'wiki_bind', { vault_path: vault })
    const out = (await dispatchAgentCommand(ctx, 'wiki_synthesize_note', {
      rel_path: 'a.md',
    })) as { ok: boolean; error?: string }
    expect(out.ok).toBe(false)
    expect(out.error).toContain('provider')
  })

  it('wiki_synthesize_note rejects missing rel_path', async () => {
    const ctx = buildCtx()
    await dispatchAgentCommand(ctx, 'wiki_bind', { vault_path: vault })
    const out = (await dispatchAgentCommand(ctx, 'wiki_synthesize_note', {})) as {
      ok: boolean
      error?: string
    }
    expect(out.ok).toBe(false)
    expect(out.error).toContain('rel_path')
  })

  it('wiki_stop returns null without throwing even if nothing is running', async () => {
    const ctx = buildCtx()
    expect(await dispatchAgentCommand(ctx, 'wiki_stop', {})).toBeNull()
  })

  it('returns ok:false when wikiManager not provided', async () => {
    const ctx = { runtime: new AgentRuntime({ eventBus: new SilentBus() }) }
    const rb = (await dispatchAgentCommand(ctx, 'wiki_rebuild', {})) as {
      ok: boolean
      error?: string
    }
    expect(rb.ok).toBe(false)
  })
})
