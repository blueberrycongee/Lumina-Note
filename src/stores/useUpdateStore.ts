/**
 * 更新管理 Store
 * 负责自动检查更新、记录检查时间、管理跳过版本以及可恢复下载遥测
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { check } from "@/lib/host";
import type { Update } from "@/lib/host";
import { invoke } from "@/lib/host";
import { listen, UnlistenFn } from "@/lib/host";
import { reportOperationError } from "@/lib/reportError";
import { retryWithExponentialBackoff } from "@/lib/retry";
import { isTauriAvailable } from "@/lib/host";

export const UPDATE_CHECK_TIMEOUT_MS = 15_000;
const UPDATE_CHECK_MAX_ATTEMPTS = 3;
const UPDATE_CHECK_BASE_DELAY_MS = 1_000;
const UPDATE_CHECK_MAX_DELAY_MS = 8_000;

const RESUMABLE_EVENT_NAME = "update:resumable-event";

type UpdateResumableEventType =
  | "started"
  | "resumed"
  | "progress"
  | "retrying"
  | "verifying"
  | "installing"
  | "ready"
  | "error"
  | "cancelled";

export type UpdateInstallPhase =
  | "idle"
  | "downloading"
  | "verifying"
  | "installing"
  | "ready"
  | "error"
  | "cancelled";

export type UpdateDownloadCapability = "unknown" | "supported" | "unsupported";
export type UpdateCheckResult = "available" | "none" | "unsupported";

export interface UpdateInfo {
  version: string;
  body: string | null;
  date: string | null;
}

export interface ResumableUpdateStatus {
  taskId: string;
  version: string;
  attempt: number;
  downloadedBytes: number;
  totalBytes?: number | null;
  resumable: boolean;
  stage: string;
  status?: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  timestamp: number;
  retryDelayMs?: number | null;
  lastHttpStatus?: number | null;
  canResumeAfterRestart?: boolean;
}

export interface ResumableUpdateEvent extends ResumableUpdateStatus {
  type: UpdateResumableEventType;
}

export interface UpdateInstallTelemetry {
  sessionId: number;
  taskId: string | null;
  version: string | null;
  phase: UpdateInstallPhase;
  attempt: number;
  progress: number;
  downloadedBytes: number;
  contentLength: number;
  startedAt: number | null;
  updatedAt: number | null;
  finishedAt: number | null;
  error: string | null;
  errorCode: string | null;
  resumable: boolean;
  retryDelayMs: number | null;
  lastHttpStatus: number | null;
  canResumeAfterRestart: boolean;
  capability: UpdateDownloadCapability;
}

const createInitialInstallTelemetry = (): UpdateInstallTelemetry => ({
  sessionId: 0,
  taskId: null,
  version: null,
  phase: "idle",
  attempt: 0,
  progress: 0,
  downloadedBytes: 0,
  contentLength: 0,
  startedAt: null,
  updatedAt: null,
  finishedAt: null,
  error: null,
  errorCode: null,
  resumable: false,
  retryDelayMs: null,
  lastHttpStatus: null,
  canResumeAfterRestart: false,
  capability: "unknown",
});

const resetInstallTelemetryWithSession = (sessionId: number): UpdateInstallTelemetry => ({
  ...createInitialInstallTelemetry(),
  sessionId,
});

const normalizeTelemetryVersion = (
  version: Pick<UpdateInstallTelemetry, "version">["version"],
): string | null => {
  if (typeof version !== "string") return null;
  const trimmed = version.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseComparableVersion = (version: string): number[] | null => {
  const normalized = version.trim().replace(/^v/i, "").split("-")[0]?.split("+")[0] ?? "";
  if (!/^\d+(?:\.\d+)*$/.test(normalized)) {
    return null;
  }
  return normalized.split(".").map((part) => Number.parseInt(part, 10));
};

const isCurrentVersionCaughtUp = (
  currentVersion: string | null,
  targetVersion: string | null,
): boolean => {
  const normalizedCurrent = normalizeTelemetryVersion(currentVersion);
  const normalizedTarget = normalizeTelemetryVersion(targetVersion);
  if (!normalizedCurrent || !normalizedTarget) {
    return false;
  }

  const currentParts = parseComparableVersion(normalizedCurrent);
  const targetParts = parseComparableVersion(normalizedTarget);
  if (!currentParts || !targetParts) {
    return normalizedCurrent === normalizedTarget;
  }

  const maxLen = Math.max(currentParts.length, targetParts.length);
  for (let index = 0; index < maxLen; index += 1) {
    const currentPart = currentParts[index] ?? 0;
    const targetPart = targetParts[index] ?? 0;
    if (currentPart > targetPart) return true;
    if (currentPart < targetPart) return false;
  }

  return true;
};

interface PersistedUpdateState {
  lastCheckTime?: number;
  skippedVersions?: string[];
  checkCooldownHours?: number;
  installTelemetry?: Partial<UpdateInstallTelemetry> | null;
}

interface UpdateState {
  // 持久化数据
  lastCheckTime: number;
  skippedVersions: string[];
  checkCooldownHours: number;
  installTelemetry: UpdateInstallTelemetry;

  // 运行时状态
  currentVersion: string | null;
  availableUpdate: UpdateInfo | null;
  updateHandle: Update | null;
  hasUnreadUpdate: boolean;
  isChecking: boolean;

  // Actions
  setLastCheckTime: (time: number) => void;
  setAvailableUpdate: (update: UpdateInfo | null, handle?: Update | null) => void;
  setHasUnreadUpdate: (hasUnread: boolean) => void;
  setIsChecking: (checking: boolean) => void;
  setCurrentVersion: (version: string | null) => void;
  skipVersion: (version: string) => void;
  clearSkippedVersion: (version: string) => void;
  setCheckCooldownHours: (hours: number) => void;
  isVersionSkipped: (version: string) => boolean;
  markUpdateAsRead: () => void;
  clearUpdate: () => void;
  beginInstallTelemetry: (version?: string | null) => number;
  recordInstallStarted: (contentLength?: number) => void;
  recordInstallProgress: (chunkLength: number) => void;
  recordInstallInstalling: () => void;
  recordInstallRetry: (nextAttempt: number) => void;
  recordInstallReady: () => void;
  recordInstallError: (message: string, errorCode?: string | null) => void;
  applyResumableEvent: (event: ResumableUpdateEvent) => void;
  hydrateResumableStatus: (status: ResumableUpdateStatus | null) => void;
  resetInstallTelemetry: () => void;
}

const clampAttempt = (attempt: number | undefined): number => {
  if (!Number.isFinite(attempt)) return 1;
  return Math.max(1, Math.floor(attempt || 1));
};

export const isTerminalInstallPhase = (phase: UpdateInstallPhase): boolean =>
  phase === "ready" || phase === "error" || phase === "cancelled";

export const hasActionableTerminalInstallPhase = (
  telemetry: Pick<UpdateInstallTelemetry, "phase" | "version">,
  currentVersion: string | null,
): boolean => {
  if (!isTerminalInstallPhase(telemetry.phase)) return false;
  const telemetryVersion = normalizeTelemetryVersion(telemetry.version);
  if (!telemetryVersion) return false;
  if (isCurrentVersionCaughtUp(currentVersion, telemetryVersion)) {
    return false;
  }
  return true;
};

const migratePersistedUpdateState = (
  persistedState: unknown,
  version: number,
): PersistedUpdateState => {
  if (!persistedState || typeof persistedState !== "object") {
    return (persistedState as PersistedUpdateState | undefined) ?? {};
  }

  const state = persistedState as PersistedUpdateState;
  if (version >= 1 || !state.installTelemetry) {
    return state;
  }

  const persistedTelemetry = state.installTelemetry;
  const phase = persistedTelemetry.phase;
  const sessionId = Number.isFinite(persistedTelemetry.sessionId)
    ? Number(persistedTelemetry.sessionId)
    : 0;

  if (
    phase &&
    isTerminalInstallPhase(phase as UpdateInstallPhase) &&
    !normalizeTelemetryVersion(persistedTelemetry.version ?? null)
  ) {
    return {
      ...state,
      installTelemetry: resetInstallTelemetryWithSession(sessionId),
    };
  }

  return state;
};

const mapStageToPhase = (stage: string | undefined): UpdateInstallPhase => {
  switch ((stage || "").toLowerCase()) {
    case "downloading":
      return "downloading";
    case "verifying":
      return "verifying";
    case "installing":
      return "installing";
    case "ready":
      return "ready";
    case "cancelled":
      return "cancelled";
    case "error":
      return "error";
    default:
      return "downloading";
  }
};

const buildTelemetryFromResumable = (
  prev: UpdateInstallTelemetry,
  payload: ResumableUpdateStatus,
): UpdateInstallTelemetry => {
  const totalBytes =
    Number.isFinite(payload.totalBytes) && (payload.totalBytes || 0) > 0
      ? Number(payload.totalBytes)
      : prev.contentLength;
  const downloadedBytes = Math.max(
    0,
    Number.isFinite(payload.downloadedBytes) ? Number(payload.downloadedBytes) : prev.downloadedBytes,
  );
  const progress =
    totalBytes > 0 ? Math.min(100, (downloadedBytes / totalBytes) * 100) : prev.progress;
  const phase = mapStageToPhase(payload.stage || payload.status);
  const now = Number.isFinite(payload.timestamp) ? Number(payload.timestamp) : Date.now();
  const finishedAt = phase === "ready" || phase === "error" || phase === "cancelled" ? now : null;

  return {
    ...prev,
    taskId: payload.taskId || prev.taskId,
    version: payload.version || prev.version,
    phase,
    attempt: clampAttempt(payload.attempt),
    progress,
    downloadedBytes,
    contentLength: totalBytes,
    startedAt: prev.startedAt ?? now,
    updatedAt: now,
    finishedAt,
    error: payload.errorMessage ?? (phase === "error" ? prev.error : null),
    errorCode: payload.errorCode ?? (phase === "error" ? prev.errorCode : null),
    resumable: Boolean(payload.resumable),
    retryDelayMs:
      Number.isFinite(payload.retryDelayMs) && payload.retryDelayMs !== null
        ? Number(payload.retryDelayMs)
        : null,
    lastHttpStatus:
      Number.isFinite(payload.lastHttpStatus) && payload.lastHttpStatus !== null
        ? Number(payload.lastHttpStatus)
        : null,
    canResumeAfterRestart: payload.canResumeAfterRestart !== false,
    capability: payload.resumable ? "supported" : "unsupported",
  };
};

export const useUpdateStore = create<UpdateState>()(
  persist(
    (set, get) => ({
      // 持久化数据
      lastCheckTime: 0,
      skippedVersions: [],
      checkCooldownHours: 24,
      installTelemetry: createInitialInstallTelemetry(),

      // 运行时状态（不持久化）
      currentVersion: null,
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

      setCurrentVersion: (version) =>
        set((state) => ({
          currentVersion: version,
          installTelemetry:
            isTerminalInstallPhase(state.installTelemetry.phase) &&
            isCurrentVersionCaughtUp(version, state.installTelemetry.version)
              ? resetInstallTelemetryWithSession(state.installTelemetry.sessionId)
              : state.installTelemetry,
        })),

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

      beginInstallTelemetry: (version = null) => {
        const nextSessionId = get().installTelemetry.sessionId + 1;
        const now = Date.now();
        set({
          installTelemetry: {
            ...createInitialInstallTelemetry(),
            sessionId: nextSessionId,
            phase: "downloading",
            version,
            attempt: 1,
            startedAt: now,
            updatedAt: now,
          },
        });
        return nextSessionId;
      },

      recordInstallStarted: (contentLength = 0) =>
        set((state) => ({
          installTelemetry: {
            ...state.installTelemetry,
            phase: "downloading",
            contentLength:
              Number.isFinite(contentLength) && contentLength > 0
                ? contentLength
                : state.installTelemetry.contentLength,
            updatedAt: Date.now(),
            error: null,
            errorCode: null,
          },
        })),

      recordInstallProgress: (chunkLength) =>
        set((state) => {
          const delta = Number.isFinite(chunkLength) && chunkLength > 0 ? chunkLength : 0;
          const downloadedBytes = state.installTelemetry.downloadedBytes + delta;
          const contentLength = state.installTelemetry.contentLength;
          const progress =
            contentLength > 0
              ? Math.min(100, (downloadedBytes / contentLength) * 100)
              : state.installTelemetry.progress;
          return {
            installTelemetry: {
              ...state.installTelemetry,
              phase: "downloading",
              downloadedBytes,
              progress,
              updatedAt: Date.now(),
              error: null,
              errorCode: null,
            },
          };
        }),

      recordInstallInstalling: () =>
        set((state) => ({
          installTelemetry: {
            ...state.installTelemetry,
            phase: "installing",
            updatedAt: Date.now(),
            error: null,
            errorCode: null,
          },
        })),

      recordInstallRetry: (nextAttempt) =>
        set((state) => ({
          installTelemetry: {
            ...state.installTelemetry,
            phase: "downloading",
            attempt: Math.max(1, nextAttempt),
            progress: 0,
            downloadedBytes: 0,
            contentLength: 0,
            updatedAt: Date.now(),
            error: null,
            errorCode: null,
          },
        })),

      recordInstallReady: () =>
        set((state) => {
          const now = Date.now();
          return {
            installTelemetry: {
              ...state.installTelemetry,
              phase: "ready",
              progress: 100,
              updatedAt: now,
              finishedAt: now,
              error: null,
              errorCode: null,
            },
          };
        }),

      recordInstallError: (message, errorCode = undefined) =>
        set((state) => {
          const now = Date.now();
          return {
            installTelemetry: {
              ...state.installTelemetry,
              phase: "error",
              updatedAt: now,
              finishedAt: now,
              error: message,
              errorCode: errorCode ?? null,
            },
          };
        }),

      applyResumableEvent: (event) =>
        set((state) => ({
          installTelemetry: buildTelemetryFromResumable(state.installTelemetry, event),
        })),

      hydrateResumableStatus: (status) =>
        set((state) => {
          if (status) {
            const nextTelemetry = buildTelemetryFromResumable(state.installTelemetry, status);
            return {
              installTelemetry:
                isTerminalInstallPhase(nextTelemetry.phase) &&
                !hasActionableTerminalInstallPhase(nextTelemetry, state.currentVersion)
                  ? resetInstallTelemetryWithSession(state.installTelemetry.sessionId)
                  : nextTelemetry,
            };
          }

          return {
            installTelemetry: hasActionableTerminalInstallPhase(
              state.installTelemetry,
              state.currentVersion,
            )
              ? state.installTelemetry
              : resetInstallTelemetryWithSession(state.installTelemetry.sessionId),
          };
        }),

      resetInstallTelemetry: () =>
        set((state) => ({
          installTelemetry: resetInstallTelemetryWithSession(state.installTelemetry.sessionId),
        })),
    }),
    {
      name: "lumina-update",
      version: 1,
      migrate: migratePersistedUpdateState,
      partialize: (state) => ({
        lastCheckTime: state.lastCheckTime,
        skippedVersions: state.skippedVersions,
        checkCooldownHours: state.checkCooldownHours,
        installTelemetry: state.installTelemetry,
      }),
    },
  ),
);

let resumableUnlistenFn: UnlistenFn | null = null;
let resumableInitPromise: Promise<void> | null = null;

const parseResumableEvent = (payload: unknown): ResumableUpdateEvent | null => {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  const type = data.type;
  const taskId = data.taskId;
  const version = data.version;
  if (typeof type !== "string" || typeof taskId !== "string" || typeof version !== "string") {
    return null;
  }
  const timestamp =
    typeof data.timestamp === "number" && Number.isFinite(data.timestamp)
      ? data.timestamp
      : Date.now();
  return {
    type: type as UpdateResumableEventType,
    taskId,
    version,
    attempt: typeof data.attempt === "number" ? data.attempt : 1,
    downloadedBytes: typeof data.downloadedBytes === "number" ? data.downloadedBytes : 0,
    totalBytes: typeof data.totalBytes === "number" ? data.totalBytes : null,
    resumable: Boolean(data.resumable),
    stage: typeof data.stage === "string" ? data.stage : "downloading",
    status: typeof data.status === "string" ? data.status : undefined,
    errorCode: typeof data.errorCode === "string" ? data.errorCode : null,
    errorMessage: typeof data.errorMessage === "string" ? data.errorMessage : null,
    timestamp,
    retryDelayMs: typeof data.retryDelayMs === "number" ? data.retryDelayMs : null,
    lastHttpStatus: typeof data.lastHttpStatus === "number" ? data.lastHttpStatus : null,
    canResumeAfterRestart:
      typeof data.canResumeAfterRestart === "boolean" ? data.canResumeAfterRestart : true,
  };
};

const normalizeResumableStatus = (payload: unknown): ResumableUpdateStatus | null => {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  const taskId = data.taskId;
  const version = data.version;
  if (typeof taskId !== "string" || typeof version !== "string") {
    return null;
  }
  return {
    taskId,
    version,
    attempt: typeof data.attempt === "number" ? data.attempt : 1,
    downloadedBytes: typeof data.downloadedBytes === "number" ? data.downloadedBytes : 0,
    totalBytes: typeof data.totalBytes === "number" ? data.totalBytes : null,
    resumable: Boolean(data.resumable),
    stage: typeof data.stage === "string" ? data.stage : "downloading",
    status: typeof data.status === "string" ? data.status : undefined,
    errorCode: typeof data.errorCode === "string" ? data.errorCode : null,
    errorMessage: typeof data.errorMessage === "string" ? data.errorMessage : null,
    timestamp: typeof data.timestamp === "number" ? data.timestamp : Date.now(),
    retryDelayMs: typeof data.retryDelayMs === "number" ? data.retryDelayMs : null,
    lastHttpStatus: typeof data.lastHttpStatus === "number" ? data.lastHttpStatus : null,
    canResumeAfterRestart:
      typeof data.canResumeAfterRestart === "boolean" ? data.canResumeAfterRestart : true,
  };
};

export const isResumableUpdaterEnabled = (): boolean => {
  const fromEnv = (import.meta.env.VITE_RESUMABLE_UPDATER_ENABLED || "").toString().trim();
  if (fromEnv === "0" || fromEnv.toLowerCase() === "false") {
    return false;
  }
  return true;
};

export async function initResumableUpdateListeners(): Promise<void> {
  if (!isResumableUpdaterEnabled()) return;
  if (!isTauriAvailable()) return;
  if (resumableInitPromise) return resumableInitPromise;

  resumableInitPromise = (async () => {
    if (resumableUnlistenFn) {
      resumableUnlistenFn();
      resumableUnlistenFn = null;
    }

    resumableUnlistenFn = await listen(RESUMABLE_EVENT_NAME, (event) => {
      const payload = parseResumableEvent(event.payload);
      if (!payload) return;
      useUpdateStore.getState().applyResumableEvent(payload);
    });

    try {
      const status = await invoke<unknown>("update_get_resumable_status");
      useUpdateStore.getState().hydrateResumableStatus(normalizeResumableStatus(status));
    } catch (error) {
      reportOperationError({
        source: "useUpdateStore.initResumableUpdateListeners",
        action: "Sync resumable updater status",
        error,
        level: "warning",
      });
    }
  })().finally(() => {
    resumableInitPromise = null;
  });

  return resumableInitPromise;
}

export function cleanupResumableUpdateListeners(): void {
  if (resumableUnlistenFn) {
    resumableUnlistenFn();
    resumableUnlistenFn = null;
  }
}

export async function startResumableInstall(expectedVersion?: string): Promise<string> {
  const taskId = await invoke<string>("update_start_resumable_install", { expectedVersion });
  if (!taskId || typeof taskId !== "string") {
    throw new Error("Invalid resumable update task id");
  }
  return taskId;
}

export async function cancelResumableInstall(taskId?: string): Promise<void> {
  await invoke("update_cancel_resumable_install", { taskId });
}

export async function clearResumableUpdateCache(version?: string): Promise<void> {
  await invoke("update_clear_resumable_cache", { version });
}

export async function getResumableStatus(taskId?: string): Promise<ResumableUpdateStatus | null> {
  const payload = await invoke<unknown>("update_get_resumable_status", { taskId });
  return normalizeResumableStatus(payload);
}

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
export async function checkForUpdate(force = false): Promise<UpdateCheckResult> {
  if (!isTauriAvailable()) {
    return "unsupported";
  }

  const store = useUpdateStore.getState();

  // 检查冷却时间
  if (!force && !shouldCheckForUpdate()) {
    return store.availableUpdate !== null ? "available" : "none";
  }

  // 防止并发检查
  if (store.isChecking) {
    return store.availableUpdate !== null ? "available" : "none";
  }

  store.setIsChecking(true);

  try {
    const updateResult = await retryWithExponentialBackoff(
      () => check({ timeout: UPDATE_CHECK_TIMEOUT_MS }),
      {
        maxAttempts: UPDATE_CHECK_MAX_ATTEMPTS,
        baseDelayMs: UPDATE_CHECK_BASE_DELAY_MS,
        maxDelayMs: UPDATE_CHECK_MAX_DELAY_MS,
        onRetry: ({ attempt, maxAttempts, nextDelayMs, error }) => {
          console.warn("[Update] check failed, retrying", {
            attempt,
            maxAttempts,
            nextDelayMs,
            timeoutMs: UPDATE_CHECK_TIMEOUT_MS,
            error,
          });
        },
      },
    );
    store.setLastCheckTime(Date.now());

    if (updateResult?.available) {
      const version = updateResult.version;

      // 检查是否被跳过
      if (store.isVersionSkipped(version)) {
        store.setAvailableUpdate(null);
        return "none";
      }

      const updateInfo: UpdateInfo = {
        version,
        body: updateResult.body ?? null,
        date: updateResult.date ?? null,
      };

      store.setAvailableUpdate(updateInfo, updateResult);
      return "available";
    }

    store.setAvailableUpdate(null);
    return "none";
  } catch (err) {
    reportOperationError({
      source: "useUpdateStore.checkForUpdate",
      action: "Auto check for updates",
      error: err,
      level: "warning",
    });
    throw err;
  } finally {
    store.setIsChecking(false);
  }
}

/**
 * 初始化自动更新检查
 * 应在 App 启动时调用，会延迟执行以避免影响启动性能
 */
export function initAutoUpdateCheck(delayMs = 5000): void {
  if (!isTauriAvailable()) return;

  setTimeout(async () => {
    try {
      const result = await checkForUpdate();
      if (result === "available") {
        console.log(
          "[Update] New version available:",
          useUpdateStore.getState().availableUpdate?.version,
        );
      }
    } catch {
      // checkForUpdate already reports the failure
    }
  }, delayMs);
}

/**
 * 获取 Update handle 用于旧链路下载安装（作为降级兜底）
 */
export function getUpdateHandle(): Update | null {
  return useUpdateStore.getState().updateHandle;
}
