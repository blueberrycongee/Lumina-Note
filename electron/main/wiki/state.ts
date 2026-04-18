/**
 * WikiState — 跟踪每份 vault note 与 wiki 的同步状态。
 *
 * 持久化在 vault/.lumina/wiki-state.json:
 *   { notes: { "<relPath>": { lastModifiedAt, lastSyncedAt?, lastSyncedHash? } } }
 *
 * Phase 6.2 的 trigger 用 lastModifiedAt vs lastSyncedAt 判定 note 是否
 * "需要重新合成"。Phase 6.3 的 synthesizer 完成后调 markSynced 写回 hash。
 *
 * 文件 missing/损坏时退化为空 state,不抛错。save() 是同步 fs 写入,简单
 * 可靠;若并发写多了再换 atomic-write。
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export interface WikiNoteState {
  /** 笔记最近一次内容修改的时间(epoch ms) */
  lastModifiedAt: number
  /** 最近一次同步进 wiki 的时间;未同步过则 undefined */
  lastSyncedAt?: number
  /** 同步时计算的内容 sha256 hex,用于侦测"内容真改了" */
  lastSyncedHash?: string
}

interface PersistedShape {
  notes: Record<string, WikiNoteState>
}

const SUBDIR = '.lumina'
const FILENAME = 'wiki-state.json'

function emptyState(): PersistedShape {
  return { notes: {} }
}

export class WikiState {
  private readonly filePath: string
  private state: PersistedShape = emptyState()
  private loaded = false

  constructor(vaultPath: string) {
    this.filePath = path.join(vaultPath, SUBDIR, FILENAME)
  }

  /** 强制加载/重载;调用后续 API 会自动 lazy load */
  reload(): void {
    this.loaded = true
    let raw: string
    try {
      raw = fs.readFileSync(this.filePath, 'utf-8')
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      if (e.code !== 'ENOENT') {
        // 损坏/权限问题:退到空 state;下一次 save 会覆盖
        console.warn('[wiki-state] load failed, resetting:', e.message)
      }
      this.state = emptyState()
      return
    }
    try {
      const parsed = JSON.parse(raw) as Partial<PersistedShape>
      this.state = {
        notes:
          parsed?.notes && typeof parsed.notes === 'object'
            ? (parsed.notes as Record<string, WikiNoteState>)
            : {},
      }
    } catch {
      this.state = emptyState()
    }
  }

  private ensureLoaded(): void {
    if (!this.loaded) this.reload()
  }

  /** 立刻把 state 落盘 */
  save(): void {
    this.ensureLoaded()
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      fs.writeFileSync(
        this.filePath,
        JSON.stringify(this.state, null, 2),
        'utf-8',
      )
    } catch (err) {
      console.error('[wiki-state] save failed', err)
    }
  }

  getNoteState(relPath: string): WikiNoteState | undefined {
    this.ensureLoaded()
    return this.state.notes[relPath]
  }

  getAllStates(): Record<string, WikiNoteState> {
    this.ensureLoaded()
    return { ...this.state.notes }
  }

  /** 部分更新 + 立即 save。返回更新后的状态 */
  updateNoteState(
    relPath: string,
    patch: Partial<WikiNoteState> & { lastModifiedAt: number },
  ): WikiNoteState {
    this.ensureLoaded()
    const prev = this.state.notes[relPath]
    const next: WikiNoteState = {
      ...prev,
      ...patch,
    }
    this.state.notes[relPath] = next
    this.save()
    return next
  }

  /** 标记 note 已同步,写回 lastSyncedAt + hash */
  markSynced(relPath: string, syncedAtMs: number, contentHash: string): void {
    this.ensureLoaded()
    const prev = this.state.notes[relPath]
    if (!prev) return
    this.state.notes[relPath] = {
      ...prev,
      lastSyncedAt: syncedAtMs,
      lastSyncedHash: contentHash,
    }
    this.save()
  }

  removeNote(relPath: string): void {
    this.ensureLoaded()
    if (!(relPath in this.state.notes)) return
    delete this.state.notes[relPath]
    this.save()
  }

  /**
   * 判断 note 自上次同步后是否真的变了:
   *   - 没同步过 → true
   *   - lastSyncedHash 与当前内容 hash 不同 → true
   * 文件读取失败按 false 处理(避免对 missing file 反复触发)。
   */
  needsSync(relPath: string, absPath: string): boolean {
    this.ensureLoaded()
    const state = this.state.notes[relPath]
    if (!state || !state.lastSyncedAt) return true
    let content: Buffer
    try {
      content = fs.readFileSync(absPath)
    } catch {
      return false
    }
    const hash = crypto.createHash('sha256').update(content).digest('hex')
    return hash !== state.lastSyncedHash
  }
}

export function hashContent(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}
