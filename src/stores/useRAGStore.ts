/**
 * RAG 状态管理 Store
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { RAGManager, RAGConfig, DEFAULT_RAG_CONFIG, IndexStatus, SearchResult } from "@/services/rag";
import { encryptApiKey, decryptApiKey } from "@/lib/crypto";
import { useFileStore } from "./useFileStore";
import { getCurrentTranslations } from "@/stores/useLocaleStore";
import { reportOperationError } from "@/lib/reportError";

interface RAGState {
  // 配置
  config: RAGConfig;
  setConfig: (config: Partial<RAGConfig>) => void | Promise<void>;

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
  cancelIndex: () => void;
  search: (query: string, options?: { limit?: number; directory?: string }) => Promise<SearchResult[]>;
  getStatus: () => Promise<IndexStatus | null>;
}

export const useRAGStore = create<RAGState>()(
  persist(
    (set, get) => ({
      // 配置
      config: DEFAULT_RAG_CONFIG,
      setConfig: async (newConfig) => {
        const currentConfig = get().config;
        const memoryConfig = { ...currentConfig, ...newConfig };
        const storageConfig = { ...currentConfig, ...newConfig };
        
        // 加密 Embedding API Key
        if (newConfig.embeddingApiKey !== undefined) {
          storageConfig.embeddingApiKey = await encryptApiKey(newConfig.embeddingApiKey);
        }
        
        // 加密 Reranker API Key
        if (newConfig.rerankerApiKey !== undefined) {
          storageConfig.rerankerApiKey = await encryptApiKey(newConfig.rerankerApiKey);
        }
        
        // 更新管理器配置（明文）
        const ragManager = get().ragManager;
        if (ragManager) {
          ragManager.updateConfig(memoryConfig);
        }
        
        // 存储加密后的配置
        set({ config: storageConfig });
        // 立即恢复内存中的明文（避免 UI 显示加密值）
        setTimeout(() => set({ config: memoryConfig }), 0);
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
          const t = getCurrentTranslations();
          const errorMsg = error instanceof Error ? error.message : t.rag.errors.initFailed;
          set({ lastError: errorMsg, isInitialized: false });
          reportOperationError({
            source: "RAGStore.initialize",
            action: "Initialize RAG system",
            error,
            context: { workspacePath },
          });
        }
      },

      // 重建索引
      rebuildIndex: async () => {
        let { ragManager } = get();
        
        // 如果未初始化，自动获取 vaultPath 并初始化
        if (!ragManager) {
          const vaultPath = useFileStore.getState().vaultPath;
          if (!vaultPath) {
            const t = getCurrentTranslations();
            set({ lastError: t.common.openWorkspaceFirst });
            return;
          }
          
          console.log("[RAG] Auto-initializing with vaultPath:", vaultPath);
          await get().initialize(vaultPath);
          ragManager = get().ragManager;
          
          if (!ragManager) {
            const t = getCurrentTranslations();
            set({ lastError: t.rag.errors.systemInitFailed });
            return;
          }
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
          const t = getCurrentTranslations();
          const errorMsg = error instanceof Error ? error.message : t.rag.errors.indexFailed;
          set({ lastError: errorMsg, isIndexing: false });
          reportOperationError({
            source: "RAGStore.rebuildIndex",
            action: "Rebuild RAG index",
            error,
          });
        }
      },

      // 取消索引（前端软取消，解锁 UI 状态）
      cancelIndex: () => {
        const status = get().indexStatus;
        set({
          isIndexing: false,
          indexStatus: status
            ? {
                ...status,
                isIndexing: false,
              }
            : null,
        });
      },

      // 搜索
      search: async (query, options) => {
        const { ragManager } = get();
        
        if (!ragManager || !ragManager.isInitialized()) {
          const t = getCurrentTranslations();
          throw new Error(t.rag.errors.notInitialized);
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
      // 恢复数据后解密 API Keys（复用 useAIStore 模式）
      onRehydrateStorage: () => async (state) => {
        if (state?.config) {
          try {
            const decryptedConfig = { ...state.config };
            
            // 解密 Embedding API Key
            if (state.config.embeddingApiKey) {
              decryptedConfig.embeddingApiKey = await decryptApiKey(state.config.embeddingApiKey);
            }
            
            // 解密 Reranker API Key
            if (state.config.rerankerApiKey) {
              decryptedConfig.rerankerApiKey = await decryptApiKey(state.config.rerankerApiKey);
            }
            
            // 延迟执行，确保 store 创建完成后再调用 setState
            setTimeout(() => {
              useRAGStore.setState({ config: decryptedConfig });
            }, 0);
          } catch (error) {
            reportOperationError({
              source: "RAGStore.rehydrate",
              action: "Decrypt saved RAG API keys",
              error,
              level: "warning",
            });
          }
        }
      },
    }
  )
);
