/**
 * Vector Store - TypeScript wrapper for Tauri vector database
 */

import { invoke } from "@tauri-apps/api/core";
import type { ChunkWithVector, SearchOptions, SearchResult, IndexStatus } from "./types";

export interface VectorChunk {
  id: string;
  vector: number[];
  content: string;
  file_path: string;
  heading: string;
  start_line: number;
  end_line: number;
  file_modified?: number;
}

export class VectorStore {
  private dbPath: string;
  private initialized = false;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await invoke("init_vector_db", { dbPath: this.dbPath });
    this.initialized = true;
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 插入或更新向量
   */
  async upsert(chunks: ChunkWithVector[]): Promise<void> {
    if (!this.initialized) {
      throw new Error("VectorStore not initialized");
    }

    const vectorChunks: VectorChunk[] = chunks.map(c => ({
      id: c.id,
      vector: c.vector,
      content: c.content,
      file_path: c.metadata.filePath,
      heading: c.metadata.heading,
      start_line: c.metadata.startLine,
      end_line: c.metadata.endLine,
      file_modified: c.metadata.fileModified,
    }));

    await invoke("upsert_vector_chunks", { chunks: vectorChunks });
  }

  /**
   * 向量搜索
   */
  async search(
    queryVector: number[],
    options?: SearchOptions
  ): Promise<SearchResult[]> {
    if (!this.initialized) {
      throw new Error("VectorStore not initialized");
    }

    const results = await invoke<SearchResult[]>("search_vector_chunks", {
      queryVector,
      limit: options?.limit ?? 10,
      minScore: options?.minScore ?? 0.5,
      directoryFilter: options?.directory,
    });

    return results;
  }

  /**
   * 按文件删除向量
   */
  async deleteByFile(filePath: string): Promise<void> {
    if (!this.initialized) {
      throw new Error("VectorStore not initialized");
    }

    await invoke("delete_file_vectors", { filePath });
  }

  /**
   * 按 ID 删除向量
   */
  async deleteByIds(ids: string[]): Promise<void> {
    if (!this.initialized) {
      throw new Error("VectorStore not initialized");
    }

    await invoke("delete_vectors", { ids });
  }

  /**
   * 获取索引状态
   */
  async getStatus(): Promise<IndexStatus> {
    const status = await invoke<{
      initialized: boolean;
      total_chunks: number;
      total_files: number;
      last_indexed?: number;
    }>("get_vector_index_status");

    return {
      initialized: status.initialized,
      totalChunks: status.total_chunks,
      totalFiles: status.total_files,
      lastIndexed: status.last_indexed,
      isIndexing: false,
    };
  }

  /**
   * 检查文件是否需要重新索引
   */
  async needsReindex(filePath: string, modifiedTime: number): Promise<boolean> {
    if (!this.initialized) {
      return true;
    }

    return await invoke<boolean>("check_file_needs_reindex", {
      filePath,
      modifiedTime,
    });
  }

  /**
   * 清空所有向量
   */
  async clear(): Promise<void> {
    if (!this.initialized) {
      throw new Error("VectorStore not initialized");
    }

    await invoke("clear_vector_index");
  }
}
