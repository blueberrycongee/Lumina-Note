import { describe, expect, it, vi } from "vitest";
import { retryWithExponentialBackoff } from "./retry";

describe("retryWithExponentialBackoff", () => {
  it("returns immediately when first attempt succeeds", async () => {
    const task = vi.fn().mockResolvedValue("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await retryWithExponentialBackoff(task, {
      maxAttempts: 3,
      baseDelayMs: 100,
      sleep,
    });

    expect(result).toBe("ok");
    expect(task).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries with exponential delays until success", async () => {
    const task = vi
      .fn()
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second"))
      .mockResolvedValue("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await retryWithExponentialBackoff(task, {
      maxAttempts: 3,
      baseDelayMs: 100,
      sleep,
    });

    expect(result).toBe("ok");
    expect(task).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 200);
  });

  it("caps the delay with maxDelayMs", async () => {
    const task = vi
      .fn()
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second"))
      .mockResolvedValue("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);

    await retryWithExponentialBackoff(task, {
      maxAttempts: 3,
      baseDelayMs: 1_000,
      maxDelayMs: 1_500,
      sleep,
    });

    expect(sleep).toHaveBeenNthCalledWith(1, 1_000);
    expect(sleep).toHaveBeenNthCalledWith(2, 1_500);
  });

  it("throws the last error after exhausting attempts", async () => {
    const task = vi.fn().mockRejectedValue(new Error("boom"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      retryWithExponentialBackoff(task, {
        maxAttempts: 3,
        baseDelayMs: 100,
        sleep,
      })
    ).rejects.toThrow("boom");

    expect(task).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
