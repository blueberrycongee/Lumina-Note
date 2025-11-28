/**
 * RAG 状态管理 Store
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { RAGManager, RAGConfig, DEFAULT_RAG_CONFIG, IndexStatus, SearchResult } from "@/services/rag";

interface RAGState {
  // 配置
  config: RAGConfig;
  setConfig: (config: Partial<RAGConfig>) => void;

  // 管理器实例
  ragManager: RAGManager | null;

  // 状态
  isInitialized: boolean;
  isIndexing: boolean;
  indexStatus: IndexStatus | null;
  lastError: string | null;

  // 操作
  initialize: (workspacePath: string) => Promise<void>;
  rebuildIndex: () => Promise<void>;
  search: (query: string, options?: { limit?: number; directory?: string }) => Promise<SearchResult[]>;
  getStatus: () => Promise<IndexStatus | null>;
}

export const useRAGStore = create<RAGState>()(
  persist(
    (set, get) => ({
      // 配置
      config: DEFAULT_RAG_CONFIG,
      setConfig: (newConfig) => {
        const config = { ...get().config, ...newConfig };
        set({ config });
        
        // 更新管理器配置
        const ragManager = get().ragManager;
        if (ragManager) {
          ragManager.updateConfig(config);
        }
      },

      // 管理器
      ragManager: null,

      // 状态
      isInitialized: false,
      isIndexing: false,
      indexStatus: null,
      lastError: null,

      // 初始化 RAG 系统
      initialize: async (workspacePath: string) => {
        const { config, ragManager: existing } = get();
        
        // 如果已经初始化，跳过
        if (existing?.isInitialized()) {
          return;
        }

        try {
          set({ lastError: null });

          // 创建新的管理器
          const ragManager = new RAGManager(config);
          await ragManager.initialize(workspacePath);

          set({ 
            ragManager, 
            isInitialized: true,
          });

          // 检查是否需要构建索引
          const status = await ragManager.getStatus();
          set({ indexStatus: status });

          // 如果没有索引，执行增量索引
          if (status.totalChunks === 0) {
            set({ isIndexing: true });
            await ragManager.incrementalIndex((progress) => {
              set({ 
                indexStatus: { 
                  ...status, 
                  isIndexing: true,
                  progress,
                } 
              });
            });
            const newStatus = await ragManager.getStatus();
            set({ indexStatus: newStatus, isIndexing: false });
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "初始化失败";
          set({ lastError: errorMsg, isInitialized: false });
          console.error("[RAG] Initialize error:", error);
        }
      },

      // 重建索引
      rebuildIndex: async () => {
        const { ragManager } = get();
        
        if (!ragManager) {
          set({ lastError: "RAG 系统未初始化" });
          return;
        }

        try {
          set({ isIndexing: true, lastError: null });
          
          await ragManager.fullIndex((progress) => {
            const status = get().indexStatus;
            set({ 
              indexStatus: status ? { 
                ...status, 
                isIndexing: true,
                progress,
              } : null,
            });
          });

          const newStatus = await ragManager.getStatus();
          set({ indexStatus: newStatus, isIndexing: false });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "索引重建失败";
          set({ lastError: errorMsg, isIndexing: false });
          console.error("[RAG] Rebuild error:", error);
        }
      },

      // 搜索
      search: async (query, options) => {
        const { ragManager } = get();
        
        if (!ragManager || !ragManager.isInitialized()) {
          throw new Error("RAG 系统未初始化");
        }

        return await ragManager.search(query, options);
      },

      // 获取状态
      getStatus: async () => {
        const { ragManager } = get();
        
        if (!ragManager) {
          return null;
        }

        const status = await ragManager.getStatus();
        set({ indexStatus: status });
        return status;
      },
    }),
    {
      name: "neurone-rag",
      partialize: (state) => ({
        config: state.config,
      }),
    }
  )
);
