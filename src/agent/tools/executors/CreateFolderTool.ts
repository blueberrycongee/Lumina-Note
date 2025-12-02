/**
 * create_folder 工具执行器
 */

import { ToolExecutor, ToolResult, ToolContext } from "../../types";
import { exists, createDir } from "@/lib/tauri";
import { join } from "@/lib/path";

export const CreateFolderTool: ToolExecutor = {
  name: "create_folder",
  requiresApproval: true, // 写操作，需要审批

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const path = params.path as string;

    if (!path) {
      return {
        success: false,
        content: "",
        error: `参数错误: 缺少 path 参数。

正确用法:
<create_folder>
<path>新目录路径</path>
</create_folder>`,
      };
    }

    try {
      const fullPath = join(context.workspacePath, path);

      // 检查目录是否已存在
      if (await exists(fullPath)) {
        return {
          success: false,
          content: "",
          error: `目录已存在: ${path}`,
        };
      }

      // 创建目录
      await createDir(fullPath, { recursive: true });

      return {
        success: true,
        content: `已创建目录: ${path}`,
      };
    } catch (error) {
      return {
        success: false,
        content: "",
        error: `创建目录失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  },
};
