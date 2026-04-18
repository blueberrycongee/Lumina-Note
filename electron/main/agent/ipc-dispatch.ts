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

import type { AgentRuntime } from './runtime.js'
import type {
  ApproveToolRequest,
  StartTaskRequest,
} from './types.js'

export function isAgentCommand(cmd: string): boolean {
  return cmd.startsWith('agent_') || cmd.startsWith('vault_')
}

export async function dispatchAgentCommand(
  runtime: AgentRuntime,
  cmd: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (cmd) {
    case 'agent_start_task': {
      const payload = args as unknown as StartTaskRequest
      return runtime.start(payload.task, payload.context)
    }
    case 'agent_abort':
      runtime.abort()
      return null

    case 'agent_approve_tool': {
      const payload = args as unknown as ApproveToolRequest
      runtime.approveTool(payload.tool_call_id, payload.decision, payload.reason)
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

    // Debug logging — Phase 1.5 接入 DebugLog
    case 'agent_enable_debug':
    case 'agent_disable_debug':
      return null
    case 'agent_is_debug_enabled':
      return false
    case 'agent_get_debug_log_path':
      return null

    // Skills — Phase 3.4 接入 SkillLoader
    case 'agent_list_skills':
      return []
    case 'agent_read_skill':
      return { name: '', content: '', path: '' }

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

    default:
      console.warn(`[agent:ipc-dispatch] unhandled command: ${cmd}`)
      return null
  }
}
