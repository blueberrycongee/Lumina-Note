/**
 * WikiManager — 把 WikiState / WikiTrigger / WikiSynthesizer / WikiSettingsStore
 * 串成一个对外接口,供 IPC 命令(wiki_rebuild / wiki_synthesize_note / wiki_stop)
 * 调用。
 *
 * 职责:
 *   - bind(vaultPath): 切换当前 vault 时重建 trigger + state(原 trigger 清掉)
 *   - rebuild(): 把 vault 下所有 .md 标记为脏(清掉 lastSyncedAt),trigger 下次扫
 *     描全部命中
 *   - synthesizeNote(relPath): 立刻跑一次 synthesizer,跳过 quietMs/cooldown
 *   - stop(): 中止当前 batch(若有)+ 暂停 trigger
 *
 * 内部维护一个 currentBatchAbort 让 stop 能打断长时间的 synthesizer。
 */

import fs from 'node:fs/promises'
import path from 'node:path'

import type { ProviderInterface } from '../agent/types.js'
import type { WikiSettingsStore } from './settings-store.js'
import { WikiState } from './state.js'
import { WikiSynthesizer, type SynthesizeResult } from './synthesizer.js'
import { WikiTrigger } from './trigger.js'

export interface WikiManagerOptions {
  /**
   * 解析当前可用的 provider — 每次 synthesize 前调一次,允许用户在 Settings 里
   * 切换 provider 后立即生效。返回 null 时 synthesizer 会失败但不会崩。
   */
  providerSelector: () => Promise<ProviderInterface | null> | ProviderInterface | null
  /** 用户配置 store */
  settings: WikiSettingsStore
  /** 注入时钟便于测试 */
  now?: () => number
}

export interface BoundWiki {
  vaultPath: string
  state: WikiState
  trigger: WikiTrigger
  synthesizer: WikiSynthesizer
}

export class WikiManager {
  private readonly opts: Required<Pick<WikiManagerOptions, 'settings' | 'now' | 'providerSelector'>>
  private bound: BoundWiki | null = null
  private currentBatch: { aborted: boolean } | null = null

  constructor(options: WikiManagerOptions) {
    this.opts = {
      providerSelector: options.providerSelector,
      settings: options.settings,
      now: options.now ?? (() => Date.now()),
    }
  }

  /** 绑定到 vault。重复 bind 同一 vault 是 no-op;切换 vault 会清掉旧的 trigger */
  async bind(vaultPath: string): Promise<BoundWiki> {
    if (this.bound && this.bound.vaultPath === vaultPath) return this.bound
    if (this.bound) {
      await this.bound.trigger.stop().catch(() => undefined)
    }
    const settings = this.opts.settings.get()
    const state = new WikiState(vaultPath)
    const trigger = new WikiTrigger({
      vaultPath,
      state,
      quietMs: settings.quietMs,
      scanIntervalMs: settings.scanIntervalMs,
      excludeGlobs: settings.excludeGlobs,
      now: this.opts.now,
    })
    this.bound = {
      vaultPath,
      state,
      trigger,
      // synthesizer is rebuilt per-call so it picks the latest provider
      synthesizer: noopSynthesizer(vaultPath, state),
    }
    return this.bound
  }

  getBound(): BoundWiki | null {
    return this.bound
  }

  /** 启动 trigger(只在 settings.enabled 才真正监听) */
  async start(): Promise<void> {
    const bound = this.requireBound()
    if (!this.opts.settings.get().enabled) return
    await bound.trigger.start()
  }

  async stop(): Promise<void> {
    if (this.bound) await this.bound.trigger.stop().catch(() => undefined)
    if (this.currentBatch) this.currentBatch.aborted = true
  }

  /**
   * Rebuild:把 vault 下所有 .md 笔记重置 lastSyncedAt = undefined,
   * 这样下一次 trigger 扫描会全部判为 needsSync。返回标记的数量。
   */
  async rebuild(): Promise<number> {
    const bound = this.requireBound()
    const all = await listAllMarkdown(bound.vaultPath)
    const now = this.opts.now()
    for (const rel of all) {
      bound.state.updateNoteState(rel, {
        lastModifiedAt: now,
        lastSyncedAt: undefined,
        lastSyncedHash: undefined,
      })
    }
    return all.length
  }

  /**
   * 立刻跑一次 synthesizer,绕过 quietMs / cooldown。失败时返回 ok:false。
   * stop() 之后再调依然会跑一个新 batch,abort 只影响"当前正在跑的那一批"。
   */
  async synthesizeNote(relPath: string): Promise<SynthesizeResult> {
    const bound = this.requireBound()
    const provider = await this.opts.providerSelector()
    if (!provider) {
      return { ok: false, error: 'no provider configured for wiki synthesizer' }
    }
    const synthesizer = new WikiSynthesizer({
      vaultPath: bound.vaultPath,
      state: bound.state,
      provider,
      now: this.opts.now,
    })
    const batch = { aborted: false }
    this.currentBatch = batch
    try {
      const result = await synthesizer.synthesizeNote(relPath)
      if (batch.aborted) {
        return { ok: false, error: 'aborted by stop()' }
      }
      return result
    } finally {
      if (this.currentBatch === batch) this.currentBatch = null
    }
  }

  /** Settings 变了:rebuild trigger 用新参数。enabled 变化也在这里处理 */
  async refreshSettingsBindings(): Promise<void> {
    if (!this.bound) return
    const vault = this.bound.vaultPath
    await this.bound.trigger.stop().catch(() => undefined)
    this.bound = null
    await this.bind(vault)
    await this.start()
  }

  private requireBound(): BoundWiki {
    if (!this.bound) {
      throw new Error('WikiManager not bound to a vault')
    }
    return this.bound
  }
}

/**
 * Placeholder synthesizer used as the BoundWiki.synthesizer field — real
 * synthesis builds a fresh WikiSynthesizer per call so it picks up the
 * latest provider via providerSelector. This stub never runs in normal flow.
 */
function noopSynthesizer(vaultPath: string, state: WikiState): WikiSynthesizer {
  return new WikiSynthesizer({
    vaultPath,
    state,
    provider: noProviderStub(),
  })
}

async function listAllMarkdown(vaultPath: string): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string, relRoot: string): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const name = entry.name
      if (
        name === '.lumina' ||
        name === '.git' ||
        name === '.skills' ||
        name === 'node_modules' ||
        name === 'wiki'
      ) {
        continue
      }
      if (name.startsWith('.')) continue
      const abs = path.join(dir, name)
      const rel = relRoot ? `${relRoot}/${name}` : name
      if (entry.isDirectory()) {
        await walk(abs, rel)
      } else if (entry.isFile() && name.toLowerCase().endsWith('.md')) {
        out.push(rel)
      }
    }
  }
  await walk(vaultPath, '')
  return out
}

/** Stub provider — only reached if someone forgot to wire a real one in */
function noProviderStub(): ProviderInterface {
  return {
    // eslint-disable-next-line require-yield
    async *stream() {
      throw new Error('WikiManager has no provider configured')
    },
  }
}
