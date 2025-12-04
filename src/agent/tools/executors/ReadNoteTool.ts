/**
 * read_note 工具执行器
 */

import { ToolExecutor, ToolResult, ToolContext } from "../../types";
import { readFile } from "@/lib/tauri";
import { join, resolve } from "@/lib/path";

export const ReadNoteTool: ToolExecutor = {
  name: "read_note",
  requiresApproval: false, // 只读操作，不需要审批

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    // 支持两种格式：path (单个字符串) 或 paths (数组)
    let paths: string[] = [];

    if (params.paths) {
      // paths 参数
      if (Array.isArray(params.paths)) {
        paths = params.paths as string[];
      } else if (typeof params.paths === "string") {
        // 可能是 JSON 字符串或单个路径
        try {
          const parsed = JSON.parse(params.paths as string);
          paths = Array.isArray(parsed) ? parsed : [params.paths as string];
        } catch {
          paths = [params.paths as string];
        }
      }
    } else if (params.path) {
      // path 参数（单个）
      paths = [params.path as string];
    }

    if (paths.length === 0) {
      return {
        success: false,
        content: "",
        error: `参数错误: 缺少 path 参数。

正确用法:
<read_note>
<path>笔记路径.md</path>
</read_note>

读取多个文件:
<read_note>
<paths>["文件1.md", "文件2.md"]</paths>
</read_note>

提示: 路径相对于笔记库根目录。`,
      };
    }

    const results: string[] = [];

    for (const relativePath of paths) {
      try {
        // 允许两种用法：
        // 1) 相对路径（相对于 workspacePath）
        // 2) 绝对路径（直接使用，不再拼接 workspacePath）
        const fullPath = resolve(context.workspacePath, relativePath);
        const content = await readFile(fullPath);

        // 添加行号
        const lines = content.split("\n");
        const numberedContent = lines
          .map((line, index) => `${index + 1} | ${line}`)
          .join("\n");

        results.push(`=== ${relativePath} ===\n${numberedContent}\n=== END ===`);
      } catch (error) {
        results.push(
          `=== ${relativePath} ===\n错误: ${error instanceof Error ? error.message : "无法读取文件"}\n=== END ===`
        );
      }
    }

    return {
      success: true,
      content: results.join("\n\n"),
    };
  },
};
