/**
 * MemoryStore — 每个 agent 会话的持久化 turn log(JSONL)+ summary.md 占位。
 *
 * 一次会话对应两个文件,均落在 vault/.lumina/sessions/ 下:
 * - <sessionId>.jsonl   每一 turn 一行,结构 { timestamp, kind, payload }
 * - <sessionId>.summary.md  Phase 2 provider 接入后,由 agent 写一份简短摘要
 *
 * Phase 1.6 只做 JSONL turn log。summary.md 占位为空方法,Phase 2+ 再填。
 */

import fs from 'node:fs'
import path from 'node:path'

export interface MemoryTurnEntry {
  timestamp: number
  kind: string
  payload: unknown
}

export interface MemorySessionHandle {
  sessionId: string
  workspacePath: string
  dir: string
  filePath: string
  summaryPath: string
  startedAt: number
  endedAt?: number
}

export interface EndSessionOptions {
  /** 预留给 Phase 2 —— 触发 agent 写 summary.md。当前为 no-op。 */
  writeSummary?: boolean
}

export class MemoryStore {
  private active: MemorySessionHandle | null = null
  private stream: fs.WriteStream | null = null

  startSession(sessionId: string, workspacePath: string): MemorySessionHandle | null {
    if (!sessionId || !workspacePath) {
      return null
    }
    if (this.active) {
      // 上一 session 没显式 end,兜底关闭
      this.endSession()
    }

    const dir = path.join(workspacePath, '.lumina', 'sessions')
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch (err) {
      console.error('[memory-store] mkdir failed', err)
      return null
    }

    const filePath = path.join(dir, `${sessionId}.jsonl`)
    const summaryPath = path.join(dir, `${sessionId}.summary.md`)
    let stream: fs.WriteStream
    try {
      stream = fs.createWriteStream(filePath, { flags: 'a' })
    } catch (err) {
      console.error('[memory-store] createWriteStream failed', err)
      return null
    }
    stream.on('error', (err) => {
      console.error('[memory-store] stream error', err)
    })

    const handle: MemorySessionHandle = {
      sessionId,
      workspacePath,
      dir,
      filePath,
      summaryPath,
      startedAt: Date.now(),
    }
    this.active = handle
    this.stream = stream
    this.appendTurn({
      kind: 'session.start',
      payload: { workspacePath, sessionId },
    })
    return handle
  }

  appendTurn(entry: { kind: string; payload: unknown }): void {
    if (!this.active || !this.stream) return
    const full: MemoryTurnEntry = {
      timestamp: Date.now(),
      kind: entry.kind,
      payload: entry.payload,
    }
    try {
      this.stream.write(JSON.stringify(full) + '\n')
    } catch (err) {
      console.error('[memory-store] write failed', err)
    }
  }

  endSession(options: EndSessionOptions = {}): MemorySessionHandle | null {
    if (!this.active) return null
    const handle = this.active
    handle.endedAt = Date.now()
    this.appendTurn({
      kind: 'session.end',
      payload: {
        durationMs: handle.endedAt - handle.startedAt,
        sessionId: handle.sessionId,
      },
    })
    const stream = this.stream
    this.active = null
    this.stream = null
    stream?.end()

    if (options.writeSummary) {
      // Phase 2+ 会用 provider 生成 markdown summary,此处仅留占位
      this.writeSummaryStub(handle)
    }
    return handle
  }

  getActive(): MemorySessionHandle | null {
    return this.active
  }

  /** Phase 2 会在接入 provider 后调用 agent 生成 summary。本 item 写一个空文件占位。 */
  private writeSummaryStub(handle: MemorySessionHandle): void {
    try {
      if (!fs.existsSync(handle.summaryPath)) {
        fs.writeFileSync(
          handle.summaryPath,
          '<!-- summary pending (Phase 2 provider integration) -->\n',
          'utf-8',
        )
      }
    } catch (err) {
      console.error('[memory-store] summary stub write failed', err)
    }
  }
}
