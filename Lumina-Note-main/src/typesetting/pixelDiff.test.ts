import {
  DEFAULT_PIXEL_DIFF_THRESHOLDS,
  diffPixelData,
  evaluatePixelDiff,
} from "./pixelDiff";

describe("diffPixelData", () => {
  it("returns zero deltas for identical buffers", () => {
    const base = new Uint8ClampedArray([0, 0, 0, 255, 10, 10, 10, 255]);
    const diff = diffPixelData(base, new Uint8ClampedArray(base));

    expect(diff.totalPixels).toBe(2);
    expect(diff.diffPixels).toBe(0);
    expect(diff.diffRatio).toBe(0);
    expect(diff.maxChannelDelta).toBe(0);
    expect(diff.meanChannelDelta).toBe(0);
  });

  it("reports pixel differences and channel deltas", () => {
    const base = new Uint8ClampedArray([0, 0, 0, 255, 10, 10, 10, 255]);
    const candidate = new Uint8ClampedArray([0, 0, 0, 255, 20, 10, 10, 255]);

    const diff = diffPixelData(base, candidate);

    expect(diff.totalPixels).toBe(2);
    expect(diff.diffPixels).toBe(1);
    expect(diff.diffRatio).toBeCloseTo(0.5);
    expect(diff.maxChannelDelta).toBe(10);
    expect(diff.meanChannelDelta).toBeCloseTo(10 / 8);
  });

  it("throws when buffers have different lengths", () => {
    expect(() => diffPixelData(new Uint8ClampedArray(4), new Uint8ClampedArray(8))).toThrow(
      /length mismatch/i,
    );
  });

  it("throws when buffers are not RGBA-length", () => {
    expect(() => diffPixelData(new Uint8ClampedArray(3), new Uint8ClampedArray(3))).toThrow(
      /multiple of 4/i,
    );
  });

  it("evaluates pixel diffs against thresholds", () => {
    const base = new Uint8ClampedArray([0, 0, 0, 255, 10, 10, 10, 255]);
    const candidate = new Uint8ClampedArray([0, 0, 0, 255, 12, 10, 10, 255]);
    const diff = diffPixelData(base, candidate);

    const evaluation = evaluatePixelDiff(diff, {
      maxDiffRatio: 0.6,
      maxMeanChannelDelta: 2,
      maxMaxChannelDelta: 255,
    });

    expect(evaluation.pass).toBe(true);
    expect(evaluation.failures).toEqual([]);
  });

  it("reports threshold failures for pixel diffs", () => {
    const base = new Uint8ClampedArray([0, 0, 0, 255, 10, 10, 10, 255]);
    const candidate = new Uint8ClampedArray([0, 0, 0, 255, 20, 10, 10, 255]);
    const diff = diffPixelData(base, candidate);

    const evaluation = evaluatePixelDiff(diff, {
      maxDiffRatio: 0.4,
      maxMeanChannelDelta: 0.5,
      maxMaxChannelDelta: 5,
    });

    expect(evaluation.pass).toBe(false);
    expect(evaluation.failures).toEqual([
      { kind: "diffRatio", value: diff.diffRatio, threshold: 0.4 },
      { kind: "meanChannelDelta", value: diff.meanChannelDelta, threshold: 0.5 },
      { kind: "maxChannelDelta", value: diff.maxChannelDelta, threshold: 5 },
    ]);
  });

  it("ships conservative default thresholds", () => {
    expect(DEFAULT_PIXEL_DIFF_THRESHOLDS.maxDiffRatio).toBeGreaterThan(0);
    expect(DEFAULT_PIXEL_DIFF_THRESHOLDS.maxMeanChannelDelta).toBeGreaterThan(0);
    expect(DEFAULT_PIXEL_DIFF_THRESHOLDS.maxMaxChannelDelta).toBeGreaterThan(0);
  });
});
