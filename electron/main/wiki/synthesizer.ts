/**
 * WikiSynthesizer — 把单份 note 合并进 vault/wiki/。
 *
 * 工作方式:
 *   - 起一个独立的 AgentRuntime + 独立 ToolRegistry,只注册 fs_read/fs_write/
 *     fs_list/fs_grep/fs_stat,把 allowedRoots 限死在 vaultPath。
 *     **不注册 shell**:wiki 合成不能跑命令。
 *   - 用 AutoApprovalGate,FS 工具自动放行(跑在后台,无 UI 介入)。
 *   - 喂一个 system prompt 让 agent:阅读源 note → 浏览 wiki/ → 决定哪个 wiki
 *     文件应该被更新或新建 → 用 fs_write 写。
 *   - 跑完后读源文件内容算 sha256,markSynced 到 WikiState。
 *
 * 失败(provider 错/agent error/abort)抛错不写 WikiState,下次扫描会重试。
 */

import fs from 'node:fs/promises'
import path from 'node:path'

import { AgentEventBus } from '../agent/event-bus.js'
import { AutoApprovalGate } from '../agent/approval-gate.js'
import { AgentRuntime } from '../agent/runtime.js'
import { ToolRegistry } from '../agent/tool-registry.js'
import { registerFsTools } from '../agent/tools/fs.js'
import type { ProviderInterface, TaskContext } from '../agent/types.js'

import { hashContent, WikiState } from './state.js'

export interface WikiSynthesizerOptions {
  vaultPath: string
  state: WikiState
  /** 注入 provider — 生产从 main bootstrap 选,测试用 mock */
  provider: ProviderInterface
  /** 单次合成最多让 agent 跑几轮,默认 8 */
  maxTurns?: number
  /** 注入时钟便于测试 */
  now?: () => number
}

export interface SynthesizeResult {
  ok: boolean
  /** 跑完后该 note 的内容 hash(成功路径)*/
  hash?: string
  /** session id 便于调试 / 关联日志 */
  sessionId?: string
  error?: string
}

const SYSTEM_PROMPT = `You are the Lumina Wiki Synthesizer. Your job: keep vault/wiki/ in sync with the user's source notes.

You will be told the path of one source note that just changed. Steps you should follow:
  1. Use fs_read to read the source note. Distill the key claims, definitions, and links worth surfacing in the wiki.
  2. Use fs_list and fs_grep on vault/wiki/ to discover existing wiki entries. Prefer extending an existing entry over creating a new one.
  3. Use fs_write to update or create wiki/*.md files. Each wiki file should:
     - Have a short YAML frontmatter with title, source_paths (the relative paths of the source notes contributing), updated_at (ISO timestamp).
     - Cite source notes inline with [[wiki link]] style references back to the original notes.
     - Stay concise — the wiki is a synthesis layer, not a copy of the note.
  4. When you are done, respond with a one-paragraph summary of what you changed. Do not call more tools after that.

Constraints:
  - Only read/write inside the vault. Never try to run shell commands; that tool is not registered for you.
  - Do not delete user notes. You may delete obsolete wiki entries you previously created if the source has been removed.
  - If the source note is empty or trivially short, write a brief stub instead of fabricating content.`

export class WikiSynthesizer {
  private readonly opts: Required<Omit<WikiSynthesizerOptions, 'maxTurns' | 'now'>> & {
    maxTurns: number
    now: () => number
  }

  constructor(options: WikiSynthesizerOptions) {
    this.opts = {
      vaultPath: options.vaultPath,
      state: options.state,
      provider: options.provider,
      maxTurns: options.maxTurns ?? 8,
      now: options.now ?? (() => Date.now()),
    }
  }

  /** 合成一份 note。返回成功/失败 + 内容 hash */
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

    const eventBus = new SilentEventBus()
    const toolRegistry = new ToolRegistry()
    registerFsTools(toolRegistry, { allowedRoots: [this.opts.vaultPath] })
    const runtime = new AgentRuntime({
      eventBus,
      provider: this.opts.provider,
      toolRegistry,
      approvalGate: new AutoApprovalGate(),
      maxTurns: this.opts.maxTurns,
      systemPrompt: SYSTEM_PROMPT,
    })

    const taskMessage = buildTaskMessage(this.opts.vaultPath, relPath, sourceContent)
    const context: TaskContext = {
      workspace_path: this.opts.vaultPath,
      active_note_path: absPath,
    }

    let sessionId: string
    try {
      sessionId = await runtime.start(taskMessage, context)
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }

    const finishReason = eventBus.lastFinishReason
    if (finishReason !== 'done') {
      return {
        ok: false,
        sessionId,
        error: eventBus.lastErrorMessage ?? `agent finished with reason=${finishReason}`,
      }
    }

    // 重新读源文件做最终 hash(agent 跑期间用户可能又改了,以最终内容为准)
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

function buildTaskMessage(vault: string, relPath: string, content: string): string {
  const truncated =
    content.length > 8_000 ? content.slice(0, 8_000) + '\n…(truncated)' : content
  return [
    `The user just updated the note at \`${relPath}\` (vault root: ${vault}).`,
    '',
    'Source content:',
    '```markdown',
    truncated,
    '```',
    '',
    'Please synthesize it into vault/wiki/ following your system instructions.',
  ].join('\n')
}

/**
 * Wiki synthesizer 在后台跑,不需要把事件推给前端 — 用 silent bus 收尾原因即可。
 * 对外保留 emit 但只记录 finish/error,不真发事件。
 */
class SilentEventBus extends AgentEventBus {
  public lastFinishReason: string | null = null
  public lastErrorMessage: string | null = null

  constructor() {
    super(() => null)
  }

  emit(event: { type: string; reason?: string; error?: string; message?: string }): void {
    if (event.type === 'finish' && typeof event.reason === 'string') {
      this.lastFinishReason = event.reason
      if (event.message) this.lastErrorMessage = event.message
    } else if (event.type === 'error' && typeof event.error === 'string') {
      this.lastErrorMessage = event.error
    }
  }
}
