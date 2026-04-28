import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { classifyHttpError, retryWithBackoff } from "./retry";

describe("classifyHttpError", () => {
  it("treats abort as non-retryable", () => {
    const err = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(classifyHttpError(err)).toEqual({
      retryable: false,
      reason: "abort",
    });
  });

  it("treats no-status (network) as retryable", () => {
    expect(classifyHttpError(new Error("ECONNREFUSED"))).toEqual({
      retryable: true,
      reason: "network",
    });
  });

  it("retries on 5xx", () => {
    expect(classifyHttpError({ status: 503 })).toEqual({
      retryable: true,
      reason: "503",
    });
    expect(classifyHttpError({ response: { status: 502 } })).toEqual({
      retryable: true,
      reason: "502",
    });
  });

  it("retries on 408 / 429 only of the 4xx range", () => {
    expect(classifyHttpError({ status: 408 }).retryable).toBe(true);
    expect(classifyHttpError({ status: 429 }).retryable).toBe(true);
    expect(classifyHttpError({ status: 400 }).retryable).toBe(false);
    expect(classifyHttpError({ status: 401 }).retryable).toBe(false);
    expect(classifyHttpError({ status: 404 }).retryable).toBe(false);
  });
});

describe("retryWithBackoff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the value on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(retryWithBackoff(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable errors then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce("ok");
    const promise = retryWithBackoff(fn, { delaysMs: [10] });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry 4xx", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 400 });
    await expect(retryWithBackoff(fn)).rejects.toEqual({ status: 400 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxAttempts and throws the last error", async () => {
    const err = { status: 503 };
    const fn = vi.fn().mockRejectedValue(err);
    const onRetry = vi.fn();
    const promise = retryWithBackoff(fn, {
      maxAttempts: 3,
      delaysMs: [1, 1],
      onRetry,
    });
    // Attach the rejection handler before draining timers so vitest
    // doesn't flag this as an unhandled rejection mid-flight.
    const assertion = expect(promise).rejects.toBe(err);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });
});
