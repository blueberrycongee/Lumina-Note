/**
 * WikiSynthesizer — synthesize a single source note into vault/wiki/.
 *
 * Post-migration this runs through the in-process opencode HTTP server,
 * not the legacy Lumina AgentRuntime. The agent picks up the bundled
 * `wiki-sync` SKILL.md (shipped at out/main/skills/wiki-sync/SKILL.md
 * — see electron/main/agent-v2/builtin-skills/wiki-sync/) which carries
 * all the synthesis instructions; we just create a one-shot session,
 * send a "synthesize <relPath>" message, and wait for completion.
 *
 * Failure (server error, agent error, abort) does NOT mark the note synced
 * in WikiState — the next scan will retry.
 */

import fs from 'node:fs/promises'
import path from 'node:path'

import { hashContent, WikiState } from './state.js'

export type OpencodeServerInfo = {
  url: string
  username: string
  password: string
}

export interface WikiSynthesizerOptions {
  vaultPath: string
  state: WikiState
  /**
   * Returns the current opencode server credentials. Returns null when
   * the embedded server isn't ready yet — synthesizeNote() will report
   * that as a soft failure (no markSynced) so the trigger retries later.
   */
  serverInfoResolver: () =>
    | OpencodeServerInfo
    | null
    | Promise<OpencodeServerInfo | null>
  /** Hard ceiling on how long to wait for the agent run to finish. Default 5min. */
  timeoutMs?: number
  /** Injected clock for tests. */
  now?: () => number
}

export interface SynthesizeResult {
  ok: boolean
  /** Hash of the note's content after the synthesizer ran (success path). */
  hash?: string
  /** opencode session id, useful for log correlation. */
  sessionId?: string
  error?: string
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

export class WikiSynthesizer {
  private readonly opts: WikiSynthesizerOptions & {
    timeoutMs: number
    now: () => number
  }

  constructor(options: WikiSynthesizerOptions) {
    this.opts = {
      ...options,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      now: options.now ?? (() => Date.now()),
    }
  }

  async synthesizeNote(relPath: string): Promise<SynthesizeResult> {
    const absPath = path.join(this.opts.vaultPath, relPath)
    let sourceContent: string
    try {
      sourceContent = await fs.readFile(absPath, 'utf-8')
    } catch (err) {
      return {
        ok: false,
        error: `failed to read source note: ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    const info = await this.opts.serverInfoResolver()
    if (!info) {
      return { ok: false, error: 'opencode server not ready' }
    }

    let sessionId: string | undefined
    try {
      sessionId = await createSession(info, this.opts.vaultPath)
      const taskMessage = buildTaskMessage(this.opts.vaultPath, relPath, sourceContent)
      await runPrompt(info, sessionId, taskMessage, this.opts.timeoutMs)
    } catch (err) {
      return {
        ok: false,
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      }
    }

    // Re-read source file in case the user modified it during the run;
    // hash whatever is on disk now so the next scan compares against the
    // "as committed" content.
    let finalContent: string
    try {
      finalContent = await fs.readFile(absPath, 'utf-8')
    } catch {
      finalContent = sourceContent
    }
    const hash = hashContent(finalContent)
    this.opts.state.markSynced(relPath, this.opts.now(), hash)
    return { ok: true, hash, sessionId }
  }
}

function authHeader(info: OpencodeServerInfo): string {
  return (
    'Basic ' +
    Buffer.from(`${info.username}:${info.password}`).toString('base64')
  )
}

async function createSession(
  info: OpencodeServerInfo,
  vaultPath: string,
): Promise<string> {
  const url = `${info.url.replace(/\/$/, '')}/session?directory=${encodeURIComponent(vaultPath)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: authHeader(info),
      'Content-Type': 'application/json',
      'x-opencode-directory': vaultPath,
    },
    body: '{}',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`opencode session.create ${res.status}: ${text.slice(0, 200)}`)
  }
  const json = (await res.json()) as { id?: string }
  if (!json.id) throw new Error('opencode session.create returned no id')
  return json.id
}

async function runPrompt(
  info: OpencodeServerInfo,
  sessionId: string,
  text: string,
  timeoutMs: number,
): Promise<void> {
  // Use the synchronous /session/{id}/message endpoint (SDK calls this
  // session.prompt) — it blocks until the agent run completes. Faster
  // and simpler than promptAsync + SSE polling for a one-shot job.
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(
      `${info.url.replace(/\/$/, '')}/session/${encodeURIComponent(sessionId)}/message`,
      {
        method: 'POST',
        headers: {
          authorization: authHeader(info),
          'Content-Type': 'application/json',
          'x-opencode-directory': '',
        },
        body: JSON.stringify({
          agent: 'wiki-sync',
          parts: [{ type: 'text', text }],
        }),
        signal: ctrl.signal,
      },
    )
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`session.prompt ${res.status}: ${body.slice(0, 300)}`)
    }
  } finally {
    clearTimeout(timer)
  }
}

function buildTaskMessage(vault: string, relPath: string, content: string): string {
  const truncated =
    content.length > 8_000 ? content.slice(0, 8_000) + '\n…(truncated)' : content
  return [
    `Vault root: ${vault}`,
    `Source note path (relative to vault): ${relPath}`,
    '',
    'Use the **wiki-sync** skill to synthesize this note into the vault\'s `wiki/` folder.',
    '',
    '<source_content>',
    truncated,
    '</source_content>',
  ].join('\n')
}
