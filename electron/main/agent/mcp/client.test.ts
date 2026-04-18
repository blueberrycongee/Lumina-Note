import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { McpClient } from './client.js'

async function buildLinkedPair(): Promise<{
  client: McpClient
  server: McpServer
  serverTransport: InMemoryTransport
}> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const server = new McpServer({ name: 'test-server', version: '0.0.1' })
  server.registerTool(
    'echo',
    {
      title: 'Echo',
      description: 'echoes the message',
      inputSchema: { message: z.string() },
    },
    async ({ message }) => ({
      content: [{ type: 'text', text: `pong:${message}` }],
    }),
  )
  await server.connect(serverTransport)

  const client = new McpClient({
    name: 'test-client',
    transport: clientTransport,
  })
  return { client, server, serverTransport }
}

describe('McpClient', () => {
  it('connects, lists tools, calls a tool, and disconnects', async () => {
    const { client, server } = await buildLinkedPair()
    expect(client.status).toBe('idle')

    await client.connect()
    expect(client.status).toBe('running')

    const tools = await client.listTools()
    expect(tools).toHaveLength(1)
    expect(tools[0].name).toBe('echo')
    expect(tools[0].description).toBe('echoes the message')
    expect(tools[0].inputSchema).toMatchObject({ type: 'object' })

    const out = await client.callTool('echo', { message: 'hi' })
    expect(out).toBe('pong:hi')

    await client.disconnect()
    expect(client.status).toBe('stopped')

    await server.close()
  })

  it('throws when calling tools before connect', async () => {
    const client = new McpClient({
      name: 'never-connected',
      transport: InMemoryTransport.createLinkedPair()[0],
    })
    await expect(client.listTools()).rejects.toThrow(/not connected/)
    await expect(client.callTool('any')).rejects.toThrow(/not connected/)
  })

  it('throws on connect without stdio config or transport', async () => {
    const client = new McpClient({ name: 'broken' })
    await expect(client.connect()).rejects.toThrow(/no stdio config or transport/)
    expect(client.status).toBe('error')
    expect(client.lastError).toContain('no stdio config or transport')
  })

  it('reports error from MCP tool with isError=true', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const server = new McpServer({ name: 'errsrv', version: '0.0.1' })
    server.registerTool(
      'fail',
      { description: 'always fails', inputSchema: {} },
      async () => ({
        isError: true,
        content: [{ type: 'text', text: 'oh no' }],
      }),
    )
    await server.connect(serverTransport)
    const client = new McpClient({ name: 'c', transport: clientTransport })
    await client.connect()
    const result = await client.callTool('fail')
    expect(result).toContain('MCP tool error')
    expect(result).toContain('oh no')
    await client.disconnect()
    await server.close()
  })

  it('caches listTools result and refreshes on forceRefresh', async () => {
    const { client, server } = await buildLinkedPair()
    await client.connect()
    const a = await client.listTools()
    const b = await client.listTools()
    expect(a).toBe(b) // same cached reference
    const c = await client.listTools(true)
    expect(c).not.toBe(a)
    expect(c).toEqual(a)
    await client.disconnect()
    await server.close()
  })

  it('exposes a stderr Readable even before connect', () => {
    const client = new McpClient({ name: 'x', stdio: { command: 'true' } })
    const stream = client.stderr
    expect(typeof stream.on).toBe('function')
  })
})
