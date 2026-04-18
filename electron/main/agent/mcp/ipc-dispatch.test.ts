/**
 * 端到端覆盖 mcp_* IPC 命令 — 通过 dispatchAgentCommand 走真实路径,
 * 用 InMemoryTransport-backed McpClient 跳过子进程 spawn。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { McpClient } from './client.js'
import { McpManager, type McpServerConfig } from './manager.js'
import { AgentRuntime } from '../runtime.js'
import { AgentEventBus } from '../event-bus.js'
import { dispatchAgentCommand, isAgentCommand } from '../ipc-dispatch.js'
import type { AgentEvent } from '../types.js'

class RecordingEventBus extends AgentEventBus {
  public events: AgentEvent[] = []
  constructor() {
    super(() => null)
  }
  emit(event: AgentEvent): void {
    this.events.push(event)
  }
}

let baseDir = ''

beforeEach(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-mcp-ipc-'))
})

afterEach(() => {
  try {
    fs.rmSync(baseDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

function clientFactory(config: McpServerConfig): McpClient {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const server = new McpServer({ name: config.name, version: '0.0.1' })
  server.registerTool(
    'echo',
    { description: 'echoes', inputSchema: { msg: z.string() } },
    async ({ msg }) => ({ content: [{ type: 'text', text: `pong:${msg}` }] }),
  )
  void server.connect(serverTransport)
  return new McpClient({ name: config.name, transport: clientTransport })
}

function buildHarness() {
  const bus = new RecordingEventBus()
  const runtime = new AgentRuntime({ eventBus: bus })
  const mcpManager = new McpManager({ baseDir, clientFactory })
  return { runtime, mcpManager, ctx: { runtime, mcpManager } }
}

describe('isAgentCommand', () => {
  it('routes mcp_ prefixed commands to the agent dispatcher', () => {
    expect(isAgentCommand('mcp_list_servers')).toBe(true)
    expect(isAgentCommand('mcp_add_server')).toBe(true)
    expect(isAgentCommand('agent_start_task')).toBe(true)
    expect(isAgentCommand('vault_initialize')).toBe(true)
    expect(isAgentCommand('fs_read')).toBe(false)
  })
})

describe('mcp_* IPC dispatch', () => {
  it('mcp_add_server persists, mcp_list_servers returns it, mcp_remove_server clears', async () => {
    const { ctx, mcpManager } = buildHarness()
    const config: McpServerConfig = {
      id: 's1',
      name: 'S1',
      command: 'true',
      autoStart: false,
    }
    const added = (await dispatchAgentCommand(ctx, 'mcp_add_server', { config })) as {
      id: string
    }
    expect(added.id).toBe('s1')

    const listed = (await dispatchAgentCommand(ctx, 'mcp_list_servers', {})) as Array<{
      id: string
    }>
    expect(listed.map((s) => s.id)).toEqual(['s1'])

    await dispatchAgentCommand(ctx, 'mcp_remove_server', { id: 's1' })
    const after = (await dispatchAgentCommand(ctx, 'mcp_list_servers', {})) as unknown[]
    expect(after).toEqual([])

    await mcpManager.dispose()
  })

  it('mcp_start_server / mcp_list_tools / mcp_test_tool round-trip', async () => {
    const { ctx, mcpManager } = buildHarness()
    await dispatchAgentCommand(ctx, 'mcp_add_server', {
      config: { id: 'echo', name: 'Echo', command: 'true' },
    })
    const startResult = (await dispatchAgentCommand(ctx, 'mcp_start_server', {
      id: 'echo',
    })) as { status: string }
    expect(startResult.status).toBe('running')

    const tools = (await dispatchAgentCommand(ctx, 'mcp_list_tools', {})) as Array<{
      prefixedName: string
    }>
    expect(tools.map((t) => t.prefixedName)).toEqual(['mcp__echo__echo'])

    const callResult = (await dispatchAgentCommand(ctx, 'mcp_test_tool', {
      name: 'mcp__echo__echo',
      arguments: { msg: 'world' },
    })) as { ok: boolean; result?: string }
    expect(callResult.ok).toBe(true)
    expect(callResult.result).toBe('pong:world')

    await mcpManager.dispose()
  })

  it('mcp_stop_server then mcp_restart_server brings it back', async () => {
    const { ctx, mcpManager } = buildHarness()
    await dispatchAgentCommand(ctx, 'mcp_add_server', {
      config: { id: 'r', name: 'R', command: 'true' },
    })
    await dispatchAgentCommand(ctx, 'mcp_start_server', { id: 'r' })
    const stopped = (await dispatchAgentCommand(ctx, 'mcp_stop_server', {
      id: 'r',
    })) as { status: string }
    expect(stopped.status).toBe('stopped')

    const restarted = (await dispatchAgentCommand(ctx, 'mcp_restart_server', {
      id: 'r',
    })) as { status: string }
    expect(restarted.status).toBe('running')

    await mcpManager.dispose()
  })

  it('mcp_test_tool returns ok=false on failure', async () => {
    const { ctx, mcpManager } = buildHarness()
    const result = (await dispatchAgentCommand(ctx, 'mcp_test_tool', {
      name: 'mcp__nonexistent__x',
      arguments: {},
    })) as { ok: boolean; error?: string }
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Unknown MCP server')
    await mcpManager.dispose()
  })

  it('mcp_get_server_status returns null for unknown id', async () => {
    const { ctx, mcpManager } = buildHarness()
    const out = await dispatchAgentCommand(ctx, 'mcp_get_server_status', {
      id: 'missing',
    })
    expect(out).toBeNull()
    await mcpManager.dispose()
  })

  it('mcp_get_server_logs returns the recentStderr buffer', async () => {
    const { ctx, mcpManager } = buildHarness()
    await dispatchAgentCommand(ctx, 'mcp_add_server', {
      config: { id: 'l', name: 'L', command: 'true' },
    })
    const logs = await dispatchAgentCommand(ctx, 'mcp_get_server_logs', { id: 'l' })
    expect(Array.isArray(logs)).toBe(true)
    await mcpManager.dispose()
  })

  it('mcp_update_server changes the config and re-runs if it was running', async () => {
    const { ctx, mcpManager } = buildHarness()
    await dispatchAgentCommand(ctx, 'mcp_add_server', {
      config: { id: 'u', name: 'old', command: 'true' },
    })
    await dispatchAgentCommand(ctx, 'mcp_start_server', { id: 'u' })
    const updated = (await dispatchAgentCommand(ctx, 'mcp_update_server', {
      id: 'u',
      patch: { name: 'new' },
    })) as { name: string }
    expect(updated.name).toBe('new')
    await mcpManager.dispose()
  })

  it('returns sensible defaults when McpManager is not configured', async () => {
    const bus = new RecordingEventBus()
    const runtime = new AgentRuntime({ eventBus: bus })
    const ctx = { runtime } // no mcpManager
    expect(await dispatchAgentCommand(ctx, 'mcp_list_servers', {})).toEqual([])
    expect(await dispatchAgentCommand(ctx, 'mcp_list_tools', {})).toEqual([])
    expect(await dispatchAgentCommand(ctx, 'mcp_get_server_logs', { id: 'x' })).toEqual([])
    await expect(
      dispatchAgentCommand(ctx, 'mcp_add_server', { config: { id: 'x', name: 'x', command: 't' } }),
    ).rejects.toThrow(/not configured/)
  })
})
