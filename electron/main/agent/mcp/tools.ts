/**
 * 把 McpManager 暴露的工具注册成内部 Tool,塞进 ToolRegistry。
 *
 * 工具 name 用 manager 的 mcp__<serverId>__<toolName> 前缀,避免和内建
 * 工具冲突。requires_approval 默认 true(MCP 工具是外部进程,执行什么不可预知)。
 *
 * 调用流程:
 *   refreshMcpTools(registry, manager) → 清掉 registry 中所有 mcp__ 开头的 tool,
 *   再按 manager.listAllTools() 重新注册。runtime.start 之前调一次即可。
 */

import type { Tool, ToolRegistry } from '../tool-registry.js'
import type { McpManager } from './manager.js'

const MCP_PREFIX = 'mcp__'

export interface RefreshMcpToolsOptions {
  /** 默认 true;若想全自动放行,自己决定后传 false */
  requiresApproval?: boolean
}

/** 把 manager 当前的 tools 同步进 registry,返回注册了几个 */
export async function refreshMcpTools(
  registry: ToolRegistry,
  manager: McpManager,
  options: RefreshMcpToolsOptions = {},
): Promise<number> {
  // 删除旧的 mcp__* 工具
  for (const def of registry.definitions()) {
    if (def.name.startsWith(MCP_PREFIX)) registry.unregister(def.name)
  }
  const tools = await manager.listAllTools()
  const requiresApproval = options.requiresApproval ?? true
  for (const t of tools) {
    registry.register(buildMcpTool(manager, t, requiresApproval))
  }
  return tools.length
}

function buildMcpTool(
  manager: McpManager,
  tool: { prefixedName: string; name: string; description?: string; inputSchema: Record<string, unknown> },
  requiresApproval: boolean,
): Tool {
  return {
    name: tool.prefixedName,
    description: tool.description ?? `MCP tool ${tool.name}`,
    input_schema: tool.inputSchema,
    requires_approval: requiresApproval,
    async execute(input) {
      return manager.callTool(tool.prefixedName, input)
    },
  }
}

export const __MCP_PREFIX_FOR_TEST = MCP_PREFIX
