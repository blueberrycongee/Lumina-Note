import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const { checkMock, invokeMock, listenMock, isTauriAvailableMock } = vi.hoisted(() => ({
  checkMock: vi.fn(),
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
  isTauriAvailableMock: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: checkMock,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

vi.mock("@/lib/tauri", () => ({
  isTauriAvailable: isTauriAvailableMock,
}));

import {
  checkForUpdate,
  initAutoUpdateCheck,
  initResumableUpdateListeners,
  useUpdateStore,
} from "./useUpdateStore";

describe("useUpdateStore.checkForUpdate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    checkMock.mockReset();
    invokeMock.mockReset();
    listenMock.mockReset();
    isTauriAvailableMock.mockReset();
    listenMock.mockResolvedValue(vi.fn());
    invokeMock.mockResolvedValue(null);
    isTauriAvailableMock.mockReturnValue(true);
    useUpdateStore.persist?.clearStorage?.();
    useUpdateStore.setState({
      lastCheckTime: 0,
      skippedVersions: [],
      checkCooldownHours: 24,
      currentVersion: "1.0.0",
      availableUpdate: null,
      updateHandle: null,
      hasUnreadUpdate: false,
      isChecking: false,
      installTelemetry: {
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
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes timeout options to updater check", async () => {
    checkMock.mockResolvedValue(null);

    const pending = checkForUpdate(true);
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result).toBe("none");
    expect(checkMock).toHaveBeenCalledTimes(1);
    expect(checkMock).toHaveBeenCalledWith(expect.objectContaining({ timeout: 15000 }));
  });

  it("retries transient failures with backoff and eventually succeeds", async () => {
    checkMock
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValueOnce({ available: true, version: "9.9.9", body: "notes", date: "2026-03-05" });

    const pending = checkForUpdate(true);
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result).toBe("available");
    expect(checkMock).toHaveBeenCalledTimes(2);
    expect(useUpdateStore.getState().availableUpdate?.version).toBe("9.9.9");
  });

  it("maps resumable update events into observable telemetry", () => {
    const state = useUpdateStore.getState() as any;

    state.applyResumableEvent({
      type: "started",
      taskId: "task-1",
      version: "9.9.9",
      attempt: 1,
      downloadedBytes: 0,
      totalBytes: 1024,
      resumable: true,
      stage: "downloading",
      timestamp: Date.now(),
    });

    state.applyResumableEvent({
      type: "progress",
      taskId: "task-1",
      version: "9.9.9",
      attempt: 1,
      downloadedBytes: 512,
      totalBytes: 1024,
      resumable: true,
      stage: "downloading",
      timestamp: Date.now(),
    });

    const telemetry = (useUpdateStore.getState() as any).installTelemetry;
    expect(telemetry.taskId).toBe("task-1");
    expect(telemetry.version).toBe("9.9.9");
    expect(telemetry.resumable).toBe(true);
    expect(telemetry.phase).toBe("downloading");
    expect(telemetry.downloadedBytes).toBe(512);
    expect(telemetry.contentLength).toBe(1024);
    expect(telemetry.progress).toBe(50);
    expect(telemetry.canResumeAfterRestart).toBe(true);
  });

  it("restores resumable status after app restart", () => {
    const state = useUpdateStore.getState() as any;
    state.hydrateResumableStatus({
      taskId: "task-restart",
      version: "9.9.9",
      attempt: 2,
      downloadedBytes: 768,
      totalBytes: 1024,
      resumable: true,
      stage: "downloading",
      status: "downloading",
      timestamp: Date.now(),
    });

    const telemetry = (useUpdateStore.getState() as any).installTelemetry;
    expect(telemetry.taskId).toBe("task-restart");
    expect(telemetry.attempt).toBe(2);
    expect(telemetry.phase).toBe("downloading");
    expect(telemetry.downloadedBytes).toBe(768);
    expect(telemetry.progress).toBe(75);
  });

  it("preserves terminal telemetry when backend reports no active task", () => {
    const state = useUpdateStore.getState() as any;
    state.hydrateResumableStatus({
      taskId: "task-stale",
      version: "9.9.9",
      attempt: 1,
      downloadedBytes: 1024,
      totalBytes: 1024,
      resumable: true,
      stage: "ready",
      status: "ready",
      timestamp: Date.now(),
    });

    state.hydrateResumableStatus(null);

    const telemetry = (useUpdateStore.getState() as any).installTelemetry;
    expect(telemetry.phase).toBe("ready");
    expect(telemetry.taskId).toBe("task-stale");
    expect(telemetry.progress).toBe(100);
  });

  it("clears stale ready telemetry after the app version catches up", () => {
    useUpdateStore.setState({
      installTelemetry: {
        sessionId: 4,
        taskId: "task-ready",
        version: "9.9.9",
        phase: "ready",
        attempt: 1,
        progress: 100,
        downloadedBytes: 1024,
        contentLength: 1024,
        startedAt: 1,
        updatedAt: 1,
        finishedAt: 1,
        error: null,
        errorCode: null,
        resumable: true,
        retryDelayMs: null,
        lastHttpStatus: 200,
        canResumeAfterRestart: false,
        capability: "supported",
      },
    });

    useUpdateStore.getState().setCurrentVersion("9.9.9");

    const telemetry = useUpdateStore.getState().installTelemetry;
    expect(telemetry.phase).toBe("idle");
    expect(telemetry.sessionId).toBe(4);
  });

  it("skips resumable listener init when Tauri bridge is unavailable", async () => {
    isTauriAvailableMock.mockReturnValue(false);

    await initResumableUpdateListeners();

    expect(listenMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("skips update checks during startup when Tauri bridge is unavailable", async () => {
    isTauriAvailableMock.mockReturnValue(false);

    initAutoUpdateCheck(5000);
    await vi.runAllTimersAsync();

    expect(checkMock).not.toHaveBeenCalled();
  });

  it("returns unsupported without invoking updater check when Tauri bridge is unavailable", async () => {
    isTauriAvailableMock.mockReturnValue(false);

    const result = await checkForUpdate(true);

    expect(result).toBe("unsupported");
    expect(checkMock).not.toHaveBeenCalled();
  });
});
