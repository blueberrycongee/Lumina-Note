import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  _resetReporterForTesting,
  getRecentErrors,
  reportError,
  subscribeErrors,
} from "./reporter";

describe("reportError", () => {
  beforeEach(() => {
    _resetReporterForTesting();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an envelope with id + timestamp filled in", () => {
    const env = reportError({
      kind: "session.list",
      severity: "background",
      message: "boom",
      retryable: true,
    });
    expect(env.id).toMatch(/^err_/);
    expect(env.timestamp).toBeGreaterThan(0);
    expect(env.kind).toBe("session.list");
  });

  it("pushes envelopes onto the ring buffer", () => {
    reportError({
      kind: "session.create",
      severity: "transient",
      message: "a",
      retryable: false,
    });
    reportError({
      kind: "session.delete",
      severity: "transient",
      message: "b",
      retryable: false,
    });
    const buf = getRecentErrors();
    expect(buf).toHaveLength(2);
    expect(buf.map((e) => e.message)).toEqual(["a", "b"]);
  });

  it("caps the ring at 200 entries (oldest evicted)", () => {
    for (let i = 0; i < 250; i++) {
      reportError({
        kind: "session.list",
        severity: "background",
        message: `msg-${i}`,
        retryable: false,
      });
    }
    const buf = getRecentErrors();
    expect(buf).toHaveLength(200);
    // First 50 should have been evicted, so msg-50 is now the oldest.
    expect(buf[0].message).toBe("msg-50");
    expect(buf[buf.length - 1].message).toBe("msg-249");
  });

  it("notifies subscribers in order", () => {
    const calls: string[] = [];
    const unsub = subscribeErrors((env) => calls.push(env.message));
    reportError({
      kind: "task.start",
      severity: "blocker",
      message: "first",
      retryable: false,
    });
    reportError({
      kind: "task.start",
      severity: "blocker",
      message: "second",
      retryable: false,
    });
    expect(calls).toEqual(["first", "second"]);
    unsub();
    reportError({
      kind: "task.start",
      severity: "blocker",
      message: "third",
      retryable: false,
    });
    expect(calls).toEqual(["first", "second"]);
  });

  it("isolates a throwing subscriber from the reporter", () => {
    subscribeErrors(() => {
      throw new Error("subscriber bug");
    });
    expect(() =>
      reportError({
        kind: "permission.reply",
        severity: "blocker",
        message: "should still work",
        retryable: false,
      }),
    ).not.toThrow();
    expect(getRecentErrors()).toHaveLength(1);
  });

  it("emits a single grep-friendly console line", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    reportError({
      kind: "session.provider_error",
      severity: "blocker",
      message: "deepseek 400",
      retryable: false,
      sessionId: "ses_abc",
      traceId: "trace_xyz",
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0][0] as string;
    expect(line).toContain("[lumina:error]");
    expect(line).toContain("kind=session.provider_error");
    expect(line).toContain("severity=blocker");
    expect(line).toContain("session=ses_abc");
    expect(line).toContain("trace=trace_xyz");
    expect(line).toContain('msg="deepseek 400"');
  });
});
