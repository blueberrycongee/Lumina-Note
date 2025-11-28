/**
 * search_notes 工具执行器
 * 基于 RAG 的语义搜索
 */

import { ToolExecutor, ToolResult, ToolContext } from "../../types";
import { useRAGStore } from "@/stores/useRAGStore";
import type { SearchResult } from "@/services/rag";

export const SearchNotesTool: ToolExecutor = {
  name: "search_notes",
  requiresApproval: false, // 只读操作，不需要审批

  async execute(
    params: Record<string, unknown>,
    _context: ToolContext
  ): Promise<ToolResult> {
    const query = params.query as string;
    const directory = params.directory as string | undefined;
    const limit = (params.limit as number) || 10;

    if (!query || typeof query !== "string") {
      return {
        success: false,
        content: "",
        error: "参数错误: query 必须是非空字符串",
      };
    }

    try {
      // 获取 RAG 管理器
      const ragManager = useRAGStore.getState().ragManager;

      if (!ragManager || !ragManager.isInitialized()) {
        return {
          success: false,
          content: "",
          error: "RAG 系统未初始化。请先在设置中配置 embedding API 并建立索引。",
        };
      }

      // 执行语义搜索
      const results = await ragManager.search(query, {
        limit,
        directory,
      });

      if (results.length === 0) {
        return {
          success: true,
          content: `未找到与 "${query}" 相关的笔记。`,
        };
      }

      // 格式化结果
      const formattedResults = results.map((r: SearchResult, i: number) => {
        const score = (r.score * 100).toFixed(1);
        const preview = r.content.length > 300 
          ? r.content.substring(0, 300) + "..." 
          : r.content;
        
        return `### ${i + 1}. ${r.filePath} (相关度: ${score}%)
**章节**: ${r.heading}
**位置**: 第 ${r.startLine}-${r.endLine} 行

\`\`\`
${preview}
\`\`\``;
      }).join("\n\n---\n\n");

      return {
        success: true,
        content: `找到 ${results.length} 个相关结果:\n\n${formattedResults}`,
      };
    } catch (error) {
      return {
        success: false,
        content: "",
        error: `搜索失败: ${error instanceof Error ? error.message : "未知错误"}`,
      };
    }
  },
};
