/**
 * Reranker 服务
 * 支持硅基流动等 OpenAI 兼容的 Rerank API
 */

import type { RAGConfig, RerankResponse, RerankResult, SearchResult } from "./types";

export class Reranker {
  private config: RAGConfig;

  constructor(config: RAGConfig) {
    this.config = config;
  }

  /**
   * 更新配置
   */
  updateConfig(config: RAGConfig): void {
    this.config = config;
  }

  /**
   * 检查是否启用
   */
  isEnabled(): boolean {
    return this.config.rerankerEnabled && !!this.config.rerankerApiKey;
  }

  /**
   * 对搜索结果进行重排序
   */
  async rerank(query: string, results: SearchResult[]): Promise<SearchResult[]> {
    if (!this.isEnabled() || results.length === 0) {
      return results;
    }

    const apiKey = this.config.rerankerApiKey;
    if (!apiKey) {
      console.warn("[Reranker] API Key not configured");
      return results;
    }

    const baseUrl = this.config.rerankerBaseUrl || "https://api.siliconflow.cn/v1";
    const model = this.config.rerankerModel || "BAAI/bge-reranker-v2-m3";
    const topN = this.config.rerankerTopN || 5;

    try {
      // 准备文档列表
      const documents = results.map(r => r.content);

      const response = await fetch(`${baseUrl}/rerank`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          query,
          documents,
          top_n: Math.min(topN, documents.length),
          return_documents: false,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`[Reranker] API Error: ${error}`);
        return results; // 失败时返回原始结果
      }

      const data: RerankResponse = await response.json();

      // 根据重排序结果重新排列
      const rerankedResults: SearchResult[] = data.results
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .map((r: RerankResult) => ({
          ...results[r.index],
          score: r.relevanceScore, // 使用重排序分数
        }));

      console.log(`[Reranker] Reranked ${results.length} results, returning top ${rerankedResults.length}`);
      
      return rerankedResults;
    } catch (error) {
      console.error("[Reranker] Error:", error);
      return results; // 出错时返回原始结果
    }
  }
}
