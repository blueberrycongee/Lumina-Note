/**
 * McpManager — 管理多个 MCP server 的生命周期。
 *
 * 职责:
 *   - addServer / removeServer / restartServer / setEnabled
 *   - 启动每个 server 的 McpClient 并跟踪 status
 *   - 收集每个 server 的 stderr 到环形 ring buffer 供 UI tail
 *   - listAllTools(): 聚合所有 running server 的工具列表(name 已加 server 前缀)
 *   - callTool(prefixedName, args): 路由到对应 server
 *   - 配置持久化在 userData/lumina-mcp-servers.json
 *
 * 进程崩溃自动重启走指数退避(1s → 2s → 4s ... 上限 30s, 5 次后停止),
 * 状态退到 'error' 等待用户手动 restart。
 *
 * 单测里可以注入 clientFactory 替换成 InMemoryTransport-backed McpClient,
 * 跳过实际 spawn。
 */

import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'

import { McpClient, type McpClientStatus, type McpToolDef } from './client.js'

export interface McpServerConfig {
  /** 稳定 id,前端用它操作 */
  id: string
  /** 显示名,可读,允许重复 */
  name: string
  /** stdio 命令 */
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  /** 启动时是否自动连接 */
  autoStart?: boolean
  /** 失败时是否自动重启 */
  autoRestart?: boolean
}

export interface McpServerInfo extends McpServerConfig {
  status: McpClientStatus
  lastError: string | null
  toolCount: number
  /** 最近的 stderr 片段(尾部固定容量) */
  recentStderr: string[]
}

export type McpClientFactory = (config: McpServerConfig) => McpClient

export interface McpManagerOptions {
  /** Electron userData 目录 */
  baseDir: string
  /** 文件名覆写(测试用) */
  fileName?: string
  /** 注入 client 工厂(测试用) */
  clientFactory?: McpClientFactory
  /** stderr ring buffer 行数上限 */
  stderrBufferLines?: number
  /** 自动重启最大次数 */
  maxRestartAttempts?: number
}

const DEFAULT_FILE = 'lumina-mcp-servers.json'
const DEFAULT_STDERR_LINES = 200
const DEFAULT_MAX_RESTARTS = 5

interface ServerEntry {
  config: McpServerConfig
  client: McpClient
  recentStderr: string[]
  restartAttempts: number
  restartTimer?: ReturnType<typeof setTimeout>
  /** 用户主动 stop 不要触发自动重启 */
  stoppedByUser: boolean
}

function defaultClientFactory(config: McpServerConfig): McpClient {
  return new McpClient({
    name: config.name,
    stdio: {
      command: config.command,
      args: config.args,
      env: config.env,
      cwd: config.cwd,
    },
  })
}

export class McpManager extends EventEmitter {
  private readonly options: McpManagerOptions
  private readonly filePath: string
  private readonly entries = new Map<string, ServerEntry>()
  private readonly stderrCap: number
  private readonly maxRestarts: number
  private readonly factory: McpClientFactory
  private loaded = false

  constructor(options: McpManagerOptions) {
    super()
    this.options = options
    this.filePath = path.join(options.baseDir, options.fileName ?? DEFAULT_FILE)
    this.stderrCap = options.stderrBufferLines ?? DEFAULT_STDERR_LINES
    this.maxRestarts = options.maxRestartAttempts ?? DEFAULT_MAX_RESTARTS
    this.factory = options.clientFactory ?? defaultClientFactory
  }

  /** 启动 manager:加载持久化配置,启动 autoStart=true 的 server */
  async init(): Promise<void> {
    this.load()
    const configs = Array.from(this.entries.values()).map((e) => e.config)
    for (const config of configs) {
      if (config.autoStart) {
        await this.startServer(config.id).catch(() => {
          // 失败已记录在 entry.client.lastError,不冒泡阻断 init
        })
      }
    }
  }

  listServers(): McpServerInfo[] {
    return Array.from(this.entries.values()).map((entry) => this.toInfo(entry))
  }

  getServer(id: string): McpServerInfo | null {
    const entry = this.entries.get(id)
    return entry ? this.toInfo(entry) : null
  }

  /** 添加 server,落盘;若 autoStart 则立即启动 */
  async addServer(config: McpServerConfig): Promise<McpServerInfo> {
    if (this.entries.has(config.id)) {
      throw new Error(`MCP server with id "${config.id}" already exists`)
    }
    const entry = this.buildEntry(config)
    this.entries.set(config.id, entry)
    this.persist()
    if (config.autoStart) {
      await this.startServer(config.id).catch(() => undefined)
    }
    this.emit('changed', config.id)
    return this.toInfo(entry)
  }

  async removeServer(id: string): Promise<void> {
    const entry = this.entries.get(id)
    if (!entry) return
    entry.stoppedByUser = true
    if (entry.restartTimer) clearTimeout(entry.restartTimer)
    await entry.client.disconnect().catch(() => undefined)
    this.entries.delete(id)
    this.persist()
    this.emit('changed', id)
  }

  async startServer(id: string): Promise<void> {
    const entry = this.requireEntry(id)
    entry.stoppedByUser = false
    if (entry.client.status === 'running' || entry.client.status === 'starting') return
    try {
      await entry.client.connect()
      entry.restartAttempts = 0
      this.emit('status', id, entry.client.status)
    } catch (err) {
      this.emit('status', id, entry.client.status)
      this.scheduleAutoRestart(entry)
      throw err
    }
  }

  async stopServer(id: string): Promise<void> {
    const entry = this.requireEntry(id)
    entry.stoppedByUser = true
    if (entry.restartTimer) clearTimeout(entry.restartTimer)
    await entry.client.disconnect().catch(() => undefined)
    this.emit('status', id, entry.client.status)
  }

  async restartServer(id: string): Promise<void> {
    const entry = this.requireEntry(id)
    const config = entry.config
    await this.stopServer(id)
    // Rebuild the entry — both stdio and InMemory transports cannot be reused
    // after close(), so the client + transport need to be recreated to reconnect.
    const newEntry = this.buildEntry(config)
    this.entries.set(id, newEntry)
    await this.startServer(id)
  }

  /** 把 server 配置整体替换(命令/args/env 改了要走这个),自动 stop+start */
  async updateServer(id: string, patch: Partial<McpServerConfig>): Promise<McpServerInfo> {
    const entry = this.requireEntry(id)
    const wasRunning = entry.client.status === 'running'
    await this.stopServer(id)
    const newConfig: McpServerConfig = { ...entry.config, ...patch, id }
    const newEntry = this.buildEntry(newConfig)
    this.entries.set(id, newEntry)
    this.persist()
    if (wasRunning) {
      await this.startServer(id).catch(() => undefined)
    }
    this.emit('changed', id)
    return this.toInfo(newEntry)
  }

  /** 所有 running server 的 tool list,name 加 mcp__<id>__ 前缀 */
  async listAllTools(): Promise<Array<McpToolDef & { serverId: string; prefixedName: string }>> {
    const out: Array<McpToolDef & { serverId: string; prefixedName: string }> = []
    for (const entry of this.entries.values()) {
      if (entry.client.status !== 'running') continue
      let tools: McpToolDef[]
      try {
        tools = await entry.client.listTools()
      } catch {
        continue
      }
      for (const tool of tools) {
        out.push({
          ...tool,
          serverId: entry.config.id,
          prefixedName: makePrefixedName(entry.config.id, tool.name),
        })
      }
    }
    return out
  }

  /** 调用以 mcp__<id>__<toolName> 为名的工具 */
  async callTool(prefixedName: string, args: Record<string, unknown>): Promise<string> {
    const parsed = parsePrefixedName(prefixedName)
    if (!parsed) {
      throw new Error(`Not an MCP tool name: ${prefixedName}`)
    }
    const entry = this.requireEntry(parsed.serverId)
    return entry.client.callTool(parsed.toolName, args)
  }

  /** 关闭所有 server,manager 销毁前调 */
  async dispose(): Promise<void> {
    const entries = Array.from(this.entries.values())
    for (const entry of entries) {
      entry.stoppedByUser = true
      if (entry.restartTimer) clearTimeout(entry.restartTimer)
      await entry.client.disconnect().catch(() => undefined)
    }
  }

  // ── persistence ────────────────────────────────────────────────────────

  private load(): void {
    if (this.loaded) return
    this.loaded = true
    let raw: string
    try {
      raw = fs.readFileSync(this.filePath, 'utf-8')
    } catch {
      return
    }
    let parsed: { servers?: McpServerConfig[] }
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    for (const config of parsed.servers ?? []) {
      if (!config?.id || this.entries.has(config.id)) continue
      this.entries.set(config.id, this.buildEntry(config))
    }
  }

  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
      const servers = Array.from(this.entries.values()).map((e) => e.config)
      fs.writeFileSync(this.filePath, JSON.stringify({ servers }, null, 2), 'utf-8')
    } catch (err) {
      console.error('[mcp-manager] persist failed', err)
    }
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private buildEntry(config: McpServerConfig): ServerEntry {
    const client = this.factory(config)
    const recentStderr: string[] = []
    const stream = client.stderr
    stream.on('data', (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8')
      for (const line of text.split('\n')) {
        if (line.length === 0) continue
        recentStderr.push(line)
        if (recentStderr.length > this.stderrCap) {
          recentStderr.splice(0, recentStderr.length - this.stderrCap)
        }
      }
      this.emit('stderr', config.id, text)
    })
    return {
      config,
      client,
      recentStderr,
      restartAttempts: 0,
      stoppedByUser: false,
    }
  }

  private requireEntry(id: string): ServerEntry {
    const entry = this.entries.get(id)
    if (!entry) throw new Error(`Unknown MCP server: ${id}`)
    return entry
  }

  private scheduleAutoRestart(entry: ServerEntry): void {
    if (!entry.config.autoRestart || entry.stoppedByUser) return
    if (entry.restartAttempts >= this.maxRestarts) return
    const delay = Math.min(1000 * 2 ** entry.restartAttempts, 30_000)
    entry.restartAttempts += 1
    entry.restartTimer = setTimeout(() => {
      entry.restartTimer = undefined
      void this.startServer(entry.config.id).catch(() => undefined)
    }, delay)
  }

  private toInfo(entry: ServerEntry): McpServerInfo {
    return {
      ...entry.config,
      status: entry.client.status,
      lastError: entry.client.lastError,
      toolCount: 0, // populated lazily by listTools(); keep cheap here
      recentStderr: [...entry.recentStderr],
    }
  }
}

const PREFIX = 'mcp__'
const SEP = '__'

export function makePrefixedName(serverId: string, toolName: string): string {
  return `${PREFIX}${serverId}${SEP}${toolName}`
}

export function parsePrefixedName(
  name: string,
): { serverId: string; toolName: string } | null {
  if (!name.startsWith(PREFIX)) return null
  const rest = name.slice(PREFIX.length)
  const idx = rest.indexOf(SEP)
  if (idx <= 0) return null
  return { serverId: rest.slice(0, idx), toolName: rest.slice(idx + SEP.length) }
}
