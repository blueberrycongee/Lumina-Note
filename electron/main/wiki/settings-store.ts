/**
 * WikiSettingsStore — wiki 自动合成的用户配置,持久化到 userData 下。
 *
 * 用户在设置面板可以调:
 *   - enabled: 总开关。off 时 trigger 不启动,manual 命令(rebuild/synthesize_note) 仍可用
 *   - quietMs: 改动后多久才触发,默认 30s
 *   - cooldownMs: 同一份 note 两次合成之间的最短间隔,默认 5min
 *   - scanIntervalMs: 定时扫描间隔,默认 5min
 *   - excludeGlobs: 用户额外排除的 glob 模式
 *
 * 文件:userData/lumina-wiki-settings.json
 */

import fs from 'node:fs'
import path from 'node:path'

export interface WikiSettings {
  enabled: boolean
  quietMs: number
  cooldownMs: number
  scanIntervalMs: number
  excludeGlobs: string[]
}

export const DEFAULT_WIKI_SETTINGS: WikiSettings = {
  enabled: false,
  quietMs: 30_000,
  cooldownMs: 5 * 60_000,
  scanIntervalMs: 5 * 60_000,
  excludeGlobs: [],
}

const FILE = 'lumina-wiki-settings.json'

export interface WikiSettingsStoreOptions {
  baseDir: string
  fileName?: string
}

export class WikiSettingsStore {
  private readonly filePath: string
  private cached: WikiSettings | null = null

  constructor(opts: WikiSettingsStoreOptions) {
    this.filePath = path.join(opts.baseDir, opts.fileName ?? FILE)
  }

  get(): WikiSettings {
    if (this.cached) return { ...this.cached, excludeGlobs: [...this.cached.excludeGlobs] }
    let raw: string
    try {
      raw = fs.readFileSync(this.filePath, 'utf-8')
    } catch {
      this.cached = { ...DEFAULT_WIKI_SETTINGS, excludeGlobs: [] }
      return { ...this.cached }
    }
    let parsed: Partial<WikiSettings> = {}
    try {
      parsed = JSON.parse(raw) as Partial<WikiSettings>
    } catch {
      // fallthrough to defaults
    }
    this.cached = mergeWithDefaults(parsed)
    return { ...this.cached, excludeGlobs: [...this.cached.excludeGlobs] }
  }

  /** 部分更新,合并入持久化 */
  set(patch: Partial<WikiSettings>): WikiSettings {
    const current = this.get()
    const next = mergeWithDefaults({ ...current, ...patch })
    this.cached = next
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      fs.writeFileSync(this.filePath, JSON.stringify(next, null, 2), 'utf-8')
    } catch (err) {
      console.error('[wiki-settings] save failed', err)
    }
    return { ...next, excludeGlobs: [...next.excludeGlobs] }
  }

  reset(): WikiSettings {
    this.cached = null
    try {
      fs.unlinkSync(this.filePath)
    } catch {
      // ignore
    }
    return this.get()
  }
}

function mergeWithDefaults(patch: Partial<WikiSettings>): WikiSettings {
  return {
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : DEFAULT_WIKI_SETTINGS.enabled,
    quietMs:
      typeof patch.quietMs === 'number' && patch.quietMs >= 0
        ? patch.quietMs
        : DEFAULT_WIKI_SETTINGS.quietMs,
    cooldownMs:
      typeof patch.cooldownMs === 'number' && patch.cooldownMs >= 0
        ? patch.cooldownMs
        : DEFAULT_WIKI_SETTINGS.cooldownMs,
    scanIntervalMs:
      typeof patch.scanIntervalMs === 'number' && patch.scanIntervalMs >= 0
        ? patch.scanIntervalMs
        : DEFAULT_WIKI_SETTINGS.scanIntervalMs,
    excludeGlobs: Array.isArray(patch.excludeGlobs)
      ? patch.excludeGlobs.filter((s): s is string => typeof s === 'string' && s.length > 0)
      : [],
  }
}
