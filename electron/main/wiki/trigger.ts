/**
 * WikiTrigger — 监听 vault 下的 *.md 文件,挑出"需要被合成进 wiki"的 note 集合。
 *
 * 工作流:
 *   - chokidar 在 start() 后 watch vault,排除 .lumina / .git / node_modules / .skills
 *   - 文件 add/change → state.updateNoteState(relPath, { lastModifiedAt: now })
 *     unlink → state.removeNote(relPath)
 *   - setInterval(scanIntervalMs) 跑 runScan():
 *       对所有 state.notes 中,如果 (now - lastModifiedAt) >= quietMs 且
 *       state.needsSync(relPath, abs) → 加入 candidates
 *     如果有 candidates,emit('synthesize-needed', candidates)
 *
 * 设计要点:
 *   - notifyChange(relPath, mtime?) / runScan() 是公开 API,测试用它们绕过
 *     chokidar/setInterval(后者在 jsdom 下不稳)。生产里 start() 把这两条接到
 *     真实事件源。
 *   - 排除 wiki/ 下的产物本身(否则 synthesizer 写出 *.md 会触发自身,死循环)。
 */

import path from 'node:path'
import { EventEmitter } from 'node:events'

import { WikiState } from './state.js'

export interface WikiTriggerOptions {
  vaultPath: string
  state: WikiState
  /** 改动后多久内不动作就视为"稳定",可触发同步,默认 30 秒 */
  quietMs?: number
  /** 定时扫描间隔,默认 5 分钟 */
  scanIntervalMs?: number
  /** 额外排除 glob(相对 vaultPath),wiki/ + 默认 ignore 自动加入 */
  excludeGlobs?: string[]
  /** 注入时钟便于测试 */
  now?: () => number
}

const DEFAULT_QUIET_MS = 30_000
const DEFAULT_SCAN_INTERVAL_MS = 5 * 60_000

const DEFAULT_EXCLUDES = [
  '.lumina/**',
  '.git/**',
  '.skills/**',
  'node_modules/**',
  'wiki/**', // synthesizer 的产物,排除以免触发自身
]

export type WikiTriggerEvents = {
  'synthesize-needed': [notes: { relPath: string; absPath: string }[]]
  'note-changed': [relPath: string]
  'note-removed': [relPath: string]
}

export class WikiTrigger extends EventEmitter {
  private readonly opts: Required<
    Pick<WikiTriggerOptions, 'vaultPath' | 'state' | 'quietMs' | 'scanIntervalMs' | 'now'>
  > & {
    excludeGlobs: string[]
  }
  private watcher: { close: () => Promise<void> | void } | null = null
  private scanTimer: ReturnType<typeof setInterval> | null = null

  constructor(options: WikiTriggerOptions) {
    super()
    this.opts = {
      vaultPath: options.vaultPath,
      state: options.state,
      quietMs: options.quietMs ?? DEFAULT_QUIET_MS,
      scanIntervalMs: options.scanIntervalMs ?? DEFAULT_SCAN_INTERVAL_MS,
      now: options.now ?? (() => Date.now()),
      excludeGlobs: [...DEFAULT_EXCLUDES, ...(options.excludeGlobs ?? [])],
    }
  }

  /**
   * 启动 chokidar + 定时扫描。在测试里通常不调用,改用 notifyChange + runScan。
   */
  async start(): Promise<void> {
    if (this.watcher) return
    const chokidar = await import('chokidar')
    const watcher = chokidar.default.watch(this.opts.vaultPath, {
      ignored: (filePath, stats) => {
        if (!stats) return false
        const rel = path.relative(this.opts.vaultPath, filePath)
        if (rel.startsWith('..')) return true
        return this.matchesExclude(rel)
      },
      ignoreInitial: true,
      persistent: true,
    })
    watcher.on('add', (file) => this.onFsChange(file))
    watcher.on('change', (file) => this.onFsChange(file))
    watcher.on('unlink', (file) => this.onFsRemove(file))
    this.watcher = watcher

    if (this.opts.scanIntervalMs > 0) {
      this.scanTimer = setInterval(() => this.runScan(), this.opts.scanIntervalMs)
    }
  }

  async stop(): Promise<void> {
    if (this.scanTimer) {
      clearInterval(this.scanTimer)
      this.scanTimer = null
    }
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }
  }

  /** 公开给测试 / 手动触发的入口 */
  notifyChange(relPath: string, mtimeMs?: number): void {
    if (!this.isMarkdown(relPath) || this.matchesExclude(relPath)) return
    const at = mtimeMs ?? this.opts.now()
    this.opts.state.updateNoteState(relPath, { lastModifiedAt: at })
    this.emit('note-changed', relPath)
  }

  notifyRemove(relPath: string): void {
    if (!this.isMarkdown(relPath) || this.matchesExclude(relPath)) return
    this.opts.state.removeNote(relPath)
    this.emit('note-removed', relPath)
  }

  /** 跑一次扫描,返回这次挑出的候选集合(也会通过 emit 通知) */
  runScan(): { relPath: string; absPath: string }[] {
    const now = this.opts.now()
    const all = this.opts.state.getAllStates()
    const candidates: { relPath: string; absPath: string }[] = []
    for (const [relPath, st] of Object.entries(all)) {
      if (this.matchesExclude(relPath)) continue
      const sinceChange = now - st.lastModifiedAt
      if (sinceChange < this.opts.quietMs) continue
      const abs = path.join(this.opts.vaultPath, relPath)
      if (!this.opts.state.needsSync(relPath, abs)) continue
      candidates.push({ relPath, absPath: abs })
    }
    if (candidates.length > 0) {
      this.emit('synthesize-needed', candidates)
    }
    return candidates
  }

  private onFsChange(absPath: string): void {
    const rel = path.relative(this.opts.vaultPath, absPath)
    if (!this.isMarkdown(rel) || this.matchesExclude(rel)) return
    this.notifyChange(rel)
  }

  private onFsRemove(absPath: string): void {
    const rel = path.relative(this.opts.vaultPath, absPath)
    this.notifyRemove(rel)
  }

  private isMarkdown(rel: string): boolean {
    return rel.toLowerCase().endsWith('.md')
  }

  private matchesExclude(rel: string): boolean {
    const norm = rel.replace(/\\/g, '/')
    for (const pattern of this.opts.excludeGlobs) {
      if (matchesGlob(norm, pattern)) return true
    }
    return false
  }
}

/**
 * 极简 glob: 支持 `**`、`*`、`?`。够覆盖排除规则,不引入额外依赖。
 */
function matchesGlob(input: string, glob: string): boolean {
  const re =
    '^' +
    glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '@@DBLSTAR@@')
      .replace(/\*/g, '[^/]*')
      .replace(/@@DBLSTAR@@/g, '.*')
      .replace(/\?/g, '.') +
    '$'
  return new RegExp(re).test(input)
}
