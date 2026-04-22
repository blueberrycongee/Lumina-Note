// Phase 6.6 contract: vault_load_index and vault_run_lint must return shapes
// the renderer's useVaultStore + LintDashboard already expect, otherwise the
// existing Wiki/Lint UI crashes when reading .pages / .broken_links.length.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { dispatchAgentCommand } from '../agent/ipc-dispatch.js'
import { WikiManager } from './manager.js'
import { WikiSettingsStore } from './settings-store.js'

let vault = ''
let baseDir = ''

beforeEach(() => {
  vault = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-vault-ipc-vault-'))
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-vault-ipc-base-'))
})

afterEach(() => {
  for (const d of [vault, baseDir]) {
    try {
      fs.rmSync(d, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
})

function buildCtx() {
  const wikiSettings = new WikiSettingsStore({ baseDir })
  const wikiManager = new WikiManager({
    settings: wikiSettings,
    providerSelector: () => null,
  })
  return { wikiSettings, wikiManager }
}

describe('vault_load_index returns WikiIndex shape', () => {
  it('returns empty pages when wiki dir missing', async () => {
    const ctx = buildCtx()
    const out = (await dispatchAgentCommand(ctx, 'vault_load_index', {
      workspacePath: vault,
    })) as { pages: unknown[]; last_updated: number }
    expect(out.pages).toEqual([])
    expect(typeof out.last_updated).toBe('number')
  })

  it('lists wiki pages with frontmatter parsed', async () => {
    fs.mkdirSync(path.join(vault, 'wiki'), { recursive: true })
    fs.writeFileSync(
      path.join(vault, 'wiki', 'foo.md'),
      '---\ntitle: Foo\npage_type: concept\nsummary: bar baz\n---\nbody',
    )
    const ctx = buildCtx()
    const out = (await dispatchAgentCommand(ctx, 'vault_load_index', {
      workspacePath: vault,
    })) as { pages: Array<{ title: string; page_type: string }> }
    expect(out.pages).toHaveLength(1)
    expect(out.pages[0].title).toBe('Foo')
    expect(out.pages[0].page_type).toBe('concept')
  })

  it('returns empty index when workspacePath missing', async () => {
    const ctx = buildCtx()
    const out = (await dispatchAgentCommand(ctx, 'vault_load_index', {})) as {
      pages: unknown[]
    }
    expect(out.pages).toEqual([])
  })
})

describe('vault_run_lint returns LintReport shape', () => {
  it('returns the keys LintDashboard reads', async () => {
    const ctx = buildCtx()
    const out = (await dispatchAgentCommand(ctx, 'vault_run_lint', {
      workspacePath: vault,
    })) as Record<string, unknown>
    expect(Object.keys(out).sort()).toEqual(
      ['broken_links', 'checked_pages', 'orphaned_pages', 'overall_health', 'stale_pages'].sort(),
    )
    expect(Array.isArray(out.broken_links)).toBe(true)
    expect(Array.isArray(out.orphaned_pages)).toBe(true)
    expect(Array.isArray(out.stale_pages)).toBe(true)
    expect(typeof out.checked_pages).toBe('number')
    expect(typeof out.overall_health).toBe('number')
  })
})

describe('vault_initialize wires manager.bind/start', () => {
  it('binds wiki manager to the workspace path', async () => {
    const ctx = buildCtx()
    await dispatchAgentCommand(ctx, 'vault_initialize', { workspacePath: vault })
    expect(ctx.wikiManager.getBound()?.vaultPath).toBe(vault)
  })

  it('returns null even without wikiManager configured', async () => {
    const ctx = {}
    expect(
      await dispatchAgentCommand(ctx, 'vault_initialize', { workspacePath: vault }),
    ).toBeNull()
  })
})
