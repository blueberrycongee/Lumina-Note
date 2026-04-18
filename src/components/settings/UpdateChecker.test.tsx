import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateChecker } from "./UpdateChecker";
import { useUpdateStore } from "@/stores/useUpdateStore";

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

vi.mock("@/lib/host", () => ({
  isTauriAvailable: () => false,
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("UpdateChecker", () => {
  beforeEach(() => {
    useUpdateStore.setState({
      lastCheckTime: 0,
      skippedVersions: [],
      checkCooldownHours: 24,
      currentVersion: "1.0.0",
      availableUpdate: {
        version: "9.9.9",
        body: "test notes",
        date: "2026-03-05",
      },
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

  it("keeps update flow running after unmount and records observable install state", async () => {
    const deferred = createDeferred<void>();
    let completed = false;

    const downloadAndInstall = vi.fn(async (onEvent?: (event: any) => void) => {
      onEvent?.({ event: "Started", data: { contentLength: 100 } });
      onEvent?.({ event: "Progress", data: { chunkLength: 30 } });
      await deferred.promise;
      onEvent?.({ event: "Progress", data: { chunkLength: 70 } });
      onEvent?.({ event: "Finished" });
      completed = true;
    });

    useUpdateStore.setState({
      updateHandle: {
        downloadAndInstall,
      } as any,
    });

    const view = render(<UpdateChecker />);

    fireEvent.click(screen.getByRole("button", { name: /下载并安装/i }));

    await waitFor(() => {
      expect(downloadAndInstall).toHaveBeenCalledTimes(1);
    });

    view.unmount();

    await act(async () => {
      deferred.resolve();
      await Promise.resolve();
    });

    expect(completed).toBe(true);

    const telemetry = (useUpdateStore.getState() as any).installTelemetry;
    expect(telemetry.phase).toBe("ready");
    expect(telemetry.progress).toBe(100);
    expect(telemetry.version).toBe("9.9.9");
  });

  it("surfaces persisted ready telemetry when the installed version still needs relaunch", () => {
    useUpdateStore.setState({
      availableUpdate: null,
      hasUnreadUpdate: false,
      installTelemetry: {
        sessionId: 3,
        taskId: "task-stale",
        version: "9.9.9",
        phase: "ready",
        attempt: 1,
        progress: 100,
        downloadedBytes: 42,
        contentLength: 42,
        startedAt: 1,
        updatedAt: 1,
        finishedAt: 1,
        error: null,
        errorCode: null,
        resumable: true,
        retryDelayMs: null,
        lastHttpStatus: 200,
        canResumeAfterRestart: true,
        capability: "supported",
      },
    });

    render(<UpdateChecker />);

    expect(screen.getByRole("button", { name: "重启应用" })).toBeInTheDocument();
    expect(screen.getByText("Update telemetry")).toBeInTheDocument();
  });

  it("shows unsupported instead of up-to-date outside Tauri", async () => {
    useUpdateStore.setState({
      availableUpdate: null,
      hasUnreadUpdate: false,
    });

    render(<UpdateChecker />);

    fireEvent.click(screen.getByRole("button", { name: "检查更新" }));

    await waitFor(() => {
      expect(screen.getByText("当前环境不支持更新")).toBeInTheDocument();
    });
    expect(screen.queryByText("已是最新版本")).not.toBeInTheDocument();
  });
});
