import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { McpClient } from './client.js'
import { McpManager, type McpServerConfig } from './manager.js'
import { refreshMcpTools } from './tools.js'
import { ToolRegistry } from '../tool-registry.js'

let baseDir = ''

beforeEach(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-mcp-tools-'))
})

afterEach(() => {
  try {
    fs.rmSync(baseDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

function buildServerFactory(): (config: McpServerConfig) => McpClient {
  return (config) => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const server = new McpServer({ name: config.name, version: '0.0.1' })
    server.registerTool(
      'echo',
      { description: 'echoes', inputSchema: { msg: z.string() } },
      async ({ msg }) => ({ content: [{ type: 'text', text: `pong:${msg}` }] }),
    )
    server.registerTool(
      'fail',
      { description: 'errors', inputSchema: {} },
      async () => ({ isError: true, content: [{ type: 'text', text: 'nope' }] }),
    )
    void server.connect(serverTransport)
    return new McpClient({ name: config.name, transport: clientTransport })
  }
}

async function newRunningManager(): Promise<McpManager> {
  const mgr = new McpManager({ baseDir, clientFactory: buildServerFactory() })
  await mgr.addServer({ id: 'srv', name: 'Srv', command: 'true' })
  await mgr.startServer('srv')
  return mgr
}

const noAbort = new AbortController().signal

describe('refreshMcpTools', () => {
  it('registers each tool with mcp__<id>__<name> and requires_approval=true', async () => {
    const mgr = await newRunningManager()
    const reg = new ToolRegistry()
    const count = await refreshMcpTools(reg, mgr)
    expect(count).toBe(2)
    const names = reg.definitions().map((d) => d.name).sort()
    expect(names).toEqual(['mcp__srv__echo', 'mcp__srv__fail'])

    const echo = reg.get('mcp__srv__echo')
    expect(echo?.requires_approval).toBe(true)
    expect(echo?.description).toBe('echoes')
    expect(echo?.input_schema).toMatchObject({ type: 'object' })
    await mgr.dispose()
  })

  it('routes execute() to manager.callTool', async () => {
    const mgr = await newRunningManager()
    const reg = new ToolRegistry()
    await refreshMcpTools(reg, mgr)
    const out = await reg.get('mcp__srv__echo')!.execute({ msg: 'hi' }, noAbort)
    expect(out).toBe('pong:hi')
    await mgr.dispose()
  })

  it('clears stale mcp__ tools before re-registering', async () => {
    const mgr = await newRunningManager()
    const reg = new ToolRegistry()
    // register a fake stale mcp tool
    reg.register({
      name: 'mcp__old__gone',
      description: '',
      input_schema: {},
      async execute() {
        return ''
      },
    })
    expect(reg.has('mcp__old__gone')).toBe(true)
    await refreshMcpTools(reg, mgr)
    expect(reg.has('mcp__old__gone')).toBe(false)
    expect(reg.has('mcp__srv__echo')).toBe(true)
    await mgr.dispose()
  })

  it('preserves non-mcp tools across refresh', async () => {
    const mgr = await newRunningManager()
    const reg = new ToolRegistry()
    reg.register({
      name: 'fs_read',
      description: '',
      input_schema: {},
      async execute() {
        return ''
      },
    })
    await refreshMcpTools(reg, mgr)
    expect(reg.has('fs_read')).toBe(true)
    expect(reg.has('mcp__srv__echo')).toBe(true)
    await mgr.dispose()
  })

  it('requiresApproval=false honoured', async () => {
    const mgr = await newRunningManager()
    const reg = new ToolRegistry()
    await refreshMcpTools(reg, mgr, { requiresApproval: false })
    expect(reg.get('mcp__srv__echo')?.requires_approval).toBe(false)
    await mgr.dispose()
  })

  it('returns 0 when no servers running', async () => {
    const mgr = new McpManager({ baseDir, clientFactory: buildServerFactory() })
    await mgr.addServer({ id: 'idle', name: 'idle', command: 'true' })
    const reg = new ToolRegistry()
    const count = await refreshMcpTools(reg, mgr)
    expect(count).toBe(0)
    expect(reg.definitions()).toEqual([])
    await mgr.dispose()
  })
})
