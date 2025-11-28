/**
 * RAG 系统类型定义
 */

// ============ Chunk 类型 ============

export interface Chunk {
  id: string;
  content: string;
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  filePath: string;
  heading: string;
  startLine: number;
  endLine: number;
  fileModified?: number; // timestamp
}

export interface ChunkWithVector extends Chunk {
  vector: number[];
}

// ============ 搜索类型 ============

export interface SearchOptions {
  limit?: number;
  minScore?: number;
  directory?: string;
}

export interface SearchResult {
  id: string;
  filePath: string;
  heading: string;
  content: string;
  score: number;
  startLine: number;
  endLine: number;
}

// ============ 索引状态 ============

export interface IndexStatus {
  initialized: boolean;
  totalChunks: number;
  totalFiles: number;
  lastIndexed?: number;
  isIndexing: boolean;
  progress?: {
    current: number;
    total: number;
    currentFile?: string;
  };
}

// ============ RAG 配置 ============

export interface RAGConfig {
  enabled: boolean;
  embeddingProvider: "openai" | "ollama";
  embeddingModel: string;
  embeddingApiKey?: string;
  embeddingBaseUrl?: string;
  chunkSize: number;      // 分块大小 (字符)
  chunkOverlap: number;   // 重叠字符数
  minScore: number;       // 最低相似度
  maxResults: number;     // 最大返回数
}

export const DEFAULT_RAG_CONFIG: RAGConfig = {
  enabled: true,
  embeddingProvider: "openai",
  embeddingModel: "text-embedding-3-small",
  chunkSize: 1500,
  chunkOverlap: 200,
  minScore: 0.5,
  maxResults: 10,
};

// ============ Embedding 服务 ============

export interface EmbeddingResult {
  embedding: number[];
  usage?: {
    promptTokens: number;
    totalTokens: number;
  };
}

export interface BatchEmbeddingResult {
  embeddings: number[][];
  usage?: {
    promptTokens: number;
    totalTokens: number;
  };
}
