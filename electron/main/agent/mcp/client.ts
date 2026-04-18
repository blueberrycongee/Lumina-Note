/**
 * McpClient — 单个 MCP server 的连接 wrapper。
 *
 * 包装 @modelcontextprotocol/sdk 的 Client + StdioClientTransport,提供:
 *   - connect(config) — spawn 子进程并完成 MCP 握手
 *   - listTools() — 缓存 + 刷新 server 暴露的工具列表
 *   - callTool(name, args) — 直接调一次工具
 *   - disconnect() — close transport,kill 子进程
 *   - getStatus() — 'idle' | 'starting' | 'running' | 'stopped' | 'error'
 *
 * 也允许传入自定义 Transport(测试用 InMemoryTransport,生产基本都是 stdio)。
 *
 * 失败时 status = 'error',lastError 保留最近一次错误供 UI 展示。
 * stderr 通过 PassThrough 暴露成 Readable,供 manager 收集成日志。
 */

import { PassThrough, type Readable } from 'node:stream'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  StdioClientTransport,
  type StdioServerParameters,
} from '@modelcontextprotocol/sdk/client/stdio.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'

export type McpClientStatus = 'idle' | 'starting' | 'running' | 'stopped' | 'error'

export interface McpToolDef {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}

export interface McpStdioConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
}

export interface McpClientOptions {
  /** server 名称(给 logs 用) */
  name: string
  /** stdio 启动配置 — 若提供 transport 则忽略 */
  stdio?: McpStdioConfig
  /** 自定义 transport(测试用) */
  transport?: Transport
  /** Client 自身在 MCP handshake 时上报的 client info */
  clientInfo?: { name: string; version: string }
}

export class McpClient {
  private readonly options: McpClientOptions
  private readonly client: Client
  private transport?: Transport
  private stderrStream?: PassThrough
  private cachedTools: McpToolDef[] | null = null
  public status: McpClientStatus = 'idle'
  public lastError: string | null = null

  constructor(options: McpClientOptions) {
    this.options = options
    this.client = new Client(
      options.clientInfo ?? { name: 'lumina-note', version: '2.0.0' },
      {},
    )
  }

  /**
   * stderr 的 PassThrough — 在 connect() 之前调用也安全(返回一个空流,
   * connect 时再把子进程 stderr pipe 进来)。
   */
  get stderr(): Readable {
    if (!this.stderrStream) this.stderrStream = new PassThrough()
    return this.stderrStream
  }

  async connect(): Promise<void> {
    if (this.status === 'running' || this.status === 'starting') return
    this.status = 'starting'
    this.lastError = null
    try {
      const transport = this.options.transport ?? this.buildStdioTransport()
      this.transport = transport
      await this.client.connect(transport)
      this.status = 'running'
      this.cachedTools = null
    } catch (err) {
      this.status = 'error'
      this.lastError = err instanceof Error ? err.message : String(err)
      throw err
    }
  }

  async disconnect(): Promise<void> {
    if (this.status === 'idle' || this.status === 'stopped') return
    try {
      await this.client.close()
    } catch {
      // swallow — already closed
    }
    this.status = 'stopped'
    this.transport = undefined
  }

  async listTools(forceRefresh = false): Promise<McpToolDef[]> {
    if (this.status !== 'running') {
      throw new Error(`MCP client "${this.options.name}" not connected (status=${this.status})`)
    }
    if (this.cachedTools && !forceRefresh) return this.cachedTools
    const result = await this.client.listTools()
    const tools: McpToolDef[] = (result.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description ?? undefined,
      inputSchema: (t.inputSchema as Record<string, unknown>) ?? {
        type: 'object',
        properties: {},
      },
    }))
    this.cachedTools = tools
    return tools
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown> = {},
  ): Promise<string> {
    if (this.status !== 'running') {
      throw new Error(`MCP client "${this.options.name}" not connected`)
    }
    const result = await this.client.callTool({
      name: toolName,
      arguments: args,
    })
    return mcpResultToString(result)
  }

  getInfo(): { name: string; status: McpClientStatus; lastError: string | null } {
    return { name: this.options.name, status: this.status, lastError: this.lastError }
  }

  private buildStdioTransport(): Transport {
    const stdio = this.options.stdio
    if (!stdio) {
      throw new Error(
        `McpClient "${this.options.name}": no stdio config or transport provided`,
      )
    }
    if (!this.stderrStream) this.stderrStream = new PassThrough()
    const params: StdioServerParameters = {
      command: stdio.command,
      args: stdio.args,
      env: stdio.env,
      cwd: stdio.cwd,
      stderr: 'pipe',
    }
    const transport = new StdioClientTransport(params)
    // pipe child stderr into our PassThrough so manager can tail it
    queueMicrotask(() => {
      const childErr = transport.stderr
      if (childErr && this.stderrStream) {
        childErr.on('data', (chunk: Buffer | string) => {
          this.stderrStream?.write(chunk)
        })
      }
    })
    return transport
  }
}

/**
 * MCP CallToolResult.content 是一个 ContentBlock[] 数组(text/image/etc)。
 * 我们把它平铺成 string 给内部 Tool.execute 用。
 */
function mcpResultToString(result: {
  content?: Array<{ type: string; text?: string; [k: string]: unknown }>
  isError?: boolean
}): string {
  const blocks = result.content ?? []
  const out: string[] = []
  for (const block of blocks) {
    if (block.type === 'text' && typeof block.text === 'string') {
      out.push(block.text)
    } else {
      out.push(JSON.stringify(block))
    }
  }
  const body = out.join('\n')
  if (result.isError) return `MCP tool error: ${body}`
  return body
}
