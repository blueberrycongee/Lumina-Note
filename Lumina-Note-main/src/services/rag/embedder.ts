/**
 * Embedding 服务
 * 支持 OpenAI text-embedding-3-small 和 Ollama
 */

import type { EmbeddingResult, BatchEmbeddingResult, RAGConfig } from "./types";
import { tauriFetch } from "@/lib/tauriFetch";
import { getCurrentTranslations } from "@/stores/useLocaleStore";

export class Embedder {
  private config: RAGConfig;
  // 缓存 Ollama API 版本检测结果: 'new' | 'legacy' | null
  private ollamaApiVersion: 'new' | 'legacy' | null = null;

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
    const t = getCurrentTranslations();
    throw new Error(
      t.rag.errors.unsupportedProvider.replace('{provider}', String(this.config.embeddingProvider))
    );
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
    const t = getCurrentTranslations();
    throw new Error(
      t.rag.errors.unsupportedProvider.replace('{provider}', String(this.config.embeddingProvider))
    );
  }

  /**
   * OpenAI embedding API
   */
  private async embedOpenAI(text: string): Promise<EmbeddingResult> {
    const apiKey = this.config.embeddingApiKey;
    if (!apiKey) {
      const t = getCurrentTranslations();
      throw new Error(t.rag.errors.missingOpenAIKey);
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
        ...(this.config.embeddingDimensions && { dimensions: this.config.embeddingDimensions }),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      const t = getCurrentTranslations();
      throw new Error(t.rag.errors.openaiError.replace('{error}', error));
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
      const t = getCurrentTranslations();
      throw new Error(t.rag.errors.missingOpenAIKey);
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
          ...(this.config.embeddingDimensions && { dimensions: this.config.embeddingDimensions }),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        const t = getCurrentTranslations();
        throw new Error(t.rag.errors.openaiError.replace('{error}', error));
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
   * Ollama embedding API (自动兼容新旧版本)
   * 新版: /api/embed + input 字段 + embeddings 数组返回
   * 旧版: /api/embeddings + prompt 字段 + embedding 单个返回
   */
  private async embedOllama(text: string): Promise<EmbeddingResult> {
    const t = getCurrentTranslations();
    const provider = "Ollama";
    const baseUrl = this.config.embeddingBaseUrl || "http://localhost:11434";
    
    // 如果已知 API 版本，直接使用
    if (this.ollamaApiVersion === 'legacy') {
      return this.embedOllamaLegacy(text, baseUrl);
    }
    
    // 尝试新版 API
    try {
      const response = await tauriFetch({
        url: `${baseUrl}/api/embed`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.config.embeddingModel,
          input: text,
        }),
        timeout_secs: 120,
      });

      if (response.error) {
        throw new Error(
          t.rag.errors.providerError
            .replace("{provider}", provider)
            .replace("{error}", String(response.error))
        );
      }

      if (response.status === 404) {
        console.log('[Embedder] Ollama /api/embed not found, falling back to legacy /api/embeddings');
        this.ollamaApiVersion = 'legacy';
        return this.embedOllamaLegacy(text, baseUrl);
      }

      if (response.status >= 200 && response.status < 300) {
        const data = JSON.parse(response.body);
        this.ollamaApiVersion = 'new';
        return { embedding: data.embeddings[0] };
      }

      throw new Error(
        t.rag.errors.providerErrorWithStatus
          .replace("{provider}", provider)
          .replace("{status}", String(response.status))
          .replace("{error}", String(response.body))
      );
    } catch (e) {
      // 网络错误或其他错误，尝试旧版
      if (this.ollamaApiVersion === null) {
        console.log('[Embedder] Trying legacy Ollama API...');
        this.ollamaApiVersion = 'legacy';
        return this.embedOllamaLegacy(text, baseUrl);
      }
      throw e;
    }
  }

  /**
   * Ollama 旧版 API (/api/embeddings)
   */
  private async embedOllamaLegacy(text: string, baseUrl: string): Promise<EmbeddingResult> {
    const t = getCurrentTranslations();
    const provider = "Ollama";
    const response = await tauriFetch({
      url: `${baseUrl}/api/embeddings`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.embeddingModel,
        prompt: text,
      }),
      timeout_secs: 120,
    });

    if (response.error) {
      throw new Error(
        t.rag.errors.providerError
          .replace("{provider}", provider)
          .replace("{error}", String(response.error))
      );
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        t.rag.errors.providerErrorWithStatus
          .replace("{provider}", provider)
          .replace("{status}", String(response.status))
          .replace("{error}", String(response.body))
      );
    }

    const data = JSON.parse(response.body);
    return { embedding: data.embedding };
  }

  /**
   * Ollama 批量 embedding (自动兼容新旧版本)
   */
  private async embedBatchOllama(texts: string[]): Promise<BatchEmbeddingResult> {
    const t = getCurrentTranslations();
    const provider = "Ollama";
    const baseUrl = this.config.embeddingBaseUrl || "http://localhost:11434";
    
    // 如果已知是旧版，逐个调用
    if (this.ollamaApiVersion === 'legacy') {
      return this.embedBatchOllamaLegacy(texts, baseUrl);
    }
    
    // 尝试新版 API (支持批量)
    try {
      const response = await tauriFetch({
        url: `${baseUrl}/api/embed`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.config.embeddingModel,
          input: texts,
        }),
        timeout_secs: 300,
      });

      if (response.error) {
        throw new Error(
          t.rag.errors.providerError
            .replace("{provider}", provider)
            .replace("{error}", String(response.error))
        );
      }

      if (response.status === 404) {
        console.log('[Embedder] Ollama /api/embed not found, falling back to legacy');
        this.ollamaApiVersion = 'legacy';
        return this.embedBatchOllamaLegacy(texts, baseUrl);
      }

      if (response.status >= 200 && response.status < 300) {
        const data = JSON.parse(response.body);
        this.ollamaApiVersion = 'new';
        return { embeddings: data.embeddings };
      }

      throw new Error(
        t.rag.errors.providerErrorWithStatus
          .replace("{provider}", provider)
          .replace("{status}", String(response.status))
          .replace("{error}", String(response.body))
      );
    } catch (e) {
      if (this.ollamaApiVersion === null) {
        this.ollamaApiVersion = 'legacy';
        return this.embedBatchOllamaLegacy(texts, baseUrl);
      }
      throw e;
    }
  }

  /**
   * Ollama 旧版批量 embedding (逐个调用)
   */
  private async embedBatchOllamaLegacy(texts: string[], baseUrl: string): Promise<BatchEmbeddingResult> {
    const embeddings: number[][] = [];
    for (const text of texts) {
      const result = await this.embedOllamaLegacy(text, baseUrl);
      embeddings.push(result.embedding);
    }
    return { embeddings };
  }
}
