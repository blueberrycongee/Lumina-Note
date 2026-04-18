// Phase 5.1 smoke test:
// 前端 useRustAgentStore / useVaultStore / src/lib/tauri.ts 实际调用的每个
// agent_, vault_, mcp_ 命令都在这里走一次 dispatchAgentCommand，确认 IPC 路由
// 都接得上且不抛错。语义留给各模块的单测覆盖，这里只做兜底。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AgentEventBus } from './event-bus.js'
import { dispatchAgentCommand, isAgentCommand } from './ipc-dispatch.js'
import { McpManager } from './mcp/manager.js'
import { ProviderSettingsStore } from './providers/settings-store.js'
import { AgentRuntime } from './runtime.js'
import { SkillLoader } from './skills/loader.js'
import type { AgentEvent } from './types.js'

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
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-ipc-smoke-'))
})
afterEach(() => {
  try {
    fs.rmSync(baseDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

const inMemorySecrets = new Map<string, string>()
const secretStore = {
  async get(key: string) {
    return inMemorySecrets.get(key) ?? null
  },
  async set(key: string, value: string) {
    inMemorySecrets.set(key, value)
  },
  async delete(key: string) {
    inMemorySecrets.delete(key)
  },
}

function buildContext() {
  const bus = new RecordingEventBus()
  const runtime = new AgentRuntime({ eventBus: bus })
  const providerSettings = new ProviderSettingsStore({ baseDir, secretStore })
  const skillLoader = new SkillLoader()
  const mcpManager = new McpManager({ baseDir })
  return { bus, ctx: { runtime, providerSettings, skillLoader, mcpManager } }
}

describe('isAgentCommand covers every front-end invoke namespace', () => {
  it('agent_/vault_/mcp_ routed; everything else not', () => {
    const frontendCommands = [
      'agent_start_task',
      'agent_abort',
      'agent_approve_tool',
      'agent_disable_debug',
      'agent_get_status',
      'agent_list_skills',
      'agent_read_skill',
      'vault_initialize',
      'mcp_list_servers',
      'mcp_test_tool',
    ]
    for (const cmd of frontendCommands) {
      expect(isAgentCommand(cmd)).toBe(true)
    }
    expect(isAgentCommand('fs_read')).toBe(false)
    expect(isAgentCommand('webdav_list_remote')).toBe(false)
  })
})

describe('dispatchAgentCommand smoke for front-end commands', () => {
  it('agent_abort returns null without throwing', async () => {
    const { ctx } = buildContext()
    expect(await dispatchAgentCommand(ctx, 'agent_abort', {})).toBeNull()
  })

  it('agent_get_status returns idle initially', async () => {
    const { ctx } = buildContext()
    expect(await dispatchAgentCommand(ctx, 'agent_get_status', {})).toBe('idle')
  })

  it('agent_disable_debug returns null', async () => {
    const { ctx } = buildContext()
    expect(await dispatchAgentCommand(ctx, 'agent_disable_debug', {})).toBeNull()
  })

  it('agent_list_skills returns [] when no .skills dir', async () => {
    const { ctx } = buildContext()
    const out = await dispatchAgentCommand(ctx, 'agent_list_skills', {
      workspace_path: baseDir,
    })
    expect(out).toEqual([])
  })

  it('agent_read_skill returns null when missing', async () => {
    const { ctx } = buildContext()
    const out = await dispatchAgentCommand(ctx, 'agent_read_skill', {
      workspace_path: baseDir,
      name: 'nope',
    })
    expect(out).toBeNull()
  })

  it('vault_initialize returns null', async () => {
    const { ctx } = buildContext()
    expect(
      await dispatchAgentCommand(ctx, 'vault_initialize', { workspacePath: baseDir }),
    ).toBeNull()
  })

  it('agent_get_queue_status returns running=false with empty queue', async () => {
    const { ctx } = buildContext()
    const out = (await dispatchAgentCommand(ctx, 'agent_get_queue_status', {})) as {
      running: boolean
      queued: unknown[]
    }
    expect(out.running).toBe(false)
    expect(out.queued).toEqual([])
  })

  it('agent_start_task without provider configured emits finish(error)', async () => {
    const { ctx, bus } = buildContext()
    await dispatchAgentCommand(ctx, 'agent_start_task', {
      task: 'hello',
      context: { workspace_path: baseDir },
    })
    const finish = bus.events.find((e) => e.type === 'finish') as
      | Extract<AgentEvent, { type: 'finish' }>
      | undefined
    expect(finish?.reason).toBe('error')
  })

  it('agent_get_provider_settings returns shaped object', async () => {
    const { ctx } = buildContext()
    const out = (await dispatchAgentCommand(
      ctx,
      'agent_get_provider_settings',
      {},
    )) as { activeProviderId: string | null; perProvider: Record<string, unknown> }
    expect(out).toMatchObject({
      activeProviderId: null,
      perProvider: {},
    })
  })

  it('mcp_list_servers + mcp_list_tools return arrays', async () => {
    const { ctx } = buildContext()
    expect(await dispatchAgentCommand(ctx, 'mcp_list_servers', {})).toEqual([])
    expect(await dispatchAgentCommand(ctx, 'mcp_list_tools', {})).toEqual([])
  })

  it('unknown command logs warning and returns null', async () => {
    const { ctx } = buildContext()
    expect(
      await dispatchAgentCommand(ctx, 'agent_made_up_thing_for_smoke', {}),
    ).toBeNull()
  })
})
