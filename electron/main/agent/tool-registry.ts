/**
 * ToolRegistry — agent 可调用的工具集合。
 *
 * Phase 1.3 只建立接口和空实现,Phase 3 会填进 FS / shell / MCP 工具。
 */

import type { ToolDefinition } from './types.js'

export interface Tool {
  name: string
  description: string
  input_schema: Record<string, unknown>
  /** 是否需要用户审批才能执行 (允许列表除外) */
  requires_approval?: boolean
  execute(input: Record<string, unknown>, signal: AbortSignal): Promise<string>
}

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>()

  register(tool: Tool): void {
    this.tools.set(tool.name, tool)
  }

  unregister(name: string): void {
    this.tools.delete(name)
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  definitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema,
    }))
  }

  clear(): void {
    this.tools.clear()
  }
}
