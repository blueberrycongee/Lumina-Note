/**
 * delete_note 工具执行器
 * 删除指定笔记文件
 */

import { ToolExecutor, ToolResult, ToolContext } from "../../types";
import { deleteFile, exists } from "@/lib/tauri";
import { useFileStore } from "@/stores/useFileStore";
import { join, resolve } from "@/lib/path";

export const DeleteNoteTool: ToolExecutor = {
  name: "delete_note",
  requiresApproval: false, // 移动到回收站，无需审批

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const path = params.path as string;

    if (!path || typeof path !== "string") {
      return {
        success: false,
        content: "",
        error: "参数错误: path 必须是非空字符串",
      };
    }

    try {
      // 构建完整路径
      const fullPath = resolve(context.workspacePath, path);

      // 检查文件是否存在
      const fileExists = await exists(fullPath);
      if (!fileExists) {
        return {
          success: false,
          content: "",
          error: `文件不存在: ${path}`,
        };
      }

      // 执行删除
      await deleteFile(fullPath);

      // 延迟刷新文件树，避免在 Agent 运行时触发 UI 重渲染
      setTimeout(() => {
        useFileStore.getState().refreshFileTree();
      }, 100);

      // 如果删除的文件正在打开，关闭它
      const { tabs, closeTab } = useFileStore.getState();
      const tabIndex = tabs.findIndex((t) => t.path === fullPath || t.path === path);
      if (tabIndex !== -1) {
        await closeTab(tabIndex);
      }

      return {
        success: true,
        content: `已删除笔记: ${path}`,
      };
    } catch (error) {
      return {
        success: false,
        content: "",
        error: `删除失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  },
};
