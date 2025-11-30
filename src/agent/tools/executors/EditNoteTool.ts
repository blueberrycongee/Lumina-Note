/**
 * edit_note 工具执行器
 */

import { ToolExecutor, ToolResult, ToolContext } from "../../types";
import { readFile } from "@/lib/tauri";
import { join } from "@/lib/path";
import { useAIStore } from "@/stores/useAIStore";

interface EditOperation {
  search: string;
  replace: string;
}

export const EditNoteTool: ToolExecutor = {
  name: "edit_note",
  requiresApproval: false, // 通过 DiffView 确认，不需要单独审批

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const path = params.path as string;
    const edits = params.edits as EditOperation[];

    if (!path) {
      return {
        success: false,
        content: "",
        error: "参数错误: 缺少 path 参数",
      };
    }

    if (!Array.isArray(edits) || edits.length === 0) {
      return {
        success: false,
        content: "",
        error: "参数错误: edits 必须是非空数组",
      };
    }

    try {
      const fullPath = join(context.workspacePath, path);
      let content = await readFile(fullPath);
      
      // 保存原始内容用于实时预览
      const oldContent = content;

      const appliedEdits: string[] = [];
      const failedEdits: string[] = [];

      for (let i = 0; i < edits.length; i++) {
        const edit = edits[i];

        if (!edit.search || edit.replace === undefined) {
          failedEdits.push(`编辑 ${i + 1}: 缺少 search 或 replace`);
          continue;
        }

        // 尝试精确匹配
        if (content.includes(edit.search)) {
          content = content.replace(edit.search, edit.replace);
          appliedEdits.push(`编辑 ${i + 1}: 成功`);
        } else {
          // 尝试规范化空白后匹配
          const normalizedContent = content.replace(/\r\n/g, "\n");
          const normalizedSearch = edit.search.replace(/\r\n/g, "\n");

          if (normalizedContent.includes(normalizedSearch)) {
            content = normalizedContent.replace(normalizedSearch, edit.replace);
            appliedEdits.push(`编辑 ${i + 1}: 成功 (规范化匹配)`);
          } else {
            failedEdits.push(
              `编辑 ${i + 1}: 未找到匹配内容。请确保 search 内容与文件完全一致。`
            );
          }
        }
      }

      if (appliedEdits.length > 0) {
        // 不直接写入文件，通过 DiffView 让用户确认
        const fileName = path.split(/[/\\]/).pop() || path;
        
        // 设置 pendingDiff，复用 Chat 模式的 DiffView
        const { setPendingDiff, setDiffResolver } = useAIStore.getState();
        
        // 创建 Promise 等待用户确认
        const confirmation = new Promise<boolean>((resolve) => {
          setDiffResolver(resolve);
        });

        setPendingDiff({
          fileName,
          filePath: fullPath,
          original: oldContent,
          modified: content,
          description: `Agent 编辑: ${appliedEdits.length} 处修改`,
        });

        // 等待用户确认
        const approved = await confirmation;
        
        // 清理 resolver
        setDiffResolver(null);

        if (approved) {
          const summary = [
            `文件: ${path}`,
            `已生成 ${appliedEdits.length} 处修改，用户已确认并保存。`,
            ...appliedEdits,
          ];

          if (failedEdits.length > 0) {
            summary.push(`失败: ${failedEdits.length} 处`, ...failedEdits);
          }

          return {
            success: true,
            content: summary.join("\n"),
          };
        } else {
          return {
            success: false,
            content: "用户拒绝了修改建议。",
            error: "用户拒绝了修改",
          };
        }
      } else {
        return {
          success: false,
          content: "",
          error: `所有编辑都失败了:\n${failedEdits.join("\n")}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        content: "",
        error: `编辑文件失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  },
};
