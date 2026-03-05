import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const { checkMock } = vi.hoisted(() => ({
  checkMock: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: checkMock,
}));

import { checkForUpdate, useUpdateStore } from "./useUpdateStore";

describe("useUpdateStore.checkForUpdate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    checkMock.mockReset();
    useUpdateStore.persist?.clearStorage?.();
    useUpdateStore.setState({
      lastCheckTime: 0,
      skippedVersions: [],
      checkCooldownHours: 24,
      availableUpdate: null,
      updateHandle: null,
      hasUnreadUpdate: false,
      isChecking: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes timeout options to updater check", async () => {
    checkMock.mockResolvedValue(null);

    const pending = checkForUpdate(true);
    await vi.runAllTimersAsync();
    const hasUpdate = await pending;

    expect(hasUpdate).toBe(false);
    expect(checkMock).toHaveBeenCalledTimes(1);
    expect(checkMock).toHaveBeenCalledWith(expect.objectContaining({ timeout: 15000 }));
  });

  it("retries transient failures with backoff and eventually succeeds", async () => {
    checkMock
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValueOnce({ available: true, version: "9.9.9", body: "notes", date: "2026-03-05" });

    const pending = checkForUpdate(true);
    await vi.runAllTimersAsync();
    const hasUpdate = await pending;

    expect(hasUpdate).toBe(true);
    expect(checkMock).toHaveBeenCalledTimes(2);
    expect(useUpdateStore.getState().availableUpdate?.version).toBe("9.9.9");
  });
});
