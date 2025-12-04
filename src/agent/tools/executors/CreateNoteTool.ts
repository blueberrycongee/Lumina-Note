/**
 * create_note 工具执行器
 * 创建新的笔记文件
 */

import { ToolExecutor, ToolResult, ToolContext } from "../../types";
import { writeFile, exists, createDir } from "@/lib/tauri";
import { join, dirname, resolve } from "@/lib/path";
import { useFileStore } from "@/stores/useFileStore";

export const CreateNoteTool: ToolExecutor = {
  name: "create_note",
  requiresApproval: true, // 写操作，需要审批

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    let path = params.path;
    const content = params.content as string;

    // 兼容数组格式 (LLM 有时会输出 ["path"])
    if (Array.isArray(path)) {
      path = path[0];
      console.log("[CreateNoteTool] 参数兼容: path[] → path");
    }

    if (!path || typeof path !== "string") {
      return {
        success: false,
        content: "",
        error: `参数错误: path 必须是字符串。

正确用法:
<create_note>
<path>笔记路径.md</path>
<content>...</content>
</create_note>`,
      };
    }

    if (content === undefined) {
      return {
        success: false,
        content: "",
        error: `参数错误: 缺少 content 参数。

正确用法:
<create_note>
<path>${path}</path>
<content># 笔记标题

笔记内容...</content>
</create_note>`,
      };
    }

    try {
      const fullPath = resolve(context.workspacePath, path);
      const dir = dirname(fullPath);

      // 确保目录存在
      if (!(await exists(dir))) {
        await createDir(dir, { recursive: true });
      }

      const fileExisted = await exists(fullPath);

      // 写入文件
      await writeFile(fullPath, content);

      // 延迟刷新文件树，避免在 Agent 运行时触发 UI 重渲染
      setTimeout(() => {
        useFileStore.getState().refreshFileTree();
      }, 100);

      return {
        success: true,
        content: fileExisted
          ? `已覆盖文件: ${path}`
          : `已创建文件: ${path}`,
      };
    } catch (error) {
      return {
        success: false,
        content: "",
        error: `创建文件失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  },
};
