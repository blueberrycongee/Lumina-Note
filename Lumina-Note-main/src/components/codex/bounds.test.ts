import { describe, expect, it } from "vitest";
import { createBoundsSnapshot, normalizeBounds, shouldUpdateBounds } from "./bounds";

describe("codex bounds normalization", () => {
  it("rounds to integer pixels and clamps negatives", () => {
    const normalized = normalizeBounds({ x: 10.4, y: 20.6, width: -1, height: 99.2 });
    expect(normalized).toEqual({ x: 10, y: 21, width: 0, height: 99 });
  });

  it("updates when no previous snapshot", () => {
    expect(shouldUpdateBounds(null, { x: 0, y: 0, width: 100, height: 100 })).toBe(true);
  });

  it("skips update for sub-pixel jitter", () => {
    const prev = createBoundsSnapshot({ x: 100, y: 200, width: 300, height: 400 });
    const nextRaw = { x: 100.3, y: 200.4, width: 300.2, height: 399.9 };
    expect(shouldUpdateBounds(prev, nextRaw)).toBe(false);
  });

  it("updates when movement exceeds jitter threshold", () => {
    const prev = createBoundsSnapshot({ x: 100, y: 200, width: 300, height: 400 });
    const nextRaw = { x: 101.2, y: 200, width: 300, height: 400 };
    expect(shouldUpdateBounds(prev, nextRaw)).toBe(true);
  });
});

