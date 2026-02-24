import { describe, expect, it } from "vitest";
import {
  DEFAULT_PDF_METRICS_THRESHOLDS,
  diffPdfMetrics,
  evaluatePdfMetricsDiff,
  mmToPt,
  PdfMetrics,
} from "./pdfMetrics";

describe("diffPdfMetrics", () => {
  it("returns zero deltas when metrics match", () => {
    const base: PdfMetrics = {
      pages: [
        { widthPt: 612, heightPt: 792 },
        { widthPt: 612, heightPt: 792 },
      ],
    };

    const diff = diffPdfMetrics(base, {
      pages: [
        { widthPt: 612, heightPt: 792 },
        { widthPt: 612, heightPt: 792 },
      ],
    });

    expect(diff.pageCountDelta).toBe(0);
    expect(diff.comparedPages).toBe(2);
    expect(diff.maxWidthDeltaPt).toBe(0);
    expect(diff.maxHeightDeltaPt).toBe(0);
    expect(diff.perPage).toEqual([
      { index: 0, widthDeltaPt: 0, heightDeltaPt: 0 },
      { index: 1, widthDeltaPt: 0, heightDeltaPt: 0 },
    ]);
  });

  it("tracks per-page deltas and max deltas", () => {
    const base: PdfMetrics = {
      pages: [
        { widthPt: 612, heightPt: 792 },
        { widthPt: 595, heightPt: 842 },
      ],
    };

    const diff = diffPdfMetrics(base, {
      pages: [
        { widthPt: 612, heightPt: 792 },
        { widthPt: 590, heightPt: 845 },
      ],
    });

    expect(diff.pageCountDelta).toBe(0);
    expect(diff.comparedPages).toBe(2);
    expect(diff.perPage).toEqual([
      { index: 0, widthDeltaPt: 0, heightDeltaPt: 0 },
      { index: 1, widthDeltaPt: -5, heightDeltaPt: 3 },
    ]);
    expect(diff.maxWidthDeltaPt).toBe(5);
    expect(diff.maxHeightDeltaPt).toBe(3);
  });

  it("handles page count mismatches by comparing shared pages", () => {
    const diff = diffPdfMetrics(
      {
        pages: [{ widthPt: 612, heightPt: 792 }],
      },
      {
        pages: [
          { widthPt: 612, heightPt: 792 },
          { widthPt: 612, heightPt: 792 },
        ],
      },
    );

    expect(diff.pageCountDelta).toBe(1);
    expect(diff.comparedPages).toBe(1);
    expect(diff.perPage).toEqual([{ index: 0, widthDeltaPt: 0, heightDeltaPt: 0 }]);
  });

  it("evaluates diffs against thresholds", () => {
    const base: PdfMetrics = {
      pages: [{ widthPt: 612, heightPt: 792 }],
    };
    const candidate: PdfMetrics = {
      pages: [{ widthPt: 612.4, heightPt: 792.3 }],
    };

    const diff = diffPdfMetrics(base, candidate);
    const evaluation = evaluatePdfMetricsDiff(diff, {
      maxWidthDeltaPt: 0.5,
      maxHeightDeltaPt: 0.5,
      maxPageCountDelta: 0,
    });

    expect(evaluation.pass).toBe(true);
    expect(evaluation.failures).toEqual([]);
  });

  it("reports which thresholds are exceeded", () => {
    const base: PdfMetrics = {
      pages: [{ widthPt: 612, heightPt: 792 }],
    };
    const candidate: PdfMetrics = {
      pages: [
        { widthPt: 612, heightPt: 792 },
        { widthPt: 612, heightPt: 792 },
      ],
    };

    const diff = diffPdfMetrics(base, candidate);
    const evaluation = evaluatePdfMetricsDiff(diff, {
      maxWidthDeltaPt: 1,
      maxHeightDeltaPt: 1,
      maxPageCountDelta: 0,
    });

    expect(evaluation.pass).toBe(false);
    expect(evaluation.failures).toEqual([
      { kind: "pageCount", delta: 1, threshold: 0 },
    ]);
  });

  it("uses 0.2mm defaults for width/height thresholds", () => {
    expect(DEFAULT_PDF_METRICS_THRESHOLDS.maxWidthDeltaPt).toBeCloseTo(mmToPt(0.2));
    expect(DEFAULT_PDF_METRICS_THRESHOLDS.maxHeightDeltaPt).toBeCloseTo(mmToPt(0.2));
  });
});
