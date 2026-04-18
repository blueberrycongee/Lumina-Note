/**
 * DebugLog — agent 执行过程的 NDJSON 日志。
 *
 * 每条日志一行 JSON: { timestamp, session, kind, payload }
 * - 启用时才写盘,关闭时不产生任何文件
 * - 每次 enable 产出一份新文件 session_<iso>.ndjson 放在 baseDir/lumina-agent/
 * - baseDir 由构造参数注入(生产传 app.getPath('logs'),测试传 tmpdir)
 *
 * runtime/gate/tool 通过 log(kind, payload, sessionId?) 写入。
 */

import fs from 'node:fs'
import path from 'node:path'

export interface DebugLogOptions {
  /** 日志根目录 — 一般是 app.getPath('logs') */
  baseDir: string
  /** 覆写子目录,默认 'lumina-agent' */
  subDir?: string
}

export interface DebugLogEntry {
  timestamp: number
  session: string | null
  kind: string
  payload: unknown
}

export class DebugLog {
  private readonly options: DebugLogOptions
  private enabled = false
  private filePath: string | null = null
  private stream: fs.WriteStream | null = null

  constructor(options: DebugLogOptions) {
    this.options = options
  }

  enable(context?: { workspacePath?: string }): string | null {
    if (this.enabled && this.filePath) return this.filePath

    const dir = path.join(this.options.baseDir, this.options.subDir ?? 'lumina-agent')
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch (err) {
      console.error('[debug-log] mkdir failed', err)
      return null
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filePath = path.join(dir, `session_${stamp}.ndjson`)
    let stream: fs.WriteStream
    try {
      stream = fs.createWriteStream(filePath, { flags: 'a' })
    } catch (err) {
      console.error('[debug-log] createWriteStream failed', err)
      return null
    }
    // Prevent unhandled stream errors (e.g. file removed while stream is draining)
    stream.on('error', (err) => {
      console.error('[debug-log] stream error', err)
    })

    this.filePath = filePath
    this.stream = stream
    this.enabled = true
    this.log('debug_log.enabled', { workspacePath: context?.workspacePath ?? null })
    return filePath
  }

  disable(): void {
    if (!this.enabled) return
    this.log('debug_log.disabled', {})
    this.enabled = false
    const stream = this.stream
    this.stream = null
    stream?.end()
    // 保留 filePath 让 UI 还能取到最后一份日志路径
  }

  isEnabled(): boolean {
    return this.enabled
  }

  getFilePath(): string | null {
    return this.filePath
  }

  log(kind: string, payload: unknown, sessionId?: string): void {
    if (!this.enabled || !this.stream) return
    const entry: DebugLogEntry = {
      timestamp: Date.now(),
      session: sessionId ?? null,
      kind,
      payload,
    }
    try {
      this.stream.write(JSON.stringify(entry) + '\n')
    } catch (err) {
      console.error('[debug-log] write failed', err)
    }
  }
}
