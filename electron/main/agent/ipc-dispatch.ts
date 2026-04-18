/**
 * Agent / Vault 命令的字符串路由。
 *
 * 前端 useRustAgentStore 仍在调 `invoke('agent_start_task' | 'agent_abort' | ...)`,
 * preload 把这些通过 tauri-invoke channel 送到 main 的 ipc.ts 路由器。
 * 这里提供 dispatch 函数,让 ipc.ts 可以把 agent_* / vault_* 前缀命令交给 runtime 处理。
 *
 * Phase 1.2 阶段 runtime 是骨架(start 直接 emit error finish),多数命令返回占位值,
 * 前端行为与 Phase 0.4/0.4b 之后一致(runtime no-op)。后续 1.3/1.4/1.5/1.6 逐步填实。
 */

import type { DebugLog } from './debug-log.js'
import type { ProviderId, ProviderSettings } from './providers/registry.js'
import { hasProvider } from './providers/registry.js'
import type {
  ProviderPersistedSettings,
  ProviderSettingsStore,
} from './providers/settings-store.js'
import { testProviderConnection } from './providers/test-connection.js'
import type { AgentRuntime } from './runtime.js'
import type { McpManager } from './mcp/manager.js'
import type { SkillLoader } from './skills/loader.js'
import type {
  ApprovalDecision,
  ApproveToolRequest,
  StartTaskRequest,
} from './types.js'
import type { WikiManager } from '../wiki/manager.js'
import type { WikiSettings, WikiSettingsStore } from '../wiki/settings-store.js'

/**
 * 解析 agent_approve_tool 的入参,兼容新旧 schema:
 *   - 新: { tool_call_id, decision: 'approve'|'reject', reason? }
 *   - 旧 Rust 时代: { requestId | request_id, approved: boolean }
 * 旧 store 仍在用 requestId/approved,Phase 5 会改 UI;在那之前两种都接受。
 */
function parseApproveToolArgs(args: Record<string, unknown>): {
  toolCallId: string
  decision: ApprovalDecision
  reason?: string
} | null {
  const newShape = args as Partial<ApproveToolRequest>
  if (typeof newShape.tool_call_id === 'string' && newShape.decision) {
    return {
      toolCallId: newShape.tool_call_id,
      decision: newShape.decision,
      reason: newShape.reason,
    }
  }
  const legacy = args as {
    requestId?: string
    request_id?: string
    approved?: boolean
    reason?: string
  }
  const id = legacy.requestId ?? legacy.request_id
  if (typeof id === 'string' && typeof legacy.approved === 'boolean') {
    return {
      toolCallId: id,
      decision: legacy.approved ? 'approve' : 'reject',
      reason: legacy.reason,
    }
  }
  return null
}

export interface AgentDispatchContext {
  runtime: AgentRuntime
  debugLog?: DebugLog
  providerSettings?: ProviderSettingsStore
  skillLoader?: SkillLoader
  mcpManager?: McpManager
  wikiSettings?: WikiSettingsStore
  wikiManager?: WikiManager
}

export function isAgentCommand(cmd: string): boolean {
  return (
    cmd.startsWith('agent_') ||
    cmd.startsWith('vault_') ||
    cmd.startsWith('mcp_') ||
    cmd.startsWith('wiki_')
  )
}

export async function dispatchAgentCommand(
  ctx: AgentDispatchContext,
  cmd: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const {
    runtime,
    debugLog,
    providerSettings,
    skillLoader,
    mcpManager,
    wikiSettings,
    wikiManager,
  } = ctx
  switch (cmd) {
    case 'agent_start_task': {
      const payload = args as unknown as StartTaskRequest
      return runtime.start(payload.task, payload.context)
    }
    case 'agent_abort':
      runtime.abort()
      return null

    case 'agent_approve_tool': {
      const parsed = parseApproveToolArgs(args)
      if (!parsed) {
        throw new Error(
          'agent_approve_tool: expected { tool_call_id, decision } or legacy { requestId, approved }',
        )
      }
      runtime.approveTool(parsed.toolCallId, parsed.decision, parsed.reason)
      return null
    }
    case 'agent_continue_with_answer': {
      const { answer } = args as { answer?: string }
      runtime.continueWithAnswer(answer ?? '')
      return null
    }

    case 'agent_get_status':
      return runtime.getStatus()

    case 'agent_get_queue_status':
      return {
        running: runtime.getStatus() === 'running',
        queued: [] as unknown[],
      }

    // Debug logging
    case 'agent_enable_debug': {
      if (!debugLog) return null
      const workspacePath =
        typeof args.workspace_path === 'string' ? args.workspace_path : undefined
      return debugLog.enable({ workspacePath })
    }
    case 'agent_disable_debug': {
      debugLog?.disable()
      return null
    }
    case 'agent_is_debug_enabled':
      return debugLog?.isEnabled() ?? false
    case 'agent_get_debug_log_path':
      return debugLog?.getFilePath() ?? null

    // Provider settings (Phase 2.7)
    case 'agent_get_provider_settings': {
      if (!providerSettings) return null
      return providerSettings.getAll()
    }
    case 'agent_set_active_provider': {
      if (!providerSettings) return null
      const { provider_id } = args as { provider_id?: string }
      if (provider_id === null || provider_id === undefined) {
        providerSettings.setActiveProvider(null)
        return null
      }
      if (!hasProvider(provider_id)) {
        throw new Error(`Unknown provider: ${provider_id}`)
      }
      providerSettings.setActiveProvider(provider_id)
      return null
    }
    case 'agent_set_provider_settings': {
      if (!providerSettings) return null
      const { provider_id, settings } = args as {
        provider_id?: string
        settings?: ProviderPersistedSettings
      }
      if (!provider_id || !hasProvider(provider_id)) {
        throw new Error(`Unknown provider: ${provider_id}`)
      }
      providerSettings.setProviderSettings(
        provider_id as ProviderId,
        settings ?? {},
      )
      return null
    }
    case 'agent_set_provider_api_key': {
      if (!providerSettings) return null
      const { provider_id, api_key } = args as {
        provider_id?: string
        api_key?: string
      }
      if (!provider_id || !hasProvider(provider_id)) {
        throw new Error(`Unknown provider: ${provider_id}`)
      }
      if (api_key === undefined || api_key === null || api_key === '') {
        await providerSettings.deleteProviderApiKey(provider_id as ProviderId)
      } else {
        await providerSettings.setProviderApiKey(provider_id as ProviderId, api_key)
      }
      return null
    }
    case 'agent_has_provider_api_key': {
      if (!providerSettings) return false
      const { provider_id } = args as { provider_id?: string }
      if (!provider_id || !hasProvider(provider_id)) return false
      const key = await providerSettings.getProviderApiKey(provider_id as ProviderId)
      return typeof key === 'string' && key.length > 0
    }

    case 'agent_test_provider': {
      const { provider_id, model_id, settings } = args as {
        provider_id?: string
        model_id?: string
        settings?: ProviderSettings
      }
      if (!provider_id || !hasProvider(provider_id)) {
        return { success: false, error: `Unknown provider: ${provider_id ?? 'null'}` }
      }
      return testProviderConnection(
        provider_id as ProviderId,
        model_id ?? '',
        settings ?? {},
      )
    }

    // Skills — Phase 3.4 SkillLoader
    case 'agent_list_skills': {
      if (!skillLoader) return []
      const { workspace_path } = args as { workspace_path?: string }
      if (!workspace_path) return []
      return skillLoader.listSkills(workspace_path)
    }
    case 'agent_read_skill': {
      if (!skillLoader) return null
      const { name, workspace_path } = args as {
        name?: string
        workspace_path?: string
      }
      if (!name || !workspace_path) return null
      const detail = await skillLoader.readSkill(workspace_path, name)
      if (!detail) return null
      // Renderer expects SkillDetail = { info, prompt, markdown }
      return detail
    }

    // Vault — Phase 6 接入 wiki/vault 管理
    case 'vault_initialize':
      return null
    case 'vault_load_index':
      return ''
    case 'vault_run_lint':
      return {
        total_files: 0,
        lint_issues: [] as unknown[],
        coverage_ratio: 0,
      }

    // MCP — Phase 4.4 server 管理
    case 'mcp_list_servers': {
      if (!mcpManager) return []
      return mcpManager.listServers()
    }
    case 'mcp_get_server_status': {
      if (!mcpManager) return null
      const { id } = args as { id?: string }
      if (!id) return null
      return mcpManager.getServer(id)
    }
    case 'mcp_add_server': {
      if (!mcpManager) {
        throw new Error('mcp_add_server: McpManager not configured')
      }
      const { config } = args as {
        config?: Parameters<McpManager['addServer']>[0]
      }
      if (!config?.id) {
        throw new Error('mcp_add_server: missing config.id')
      }
      return mcpManager.addServer(config)
    }
    case 'mcp_update_server': {
      if (!mcpManager) {
        throw new Error('mcp_update_server: McpManager not configured')
      }
      const { id, patch } = args as {
        id?: string
        patch?: Parameters<McpManager['updateServer']>[1]
      }
      if (!id || !patch) {
        throw new Error('mcp_update_server: missing id or patch')
      }
      return mcpManager.updateServer(id, patch)
    }
    case 'mcp_remove_server': {
      if (!mcpManager) return null
      const { id } = args as { id?: string }
      if (!id) return null
      await mcpManager.removeServer(id)
      return null
    }
    case 'mcp_start_server': {
      if (!mcpManager) return null
      const { id } = args as { id?: string }
      if (!id) return null
      try {
        await mcpManager.startServer(id)
        return mcpManager.getServer(id)
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    }
    case 'mcp_stop_server': {
      if (!mcpManager) return null
      const { id } = args as { id?: string }
      if (!id) return null
      await mcpManager.stopServer(id)
      return mcpManager.getServer(id)
    }
    case 'mcp_restart_server': {
      if (!mcpManager) return null
      const { id } = args as { id?: string }
      if (!id) return null
      try {
        await mcpManager.restartServer(id)
        return mcpManager.getServer(id)
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    }
    case 'mcp_list_tools': {
      if (!mcpManager) return []
      return mcpManager.listAllTools()
    }
    case 'mcp_test_tool': {
      if (!mcpManager) {
        throw new Error('mcp_test_tool: McpManager not configured')
      }
      const { name, arguments: toolArgs } = args as {
        name?: string
        arguments?: Record<string, unknown>
      }
      if (!name) throw new Error('mcp_test_tool: missing name')
      try {
        const result = await mcpManager.callTool(name, toolArgs ?? {})
        return { ok: true, result }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    }
    case 'mcp_get_server_logs': {
      if (!mcpManager) return []
      const { id } = args as { id?: string }
      if (!id) return []
      const info = mcpManager.getServer(id)
      return info?.recentStderr ?? []
    }

    // Wiki settings — Phase 6.4
    case 'wiki_get_settings': {
      if (!wikiSettings) return null
      return wikiSettings.get()
    }
    case 'wiki_set_settings': {
      if (!wikiSettings) return null
      const { settings } = args as { settings?: Partial<WikiSettings> }
      return wikiSettings.set(settings ?? {})
    }
    case 'wiki_reset_settings': {
      if (!wikiSettings) return null
      return wikiSettings.reset()
    }

    // Wiki manager — Phase 6.5
    case 'wiki_bind': {
      if (!wikiManager) return null
      const { vault_path } = args as { vault_path?: string }
      if (!vault_path) {
        throw new Error('wiki_bind: missing vault_path')
      }
      await wikiManager.bind(vault_path)
      await wikiManager.start()
      return null
    }
    case 'wiki_rebuild': {
      if (!wikiManager) return { ok: false, error: 'wiki manager not configured' }
      try {
        const count = await wikiManager.rebuild()
        return { ok: true, marked: count }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    }
    case 'wiki_synthesize_note': {
      if (!wikiManager) return { ok: false, error: 'wiki manager not configured' }
      const { rel_path } = args as { rel_path?: string }
      if (!rel_path) {
        return { ok: false, error: 'wiki_synthesize_note: missing rel_path' }
      }
      try {
        return await wikiManager.synthesizeNote(rel_path)
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    }
    case 'wiki_stop': {
      if (!wikiManager) return null
      await wikiManager.stop()
      return null
    }

    default:
      console.warn(`[agent:ipc-dispatch] unhandled command: ${cmd}`)
      return null
  }
}
