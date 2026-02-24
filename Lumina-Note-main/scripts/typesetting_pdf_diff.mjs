import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const MM_PER_INCH = 25.4;
const PT_PER_INCH = 72;

const mmToPt = (mm) => (mm / MM_PER_INCH) * PT_PER_INCH;

const diffPdfMetrics = (base, candidate) => {
  const basePages = base.pages ?? [];
  const candidatePages = candidate.pages ?? [];
  const comparedPages = Math.min(basePages.length, candidatePages.length);
  const perPage = [];
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
};

const formatPt = (value) => (Number.isFinite(value) ? value.toFixed(2) : "NaN");

async function loadPdfMetrics(filePath) {
  const data = await readFile(filePath);
  const bytes = data instanceof Uint8Array
    ? Uint8Array.from(data)
    : new Uint8Array(data);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await getDocument({ data: bytes, disableWorker: true }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const [xMin, yMin, xMax, yMax] = page.view;
    pages.push({ widthPt: xMax - xMin, heightPt: yMax - yMin });
  }

  return { pages };
}

async function main() {
  const [basePath, candidatePath] = process.argv.slice(2);
  if (!basePath || !candidatePath) {
    console.error("Usage: node scripts/typesetting_pdf_diff.mjs <base.pdf> <candidate.pdf>");
    process.exit(1);
  }

  const [baseMetrics, candidateMetrics] = await Promise.all([
    loadPdfMetrics(basePath),
    loadPdfMetrics(candidatePath),
  ]);

  const diff = diffPdfMetrics(baseMetrics, candidateMetrics);
  const output = {
    base: { file: basename(basePath), pages: baseMetrics.pages.length },
    candidate: { file: basename(candidatePath), pages: candidateMetrics.pages.length },
    diff: {
      pageCountDelta: diff.pageCountDelta,
      comparedPages: diff.comparedPages,
      maxWidthDeltaPt: diff.maxWidthDeltaPt,
      maxHeightDeltaPt: diff.maxHeightDeltaPt,
      perPage: diff.perPage.map((page) => ({
        index: page.index + 1,
        widthDeltaPt: formatPt(page.widthDeltaPt),
        heightDeltaPt: formatPt(page.heightDeltaPt),
      })),
    },
    thresholds: {
      pageCountDelta: 0,
      maxWidthDeltaPt: mmToPt(0.2),
      maxHeightDeltaPt: mmToPt(0.2),
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
