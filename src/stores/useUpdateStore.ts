/**
 * 更新管理 Store
 * 负责自动检查更新、记录检查时间、管理跳过版本等
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { check, Update } from "@tauri-apps/plugin-updater";
import { reportOperationError } from "@/lib/reportError";

export interface UpdateInfo {
  version: string;
  body: string | null;
  date: string | null;
}

interface UpdateState {
  // 持久化数据
  lastCheckTime: number;
  skippedVersions: string[];
  checkCooldownHours: number;

  // 运行时状态
  availableUpdate: UpdateInfo | null;
  updateHandle: Update | null;
  hasUnreadUpdate: boolean;
  isChecking: boolean;

  // Actions
  setLastCheckTime: (time: number) => void;
  setAvailableUpdate: (update: UpdateInfo | null, handle?: Update | null) => void;
  setHasUnreadUpdate: (hasUnread: boolean) => void;
  setIsChecking: (checking: boolean) => void;
  skipVersion: (version: string) => void;
  clearSkippedVersion: (version: string) => void;
  setCheckCooldownHours: (hours: number) => void;
  isVersionSkipped: (version: string) => boolean;
  markUpdateAsRead: () => void;
  clearUpdate: () => void;
}

export const useUpdateStore = create<UpdateState>()(
  persist(
    (set, get) => ({
      // 持久化数据
      lastCheckTime: 0,
      skippedVersions: [],
      checkCooldownHours: 24,

      // 运行时状态（不持久化）
      availableUpdate: null,
      updateHandle: null,
      hasUnreadUpdate: false,
      isChecking: false,

      setLastCheckTime: (time) => set({ lastCheckTime: time }),

      setAvailableUpdate: (update, handle = null) =>
        set({
          availableUpdate: update,
          updateHandle: handle,
          hasUnreadUpdate: update !== null,
        }),

      setHasUnreadUpdate: (hasUnread) => set({ hasUnreadUpdate: hasUnread }),

      setIsChecking: (checking) => set({ isChecking: checking }),

      skipVersion: (version) =>
        set((state) => ({
          skippedVersions: state.skippedVersions.includes(version)
            ? state.skippedVersions
            : [...state.skippedVersions, version],
          hasUnreadUpdate: false,
          availableUpdate: null,
          updateHandle: null,
        })),

      clearSkippedVersion: (version) =>
        set((state) => ({
          skippedVersions: state.skippedVersions.filter((v) => v !== version),
        })),

      setCheckCooldownHours: (hours) => set({ checkCooldownHours: hours }),

      isVersionSkipped: (version) => get().skippedVersions.includes(version),

      markUpdateAsRead: () => set({ hasUnreadUpdate: false }),

      clearUpdate: () =>
        set({
          availableUpdate: null,
          updateHandle: null,
          hasUnreadUpdate: false,
        }),
    }),
    {
      name: "lumina-update",
      partialize: (state) => ({
        lastCheckTime: state.lastCheckTime,
        skippedVersions: state.skippedVersions,
        checkCooldownHours: state.checkCooldownHours,
      }),
    }
  )
);

/**
 * 检查是否应该执行更新检查
 */
export function shouldCheckForUpdate(): boolean {
  const { lastCheckTime, checkCooldownHours } = useUpdateStore.getState();
  const now = Date.now();
  const cooldownMs = checkCooldownHours * 60 * 60 * 1000;
  return now - lastCheckTime > cooldownMs;
}

/**
 * 执行更新检查
 * @param force 强制检查，忽略冷却时间
 * @returns 是否有可用更新
 */
export async function checkForUpdate(force = false): Promise<boolean> {
  const store = useUpdateStore.getState();

  // 检查冷却时间
  if (!force && !shouldCheckForUpdate()) {
    return store.availableUpdate !== null;
  }

  // 防止并发检查
  if (store.isChecking) {
    return false;
  }

  store.setIsChecking(true);

  try {
    const updateResult = await check();
    store.setLastCheckTime(Date.now());

    if (updateResult?.available) {
      const version = updateResult.version;

      // 检查是否被跳过
      if (store.isVersionSkipped(version)) {
        store.setAvailableUpdate(null);
        return false;
      }

      const updateInfo: UpdateInfo = {
        version,
        body: updateResult.body ?? null,
        date: updateResult.date ?? null,
      };

      store.setAvailableUpdate(updateInfo, updateResult);
      return true;
    } else {
      store.setAvailableUpdate(null);
      return false;
    }
  } catch (err) {
    reportOperationError({
      source: "useUpdateStore.checkForUpdate",
      action: "Auto check for updates",
      error: err,
      level: "warning",
    });
    return false;
  } finally {
    store.setIsChecking(false);
  }
}

/**
 * 初始化自动更新检查
 * 应在 App 启动时调用，会延迟执行以避免影响启动性能
 */
export function initAutoUpdateCheck(delayMs = 5000): void {
  setTimeout(async () => {
    const hasUpdate = await checkForUpdate();
    if (hasUpdate) {
      console.log(
        "[Update] New version available:",
        useUpdateStore.getState().availableUpdate?.version
      );
    }
  }, delayMs);
}

/**
 * 获取 Update handle 用于下载安装
 */
export function getUpdateHandle(): Update | null {
  return useUpdateStore.getState().updateHandle;
}
