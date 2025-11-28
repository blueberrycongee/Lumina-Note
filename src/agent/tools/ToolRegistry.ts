/**
 * 工具注册表
 * 
 * 管理所有可用的工具及其执行器
 */

import { ToolExecutor, ToolResult, ToolContext } from "../types";

// 导入工具执行器
import { ReadNoteTool } from "./executors/ReadNoteTool";
import { EditNoteTool } from "./executors/EditNoteTool";
import { WriteNoteTool } from "./executors/WriteNoteTool";
import { ListNotesTool } from "./executors/ListNotesTool";
import { MoveNoteTool } from "./executors/MoveNoteTool";
import { SearchNotesTool } from "./executors/SearchNotesTool";
import { AttemptCompletionTool } from "./executors/AttemptCompletionTool";

export class ToolRegistry {
  private tools: Map<string, ToolExecutor> = new Map();

  constructor() {
    this.registerDefaultTools();
  }

  /**
   * 注册默认工具
   */
  private registerDefaultTools(): void {
    this.register(ReadNoteTool);
    this.register(EditNoteTool);
    this.register(WriteNoteTool);
    this.register(ListNotesTool);
    this.register(MoveNoteTool);
    this.register(SearchNotesTool);
    this.register(AttemptCompletionTool);
  }

  /**
   * 注册工具
   */
  register(tool: ToolExecutor): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * 获取工具
   */
  get(name: string): ToolExecutor | undefined {
    return this.tools.get(name);
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 检查工具是否需要审批
   */
  requiresApproval(name: string): boolean {
    const tool = this.tools.get(name);
    return tool?.requiresApproval ?? true; // 默认需要审批
  }

  /**
   * 执行工具
   */
  async execute(
    name: string,
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        success: false,
        content: "",
        error: `未知工具: ${name}`,
      };
    }

    try {
      return await tool.execute(params, context);
    } catch (error) {
      return {
        success: false,
        content: "",
        error: `工具执行失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  }

  /**
   * 获取所有已注册的工具名称
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }
}
