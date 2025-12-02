/**
 * 工具注册表
 * 
 * 管理所有可用的工具及其执行器
 */

import { ToolExecutor, ToolResult, ToolContext } from "../types";

// 导入工具执行器
import { ReadNoteTool } from "./executors/ReadNoteTool";
import { EditNoteTool } from "./executors/EditNoteTool";
import { CreateNoteTool } from "./executors/CreateNoteTool";
import { ListNotesTool } from "./executors/ListNotesTool";
import { CreateFolderTool } from "./executors/CreateFolderTool";
import { MoveFileTool } from "./executors/MoveFileTool";
import { RenameFileTool } from "./executors/RenameFileTool";
import { SearchNotesTool } from "./executors/SearchNotesTool";
import { AttemptCompletionTool } from "./executors/AttemptCompletionTool";
import { DeleteNoteTool } from "./executors/DeleteNoteTool";
import { GrepSearchTool } from "./executors/GrepSearchTool";
import { SemanticSearchTool } from "./executors/SemanticSearchTool";
import { QueryDatabaseTool } from "./executors/QueryDatabaseTool";
import { AddDatabaseRowTool } from "./executors/AddDatabaseRowTool";
import { GetBacklinksTool } from "./executors/GetBacklinksTool";
import { AskUserTool } from "./executors/AskUserTool";

export class ToolRegistry {
  private tools: Map<string, ToolExecutor> = new Map();

  constructor() {
    this.registerDefaultTools();
  }

  /**
   * 注册默认工具
   */
  private registerDefaultTools(): void {
    // 基础笔记操作
    this.register(ReadNoteTool);
    this.register(EditNoteTool);
    this.register(CreateNoteTool);
    this.register(ListNotesTool);
    this.register(CreateFolderTool);
    this.register(MoveFileTool);
    this.register(RenameFileTool);
    this.register(DeleteNoteTool);
    
    // 搜索工具
    this.register(SearchNotesTool);
    this.register(GrepSearchTool);
    this.register(SemanticSearchTool);
    
    // 数据库工具
    this.register(QueryDatabaseTool);
    this.register(AddDatabaseRowTool);
    
    // 知识图谱工具
    this.register(GetBacklinksTool);
    
    // 交互工具
    this.register(AskUserTool);
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
        error: `未知工具: ${name}

可用的工具列表:
- read_note: 读取笔记内容
- edit_note: 编辑笔记（使用 search/replace）
- create_note: 创建新笔记
- delete_note: 删除笔记
- list_notes: 列出目录下的笔记
- create_folder: 创建新目录
- move_file: 移动文件/笔记
- rename_file: 重命名文件/笔记
- search_notes: 语义搜索笔记
- grep_search: 全文搜索（支持正则）
- attempt_completion: 完成任务

请使用上述工具名，不要使用其他名称如 append_note、write_note 等。`,
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
