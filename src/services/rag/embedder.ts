/**
 * Embedding 服务
 * 支持 OpenAI text-embedding-3-small 和 Ollama
 */

import type { EmbeddingResult, BatchEmbeddingResult, RAGConfig } from "./types";

export class Embedder {
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
   * 生成单个文本的 embedding
   */
  async embed(text: string): Promise<EmbeddingResult> {
    if (this.config.embeddingProvider === "openai") {
      return this.embedOpenAI(text);
    } else if (this.config.embeddingProvider === "ollama") {
      return this.embedOllama(text);
    }
    throw new Error(`不支持的 embedding 提供商: ${this.config.embeddingProvider}`);
  }

  /**
   * 批量生成 embedding
   */
  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    if (texts.length === 0) {
      return { embeddings: [] };
    }

    if (this.config.embeddingProvider === "openai") {
      return this.embedBatchOpenAI(texts);
    } else if (this.config.embeddingProvider === "ollama") {
      return this.embedBatchOllama(texts);
    }
    throw new Error(`不支持的 embedding 提供商: ${this.config.embeddingProvider}`);
  }

  /**
   * OpenAI embedding API
   */
  private async embedOpenAI(text: string): Promise<EmbeddingResult> {
    const apiKey = this.config.embeddingApiKey;
    if (!apiKey) {
      throw new Error("请配置 OpenAI API Key 用于 embedding");
    }

    const baseUrl = this.config.embeddingBaseUrl || "https://api.openai.com/v1";
    
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.embeddingModel,
        input: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI Embedding API 错误: ${error}`);
    }

    const data = await response.json();
    return {
      embedding: data.data[0].embedding,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    };
  }

  /**
   * OpenAI 批量 embedding
   */
  private async embedBatchOpenAI(texts: string[]): Promise<BatchEmbeddingResult> {
    const apiKey = this.config.embeddingApiKey;
    if (!apiKey) {
      throw new Error("请配置 OpenAI API Key 用于 embedding");
    }

    const baseUrl = this.config.embeddingBaseUrl || "https://api.openai.com/v1";
    
    // OpenAI API 支持批量 embedding，但有限制
    // 分批处理，每批最多 100 个
    const batchSize = 100;
    const allEmbeddings: number[][] = [];
    let totalPromptTokens = 0;
    let totalTokens = 0;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.embeddingModel,
          input: batch,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI Embedding API 错误: ${error}`);
      }

      const data = await response.json();
      
      // 按 index 排序确保顺序
      const sorted = data.data.sort((a: { index: number }, b: { index: number }) => a.index - b.index);
      allEmbeddings.push(...sorted.map((d: { embedding: number[] }) => d.embedding));
      
      if (data.usage) {
        totalPromptTokens += data.usage.prompt_tokens;
        totalTokens += data.usage.total_tokens;
      }
    }

    return {
      embeddings: allEmbeddings,
      usage: {
        promptTokens: totalPromptTokens,
        totalTokens: totalTokens,
      },
    };
  }

  /**
   * Ollama embedding API
   */
  private async embedOllama(text: string): Promise<EmbeddingResult> {
    const baseUrl = this.config.embeddingBaseUrl || "http://localhost:11434";
    
    const response = await fetch(`${baseUrl}/api/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.embeddingModel,
        prompt: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama Embedding API 错误: ${error}`);
    }

    const data = await response.json();
    return {
      embedding: data.embedding,
    };
  }

  /**
   * Ollama 批量 embedding (逐个调用)
   */
  private async embedBatchOllama(texts: string[]): Promise<BatchEmbeddingResult> {
    // Ollama 不支持批量 API，需要逐个调用
    const embeddings: number[][] = [];
    
    for (const text of texts) {
      const result = await this.embedOllama(text);
      embeddings.push(result.embedding);
    }

    return { embeddings };
  }
}
