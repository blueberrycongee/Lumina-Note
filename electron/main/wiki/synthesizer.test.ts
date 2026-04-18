import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { hashContent, WikiState } from './state.js'
import { WikiSynthesizer } from './synthesizer.js'
import type {
  Message,
  ProviderChunk,
  ProviderInterface,
  ToolDefinition,
} from '../agent/types.js'

let vault = ''

beforeEach(() => {
  vault = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-wiki-syn-'))
})

afterEach(() => {
  try {
    fs.rmSync(vault, { recursive: true, force: true })
  } catch {
    // ignore
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

function writeNote(rel: string, content: string): void {
  const abs = path.join(vault, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
}

describe('WikiSynthesizer', () => {
  it('runs the agent loop, lets it write wiki/, and marks note synced', async () => {
    writeNote('thoughts.md', 'I think recursive zettelkasten is underrated.')
    const wikiPath = path.join(vault, 'wiki', 'zettelkasten.md')

    // Two turns: turn 1 calls fs_write to create wiki entry, turn 2 produces final text.
    const provider = new ScriptedProvider([
      [
        {
          type: 'tool_call',
          tool_call: {
            id: 'tc1',
            name: 'fs_write',
            input: {
              path: wikiPath,
              content: '---\ntitle: Zettelkasten\n---\nFolded from thoughts.md.\n',
            },
          },
        },
        { type: 'finish', finish_reason: 'tool_use' },
      ],
      [
        { type: 'text', text: 'Created wiki/zettelkasten.md.' },
        { type: 'finish', finish_reason: 'stop' },
      ],
    ])

    const state = new WikiState(vault)
    state.updateNoteState('thoughts.md', { lastModifiedAt: 1 })
    const syn = new WikiSynthesizer({
      vaultPath: vault,
      state,
      provider,
      now: () => 999,
    })

    const result = await syn.synthesizeNote('thoughts.md')
    expect(result.ok).toBe(true)
    expect(result.hash).toBe(
      hashContent('I think recursive zettelkasten is underrated.'),
    )
    expect(state.getNoteState('thoughts.md')?.lastSyncedAt).toBe(999)
    expect(state.getNoteState('thoughts.md')?.lastSyncedHash).toBe(result.hash)
    expect(fs.existsSync(wikiPath)).toBe(true)
    expect(fs.readFileSync(wikiPath, 'utf-8').toLowerCase()).toContain('zettelkasten')
  })

  it('does not register shell tool — agent cannot exec commands', async () => {
    writeNote('a.md', 'irrelevant')
    let toolDefsSeenByAgent: ToolDefinition[] = []
    const provider: ProviderInterface = {
      async *stream(_messages, tools, _signal) {
        toolDefsSeenByAgent = tools
        yield { type: 'text', text: 'done' }
        yield { type: 'finish', finish_reason: 'stop' }
      },
    }
    const state = new WikiState(vault)
    state.updateNoteState('a.md', { lastModifiedAt: 1 })
    const syn = new WikiSynthesizer({ vaultPath: vault, state, provider })
    await syn.synthesizeNote('a.md')
    const names = toolDefsSeenByAgent.map((t) => t.name)
    expect(names).not.toContain('shell')
    expect(names).toEqual(
      expect.arrayContaining(['fs_read', 'fs_write', 'fs_list', 'fs_grep', 'fs_stat']),
    )
  })

  it('returns error if source note missing', async () => {
    const state = new WikiState(vault)
    const provider: ProviderInterface = {
      async *stream() {},
    }
    const syn = new WikiSynthesizer({ vaultPath: vault, state, provider })
    const result = await syn.synthesizeNote('does-not-exist.md')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('failed to read source note')
  })

  it('returns error and skips markSynced when agent finishes with error', async () => {
    writeNote('a.md', 'hi')
    const provider = new ScriptedProvider([
      [{ type: 'error', error: 'boom from provider' }],
    ])
    const state = new WikiState(vault)
    state.updateNoteState('a.md', { lastModifiedAt: 1 })
    const syn = new WikiSynthesizer({ vaultPath: vault, state, provider })
    const result = await syn.synthesizeNote('a.md')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('boom from provider')
    expect(state.getNoteState('a.md')?.lastSyncedAt).toBeUndefined()
  })

  it('FS tool allowedRoots locks writes inside vault', async () => {
    writeNote('src.md', 'content')
    const outsideTarget = path.join(os.tmpdir(), 'definitely-outside-vault.md')
    let toolError: string | undefined
    const provider = new ScriptedProvider([
      [
        {
          type: 'tool_call',
          tool_call: {
            id: 'tc1',
            name: 'fs_write',
            input: { path: outsideTarget, content: 'pwn' },
          },
        },
        { type: 'finish', finish_reason: 'tool_use' },
      ],
      [
        { type: 'text', text: 'tried to escape' },
        { type: 'finish', finish_reason: 'stop' },
      ],
    ])
    const state = new WikiState(vault)
    state.updateNoteState('src.md', { lastModifiedAt: 1 })
    const syn = new WikiSynthesizer({ vaultPath: vault, state, provider })
    const result = await syn.synthesizeNote('src.md')
    // The tool error becomes a tool_result with is_error=true; the agent
    // happens to finish ok in turn 2, but the outside file must not exist.
    expect(fs.existsSync(outsideTarget)).toBe(false)
    expect(result.ok).toBe(true) // overall agent finished, just the tool call failed
    void toolError
  })
})
