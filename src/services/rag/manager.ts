/**
 * RAG Manager
 * 管理 embedding、索引和搜索的核心服务
 */

import { invoke } from "@tauri-apps/api/core";
import { Embedder } from "./embedder";
import { MarkdownChunker } from "./chunker";
import { VectorStore } from "./vectorStore";
import type {
  RAGConfig,
  ChunkWithVector,
  SearchOptions,
  SearchResult,
  IndexStatus,
} from "./types";

export interface IndexProgress {
  current: number;
  total: number;
  currentFile?: string;
}

export type IndexProgressCallback = (progress: IndexProgress) => void;

export class RAGManager {
  private embedder: Embedder;
  private chunker: MarkdownChunker;
  private vectorStore: VectorStore;
  private config: RAGConfig;
  private workspacePath: string | null = null;
  private isIndexing = false;

  constructor(config: RAGConfig) {
    this.config = config;
    this.embedder = new Embedder(config);
    this.chunker = new MarkdownChunker(config);
    // VectorStore will be initialized with actual path later
    this.vectorStore = null as unknown as VectorStore;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<RAGConfig>): void {
    this.config = { ...this.config, ...config };
    this.embedder.updateConfig(this.config);
    this.chunker.updateConfig(this.config);
  }

  /**
   * 初始化 RAG 系统
   */
  async initialize(workspacePath: string): Promise<void> {
    this.workspacePath = workspacePath;
    
    // 创建向量数据库路径 (在工作区的 .lumina 目录下)
    const dbPath = `${workspacePath}/.lumina/vectors.db`;
    
    // 确保 .lumina 目录存在
    try {
      await invoke("create_file", { path: `${workspacePath}/.lumina/.keep` });
    } catch {
      // 目录可能已存在，忽略错误
    }

    this.vectorStore = new VectorStore(dbPath);
    await this.vectorStore.initialize();
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.vectorStore?.isInitialized() ?? false;
  }

  /**
   * 全量索引
   */
  async fullIndex(onProgress?: IndexProgressCallback): Promise<void> {
    if (!this.workspacePath) {
      throw new Error("RAG Manager not initialized");
    }

    if (this.isIndexing) {
      throw new Error("Indexing already in progress");
    }

    this.isIndexing = true;

    try {
      // 清空现有索引
      await this.vectorStore.clear();

      // 获取所有 markdown 文件
      const files = await this.getMarkdownFiles(this.workspacePath);
      
      let processed = 0;
      const total = files.length;

      for (const file of files) {
        onProgress?.({
          current: processed,
          total,
          currentFile: file.path,
        });

        await this.indexFile(file.path, file.content, file.modified);
        processed++;
      }

      onProgress?.({
        current: total,
        total,
      });
    } finally {
      this.isIndexing = false;
    }
  }

  /**
   * 增量索引 - 只处理变更的文件
   */
  async incrementalIndex(onProgress?: IndexProgressCallback): Promise<void> {
    if (!this.workspacePath) {
      throw new Error("RAG Manager not initialized");
    }

    if (this.isIndexing) {
      throw new Error("Indexing already in progress");
    }

    this.isIndexing = true;

    try {
      const files = await this.getMarkdownFiles(this.workspacePath);
      
      // 过滤需要重新索引的文件
      const filesToIndex: typeof files = [];
      for (const file of files) {
        const needsReindex = await this.vectorStore.needsReindex(file.path, file.modified);
        if (needsReindex) {
          filesToIndex.push(file);
        }
      }

      let processed = 0;
      const total = filesToIndex.length;

      for (const file of filesToIndex) {
        onProgress?.({
          current: processed,
          total,
          currentFile: file.path,
        });

        // 先删除旧的
        await this.vectorStore.deleteByFile(file.path);
        // 重新索引
        await this.indexFile(file.path, file.content, file.modified);
        processed++;
      }

      onProgress?.({
        current: total,
        total,
      });
    } finally {
      this.isIndexing = false;
    }
  }

  /**
   * 索引单个文件
   */
  async indexFile(filePath: string, content: string, modified?: number): Promise<void> {
    // 分块
    const chunks = this.chunker.chunk(content, filePath, modified);
    
    if (chunks.length === 0) {
      return;
    }

    // 批量生成 embedding
    const texts = chunks.map(c => c.content);
    const { embeddings } = await this.embedder.embedBatch(texts);

    // 组合成 ChunkWithVector
    const chunksWithVectors: ChunkWithVector[] = chunks.map((chunk, i) => ({
      ...chunk,
      vector: embeddings[i],
    }));

    // 存储
    await this.vectorStore.upsert(chunksWithVectors);
  }

  /**
   * 从索引中移除文件
   */
  async removeFile(filePath: string): Promise<void> {
    await this.vectorStore.deleteByFile(filePath);
  }

  /**
   * 语义搜索
   */
  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    if (!this.vectorStore?.isInitialized()) {
      throw new Error("RAG Manager not initialized");
    }

    // 生成查询向量
    const { embedding } = await this.embedder.embed(query);

    // 搜索
    return await this.vectorStore.search(embedding, {
      limit: options?.limit ?? this.config.maxResults,
      minScore: options?.minScore ?? this.config.minScore,
      directory: options?.directory,
    });
  }

  /**
   * 获取索引状态
   */
  async getStatus(): Promise<IndexStatus> {
    if (!this.vectorStore) {
      return {
        initialized: false,
        totalChunks: 0,
        totalFiles: 0,
        isIndexing: this.isIndexing,
      };
    }

    const status = await this.vectorStore.getStatus();
    return {
      ...status,
      isIndexing: this.isIndexing,
    };
  }

  /**
   * 获取工作区中的所有 Markdown 文件
   */
  private async getMarkdownFiles(workspacePath: string): Promise<{
    path: string;
    content: string;
    modified: number;
  }[]> {
    // 使用 Tauri 的 list_directory 获取文件列表
    const entries = await invoke<Array<{
      path: string;
      name: string;
      isDir: boolean;
      children?: unknown[];
    }>>("list_directory", { path: workspacePath });

    const files: { path: string; content: string; modified: number }[] = [];

    // 递归收集所有 .md 文件
    const collectFiles = async (items: typeof entries) => {
      for (const item of items) {
        if (item.isDir) {
          if (item.children) {
            await collectFiles(item.children as typeof entries);
          }
        } else if (item.path.endsWith(".md")) {
          try {
            const content = await invoke<string>("read_file", { path: item.path });
            // 获取文件修改时间 (简化处理，使用当前时间)
            const modified = Date.now();
            files.push({ path: item.path, content, modified });
          } catch (e) {
            console.warn(`Failed to read file: ${item.path}`, e);
          }
        }
      }
    };

    await collectFiles(entries);
    return files;
  }
}
