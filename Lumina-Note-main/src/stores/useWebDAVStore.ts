/**
 * WebDAV 状态管理
 * 管理 WebDAV 连接配置、同步状态和操作
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  WebDAVConfig,
  SyncPlan,
  SyncResult,
  SyncProgress,
  createDefaultConfig,
  testWebDAVConnection,
  webdavService,
} from '@/services/webdav';

interface WebDAVState {
  // 配置
  config: WebDAVConfig;
  isConfigured: boolean;

  // 连接状态
  isConnected: boolean;
  connectionError: string | null;

  // 同步状态
  syncProgress: SyncProgress;
  lastSyncResult: SyncResult | null;
  lastSyncTime: number | null;

  // 同步计划（预览）
  pendingSyncPlan: SyncPlan | null;

  // Actions
  setConfig: (config: Partial<WebDAVConfig>) => void;
  resetConfig: () => void;
  testConnection: () => Promise<boolean>;
  
  // 同步操作
  computeSyncPlan: (vaultPath: string) => Promise<SyncPlan | null>;
  executeSync: (vaultPath: string, plan?: SyncPlan) => Promise<SyncResult | null>;
  quickSync: (vaultPath: string) => Promise<SyncResult | null>;
  cancelSync: () => void;

  // 状态更新
  setSyncProgress: (progress: Partial<SyncProgress>) => void;
  clearError: () => void;
}

export const useWebDAVStore = create<WebDAVState>()(
  persist(
    (set, get) => ({
      // 初始状态
      config: createDefaultConfig(),
      isConfigured: false,
      isConnected: false,
      connectionError: null,
      syncProgress: {
        stage: 'Idle',
        total: 0,
        processed: 0,
        current_file: null,
        error: null,
      },
      lastSyncResult: null,
      lastSyncTime: null,
      pendingSyncPlan: null,

      // 设置配置
      setConfig: (partialConfig) => {
        set((state) => {
          const newConfig = { ...state.config, ...partialConfig };
          const isConfigured = newConfig.server_url.length > 0;
          
          // 更新服务层配置
          if (isConfigured) {
            webdavService.setConfig(newConfig);
          }
          
          return {
            config: newConfig,
            isConfigured,
            // 配置变更时重置连接状态
            isConnected: false,
            connectionError: null,
          };
        });
      },

      // 重置配置
      resetConfig: () => {
        set({
          config: createDefaultConfig(),
          isConfigured: false,
          isConnected: false,
          connectionError: null,
        });
      },

      // 测试连接
      testConnection: async () => {
        const { config, isConfigured } = get();
        
        if (!isConfigured) {
          set({ connectionError: 'WebDAV not configured' });
          return false;
        }

        set({
          syncProgress: { ...get().syncProgress, stage: 'Connecting' },
          connectionError: null,
        });

        try {
          const success = await testWebDAVConnection(config);
          set({
            isConnected: success,
            connectionError: success ? null : 'Connection failed',
            syncProgress: { ...get().syncProgress, stage: 'Idle' },
          });
          return success;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set({
            isConnected: false,
            connectionError: message,
            syncProgress: { ...get().syncProgress, stage: 'Error', error: message },
          });
          return false;
        }
      },

      // 计算同步计划
      computeSyncPlan: async (vaultPath) => {
        const { config, isConfigured } = get();
        
        if (!isConfigured) {
          set({ connectionError: 'WebDAV not configured' });
          return null;
        }

        set({
          syncProgress: {
            stage: 'ComputingDiff',
            total: 0,
            processed: 0,
            current_file: null,
            error: null,
          },
        });

        try {
          webdavService.setConfig(config);
          const plan = await webdavService.computeSyncPlan(vaultPath);
          
          set({
            pendingSyncPlan: plan,
            syncProgress: { ...get().syncProgress, stage: 'Idle' },
          });
          
          return plan;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set({
            syncProgress: { ...get().syncProgress, stage: 'Error', error: message },
            connectionError: message,
          });
          return null;
        }
      },

      // 执行同步
      executeSync: async (vaultPath, plan) => {
        const { config, isConfigured, pendingSyncPlan } = get();
        const syncPlan = plan || pendingSyncPlan;
        
        if (!isConfigured) {
          set({ connectionError: 'WebDAV not configured' });
          return null;
        }

        if (!syncPlan) {
          set({ connectionError: 'No sync plan available' });
          return null;
        }

        set({
          syncProgress: {
            stage: 'Syncing',
            total: syncPlan.items.length,
            processed: 0,
            current_file: null,
            error: null,
          },
        });

        try {
          webdavService.setConfig(config);
          const result = await webdavService.executeSync(vaultPath, syncPlan);
          
          set({
            lastSyncResult: result,
            lastSyncTime: Date.now(),
            pendingSyncPlan: null,
            syncProgress: {
              stage: result.success ? 'Completed' : 'Error',
              total: syncPlan.items.length,
              processed: syncPlan.items.length,
              current_file: null,
              error: result.success ? null : 'Sync completed with errors',
            },
          });
          
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set({
            syncProgress: { ...get().syncProgress, stage: 'Error', error: message },
            connectionError: message,
          });
          return null;
        }
      },

      // 快速同步
      quickSync: async (vaultPath) => {
        const { config, isConfigured } = get();
        
        if (!isConfigured) {
          set({ connectionError: 'WebDAV not configured' });
          return null;
        }

        set({
          syncProgress: {
            stage: 'Syncing',
            total: 0,
            processed: 0,
            current_file: null,
            error: null,
          },
        });

        try {
          webdavService.setConfig(config);
          const result = await webdavService.quickSync(vaultPath);
          
          set({
            lastSyncResult: result,
            lastSyncTime: Date.now(),
            syncProgress: {
              stage: result.success ? 'Completed' : 'Error',
              total: result.uploaded + result.downloaded + result.deleted,
              processed: result.uploaded + result.downloaded + result.deleted,
              current_file: null,
              error: result.success ? null : 'Sync completed with errors',
            },
          });
          
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set({
            syncProgress: { ...get().syncProgress, stage: 'Error', error: message },
            connectionError: message,
          });
          return null;
        }
      },

      // 取消同步
      cancelSync: () => {
        set({
          syncProgress: {
            stage: 'Idle',
            total: 0,
            processed: 0,
            current_file: null,
            error: null,
          },
          pendingSyncPlan: null,
        });
      },

      // 更新同步进度
      setSyncProgress: (progress) => {
        set((state) => ({
          syncProgress: { ...state.syncProgress, ...progress },
        }));
      },

      // 清除错误
      clearError: () => {
        set({
          connectionError: null,
          syncProgress: { ...get().syncProgress, error: null },
        });
      },
    }),
    {
      name: 'lumina-webdav-config',
      partialize: (state) => ({
        // 只持久化配置，不存储密码
        config: {
          ...state.config,
          password: '', // 不保存密码到 localStorage
        },
        lastSyncTime: state.lastSyncTime,
      }),
    }
  )
);

// Hook: 获取同步状态文本
export function useSyncStatusText(): string {
  const { syncProgress, isConnected, isConfigured } = useWebDAVStore();

  if (!isConfigured) return 'Not configured';
  if (!isConnected) return 'Disconnected';

  switch (syncProgress.stage) {
    case 'Idle':
      return 'Ready';
    case 'Connecting':
      return 'Connecting...';
    case 'ScanningRemote':
      return 'Scanning remote...';
    case 'ScanningLocal':
      return 'Scanning local...';
    case 'ComputingDiff':
      return 'Computing changes...';
    case 'Syncing':
      return `Syncing ${syncProgress.processed}/${syncProgress.total}`;
    case 'Completed':
      return 'Sync complete';
    case 'Error':
      return `Error: ${syncProgress.error || 'Unknown error'}`;
    default:
      return 'Unknown';
  }
}
