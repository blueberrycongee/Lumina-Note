export type PdfPageMetrics = {
  widthPt: number;
  heightPt: number;
};

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
