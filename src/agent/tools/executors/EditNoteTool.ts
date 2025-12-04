/**
 * edit_note 工具执行器
 */

import { ToolExecutor, ToolResult, ToolContext } from "../../types";
import { readFile } from "@/lib/tauri";
import { join, resolve } from "@/lib/path";
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

    // 兼容多种参数格式
    let edits: EditOperation[] = [];

    if (Array.isArray(params.edits) && params.edits.length > 0) {
      // 标准格式: edits: [{search, replace}]
      edits = params.edits as EditOperation[];
    } else if (params.search && params.replace !== undefined) {
      // 兼容格式1: search + replace 作为独立参数
      edits = [{ search: params.search as string, replace: params.replace as string }];
      console.log("[EditNoteTool] 参数兼容: search/replace → edits[]");
    } else if (params.old_text && params.new_text !== undefined) {
      // 兼容格式2: old_text + new_text
      edits = [{ search: params.old_text as string, replace: params.new_text as string }];
      console.log("[EditNoteTool] 参数兼容: old_text/new_text → edits[]");
    } else if (params.find && params.replace !== undefined) {
      // 兼容格式3: find + replace
      edits = [{ search: params.find as string, replace: params.replace as string }];
      console.log("[EditNoteTool] 参数兼容: find/replace → edits[]");
    } else if (params.content && typeof params.content === "string") {
      // 兼容格式4: 直接给 content（追加模式，需要先读取原内容）
      // 这种情况需要特殊处理，暂时返回错误提示
      return {
        success: false,
        content: "",
        error: "参数错误: edit_note 需要 search/replace 对来精确修改。如需追加内容，请提供 search（文件末尾内容）和 replace（末尾内容+新内容）",
      };
    }

    if (!path) {
      return {
        success: false,
        content: "",
        error: `参数错误: 缺少 path 参数。

正确用法:
<edit_note>
<path>笔记路径.md</path>
<edits>[{"search": "要替换的原文", "replace": "替换后的新内容"}]</edits>
</edit_note>

请先用 read_note 读取文件，然后从读取结果中复制要修改的原文到 search 字段。`,
      };
    }

    if (edits.length === 0) {
      return {
        success: false,
        content: "",
        error: `参数错误: 缺少编辑内容。

正确用法:
<edit_note>
<path>${path}</path>
<edits>[{"search": "要替换的原文", "replace": "替换后的新内容"}]</edits>
</edit_note>

或者使用简化格式:
<edit_note>
<path>${path}</path>
<search>要替换的原文</search>
<replace>替换后的新内容</replace>
</edit_note>

注意: search 内容必须与文件中的内容完全一致！请先用 read_note 读取文件确认内容。`,
      };
    }

    try {
      const fullPath = resolve(context.workspacePath, path);
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
            // 提供更有用的错误信息
            const searchPreview = edit.search.length > 50
              ? edit.search.substring(0, 50) + "..."
              : edit.search;
            failedEdits.push(
              `编辑 ${i + 1}: 未找到匹配内容 "${searchPreview}"
提示: 请先用 read_note 读取 ${path}，然后从返回内容中精确复制要修改的部分到 search 字段。
注意空格、换行、标点必须完全一致。`
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
