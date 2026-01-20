export type PdfPageMetrics = {
  widthPt: number;
  heightPt: number;
};

const MM_PER_INCH = 25.4;
const PT_PER_INCH = 72;

export function mmToPt(mm: number): number {
  return (mm / MM_PER_INCH) * PT_PER_INCH;
}

export type PdfMetrics = {
  pages: PdfPageMetrics[];
};

export type PdfPageMetricsDiff = {
  index: number;
  widthDeltaPt: number;
  heightDeltaPt: number;
};

export type PdfMetricsDiff = {
  pageCountDelta: number;
  comparedPages: number;
  maxWidthDeltaPt: number;
  maxHeightDeltaPt: number;
  perPage: PdfPageMetricsDiff[];
};

export type PdfMetricsThresholds = {
  maxWidthDeltaPt: number;
  maxHeightDeltaPt: number;
  maxPageCountDelta: number;
};

export const DEFAULT_PDF_METRICS_THRESHOLDS: PdfMetricsThresholds = {
  maxWidthDeltaPt: mmToPt(0.2),
  maxHeightDeltaPt: mmToPt(0.2),
  maxPageCountDelta: 0,
};

export type PdfMetricsDiffFailure =
  | { kind: "pageCount"; delta: number; threshold: number }
  | { kind: "widthPt"; delta: number; threshold: number }
  | { kind: "heightPt"; delta: number; threshold: number };

export type PdfMetricsDiffEvaluation = {
  pass: boolean;
  failures: PdfMetricsDiffFailure[];
};

export function diffPdfMetrics(base: PdfMetrics, candidate: PdfMetrics): PdfMetricsDiff {
  const basePages = base.pages ?? [];
  const candidatePages = candidate.pages ?? [];
  const comparedPages = Math.min(basePages.length, candidatePages.length);
  const perPage: PdfPageMetricsDiff[] = [];
  let maxWidthDeltaPt = 0;
  let maxHeightDeltaPt = 0;

  for (let index = 0; index < comparedPages; index += 1) {
    const basePage = basePages[index];
    const candidatePage = candidatePages[index];
    const widthDeltaPt = candidatePage.widthPt - basePage.widthPt;
    const heightDeltaPt = candidatePage.heightPt - basePage.heightPt;

    perPage.push({ index, widthDeltaPt, heightDeltaPt });
    maxWidthDeltaPt = Math.max(maxWidthDeltaPt, Math.abs(widthDeltaPt));
    maxHeightDeltaPt = Math.max(maxHeightDeltaPt, Math.abs(heightDeltaPt));
  }

  return {
    pageCountDelta: candidatePages.length - basePages.length,
    comparedPages,
    maxWidthDeltaPt,
    maxHeightDeltaPt,
    perPage,
  };
}

export function evaluatePdfMetricsDiff(
  diff: PdfMetricsDiff,
  thresholds: PdfMetricsThresholds = DEFAULT_PDF_METRICS_THRESHOLDS,
): PdfMetricsDiffEvaluation {
  const failures: PdfMetricsDiffFailure[] = [];

  if (Math.abs(diff.pageCountDelta) > thresholds.maxPageCountDelta) {
    failures.push({
      kind: "pageCount",
      delta: diff.pageCountDelta,
      threshold: thresholds.maxPageCountDelta,
    });
  }

  if (diff.maxWidthDeltaPt > thresholds.maxWidthDeltaPt) {
    failures.push({
      kind: "widthPt",
      delta: diff.maxWidthDeltaPt,
      threshold: thresholds.maxWidthDeltaPt,
    });
  }

  if (diff.maxHeightDeltaPt > thresholds.maxHeightDeltaPt) {
    failures.push({
      kind: "heightPt",
      delta: diff.maxHeightDeltaPt,
      threshold: thresholds.maxHeightDeltaPt,
    });
  }

  return {
    pass: failures.length === 0,
    failures,
  };
}
