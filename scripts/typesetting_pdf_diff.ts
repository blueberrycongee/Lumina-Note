import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { diffPdfMetrics, PdfMetrics } from "../src/typesetting/pdfMetrics";

async function loadPdfMetrics(path: string): Promise<PdfMetrics> {
  const data = await readFile(path);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await getDocument({ data, disableWorker: true }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const [xMin, yMin, xMax, yMax] = page.view;
    pages.push({ widthPt: xMax - xMin, heightPt: yMax - yMin });
  }

  return { pages };
}

function formatPt(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "NaN";
}

async function main(): Promise<void> {
  const [basePath, candidatePath] = process.argv.slice(2);
  if (!basePath || !candidatePath) {
    console.error("Usage: npx ts-node --esm scripts/typesetting_pdf_diff.ts <base.pdf> <candidate.pdf>");
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
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
