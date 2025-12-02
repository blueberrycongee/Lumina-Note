/**
 * rename_file 工具执行器
 */

import { ToolExecutor, ToolResult, ToolContext } from "../../types";
import { exists, rename } from "@/lib/tauri";
import { join, dirname } from "@/lib/path";

export const RenameFileTool: ToolExecutor = {
  name: "rename_file",
  requiresApproval: true,

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const path = params.path as string;
    const newName = params.new_name as string;

    if (!path || !newName) {
      return {
        success: false,
        content: "",
        error: `参数错误: 缺少 path 或 new_name 参数。

正确用法:
<rename_file>
<path>路径/旧文件名.ext</path>
<new_name>新文件名.ext</new_name>
</rename_file>`,
      };
    }

    if (newName.includes("/") || newName.includes("\\")) {
      return {
        success: false,
        content: "",
        error: `参数错误: new_name 不能包含路径分隔符。如果要移动文件，请使用 move_file。`,
      };
    }

    try {
      const fullPath = join(context.workspacePath, path);
      const dir = dirname(fullPath);
      const newFullPath = join(dir, newName);

      // 检查源文件是否存在
      if (!(await exists(fullPath))) {
        return {
          success: false,
          content: "",
          error: `文件不存在: ${path}`,
        };
      }

      // 检查目标文件是否已存在
      if (await exists(newFullPath)) {
        return {
          success: false,
          content: "",
          error: `目标文件名已存在: ${newName}`,
        };
      }

      // 执行重命名
      await rename(fullPath, newFullPath);

      return {
        success: true,
        content: `已重命名: ${path} -> ${newName}`,
      };
    } catch (error) {
      return {
        success: false,
        content: "",
        error: `重命名失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  },
};
