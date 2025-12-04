/**
 * list_notes 工具执行器
 */

import { ToolExecutor, ToolResult, ToolContext } from "../../types";
import { readDir } from "@/lib/tauri";
import { join, resolve } from "@/lib/path";

interface FileEntry {
  name: string;
  isDirectory: boolean;
  children?: FileEntry[];
}

// Helper to map raw tauri entries to local FileEntry
function mapEntry(e: { name: string; is_dir?: boolean; isDirectory?: boolean; children?: unknown[] | null }): FileEntry {
  return {
    name: e.name,
    isDirectory: e.is_dir || e.isDirectory || false,
    children: e.children?.map((c) => mapEntry(c as Parameters<typeof mapEntry>[0])),
  };
}

export const ListNotesTool: ToolExecutor = {
  name: "list_notes",
  requiresApproval: false, // 只读操作，不需要审批

  async execute(
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const directory = (params.directory as string) || "";
    const recursive = params.recursive !== false; // 默认 true

    try {
      const fullPath = resolve(context.workspacePath, directory);
      const rawEntries = await readDir(fullPath, { recursive });

      // 转换类型，确保 isDirectory 为 boolean
      const entries: FileEntry[] = rawEntries.map((e) => ({
        name: e.name,
        isDirectory: e.is_dir || e.isDirectory || false,
        children: e.children?.map(mapEntry),
      }));

      // 格式化输出
      const output = formatEntries(entries, "", recursive);

      return {
        success: true,
        content: `目录: ${directory || "/"}\n\n${output}`,
      };
    } catch (error) {
      return {
        success: false,
        content: "",
        error: `列出目录失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  },
};

function formatEntries(
  entries: FileEntry[],
  prefix: string,
  recursive: boolean
): string {
  const lines: string[] = [];

  // 排序：目录在前，文件在后，各自按字母顺序
  const sorted = [...entries].sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of sorted) {
    if (entry.isDirectory) {
      lines.push(`${prefix}📁 ${entry.name}/`);
      if (recursive && entry.children) {
        lines.push(formatEntries(entry.children, prefix + "  ", recursive));
      }
    } else {
      // 只显示 Markdown 文件
      if (entry.name.endsWith(".md")) {
        lines.push(`${prefix}📄 ${entry.name}`);
      }
    }
  }

  return lines.filter(Boolean).join("\n");
}
