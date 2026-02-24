import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

const DEFAULT_Y_TOLERANCE = 1;
const DEFAULT_ALIGN_TOLERANCE = 2;

const numericSort = (a, b) => a - b;

const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort(numericSort);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[index];
};

const bucketize = (values, step) => {
  const buckets = new Map();
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    const bucket = Math.round(value / step) * step;
    const key = Number(bucket.toFixed(2));
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([value, count]) => ({ value, count }));
};

const average = (values) => {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const median = (values) => percentile(values, 0.5);

const parseArgs = (argv) => {
  const args = [...argv];
  if (args.length < 1) {
    throw new Error("Usage: node scripts/typesetting_pdf_metrics.mjs <pdf> [--out <file>]");
  }
  const pdfPath = args.shift();
  const options = { out: null };

  while (args.length > 0) {
    const flag = args.shift();
    switch (flag) {
      case "--out":
        options.out = args.shift() ?? null;
        break;
      default:
        throw new Error(`Unknown option: ${flag}`);
    }
  }
  return { pdfPath, options };
};

const computeFontSize = (item) => {
  if (typeof item.height === "number" && Number.isFinite(item.height)) {
    return Math.abs(item.height);
  }
  if (Array.isArray(item.transform)) {
    const d = item.transform[3];
    const a = item.transform[0];
    const b = item.transform[1];
    if (Number.isFinite(d)) return Math.abs(d);
    const scale = Math.hypot(a ?? 0, b ?? 0);
    if (Number.isFinite(scale) && scale > 0) return Math.abs(scale);
  }
  return 0;
};

const collectLines = (items, yTolerance = DEFAULT_Y_TOLERANCE) => {
  const filtered = items
    .map((item) => {
      const str = typeof item.str === "string" ? item.str : "";
      const width = Number.isFinite(item.width) ? item.width : 0;
      const hasGlyph = width > 0;
      const hasText = str.trim().length > 0;
      if (!hasGlyph && !hasText) return null;
      const transform = Array.isArray(item.transform) ? item.transform : [];
      const x = Number.isFinite(transform[4]) ? transform[4] : 0;
      const y = Number.isFinite(transform[5]) ? transform[5] : 0;
      return {
        x,
        y,
        width,
        fontSize: computeFontSize(item),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.y - a.y) || (a.x - b.x));

  const lines = [];
  for (const item of filtered) {
    const last = lines[lines.length - 1];
    if (!last || Math.abs(item.y - last.y) > yTolerance) {
      lines.push({
        y: item.y,
        minX: item.x,
        maxX: item.x + item.width,
        fontSizes: [item.fontSize],
      });
    } else {
      last.minX = Math.min(last.minX, item.x);
      last.maxX = Math.max(last.maxX, item.x + item.width);
      last.fontSizes.push(item.fontSize);
      last.y = (last.y + item.y) / 2;
    }
  }
  return lines;
};

const computeLineHeights = (lines) => {
  const heights = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    const delta = Math.abs(lines[index].y - lines[index + 1].y);
    if (delta > 0) heights.push(delta);
  }
  return heights;
};

const computePageMetrics = (page, pageIndex) => {
  const [xMin, yMin, xMax, yMax] = page.view;
  const widthPt = xMax - xMin;
  const heightPt = yMax - yMin;
  const pageCenter = widthPt / 2;

  return page.getTextContent().then((content) => {
    const items = content.items ?? [];
    const itemCount = items.length;
    const emptyTextCount = items.filter((item) => {
      const str = typeof item.str === "string" ? item.str : "";
      return str.trim().length === 0;
    }).length;
    const lines = collectLines(items);
    const lineHeights = computeLineHeights(lines);
    const lineHeightMedian = median(lineHeights);
    const lineHeightP90 = percentile(lineHeights, 0.9);
    const lineHeightMean = average(lineHeights);

    const lineFontSizes = lines.map((line) => median(line.fontSizes.filter((value) => value > 0)));
    const fontSizeMedian = median(lineFontSizes);
    const fontSizeP90 = percentile(lineFontSizes, 0.9);

    const minX = lines.length ? Math.min(...lines.map((line) => line.minX)) : 0;
    const maxX = lines.length ? Math.max(...lines.map((line) => line.maxX)) : widthPt;
    const minY = lines.length ? Math.min(...lines.map((line) => line.y)) : 0;
    const maxY = lines.length ? Math.max(...lines.map((line) => line.y)) : heightPt;

    const margins = {
      left: minX,
      right: Math.max(0, widthPt - maxX),
      top: Math.max(0, heightPt - maxY),
      bottom: Math.max(0, minY),
    };

    const leftEdges = lines.map((line) => line.minX);
    const rightEdges = lines.map((line) => widthPt - line.maxX);
    const leftMedian = median(leftEdges);
    const rightMedian = median(rightEdges);

    let centeredCount = 0;
    let leftAlignedCount = 0;
    let rightAlignedCount = 0;
    const indents = [];
    const paragraphGaps = lineHeights.filter((value) => value > lineHeightMedian * 1.5);

    for (const line of lines) {
      const center = (line.minX + line.maxX) / 2;
      if (Math.abs(center - pageCenter) <= DEFAULT_ALIGN_TOLERANCE) {
        centeredCount += 1;
      }
      if (Math.abs(line.minX - leftMedian) <= DEFAULT_ALIGN_TOLERANCE) {
        leftAlignedCount += 1;
      }
      if (Math.abs((widthPt - line.maxX) - rightMedian) <= DEFAULT_ALIGN_TOLERANCE) {
        rightAlignedCount += 1;
      }
      const indent = line.minX - leftMedian;
      if (indent > DEFAULT_ALIGN_TOLERANCE) {
        indents.push(indent);
      }
    }

    const lineCount = lines.length;
    const align = {
      centeredRatio: lineCount ? centeredCount / lineCount : 0,
      leftRatio: lineCount ? leftAlignedCount / lineCount : 0,
      rightRatio: lineCount ? rightAlignedCount / lineCount : 0,
    };

    return {
      index: pageIndex + 1,
      widthPt,
      heightPt,
      textItems: {
        total: itemCount,
        empty: emptyTextCount,
      },
      lineCount,
      lineHeights: {
        median: lineHeightMedian,
        p90: lineHeightP90,
        mean: lineHeightMean,
      },
      fontSizes: {
        median: fontSizeMedian,
        p90: fontSizeP90,
      },
      margins,
      align,
      indent: {
        median: median(indents),
        p90: percentile(indents, 0.9),
      },
      paragraphGaps: {
        count: paragraphGaps.length,
        ratio: lineHeights.length ? paragraphGaps.length / lineHeights.length : 0,
      },
    };
  });
};

const summarizeMetrics = (pages) => {
  const itemTotals = pages.map((page) => page.textItems.total);
  const itemEmpty = pages.map((page) => page.textItems.empty);
  const lineHeights = pages.flatMap((page) => [page.lineHeights.median].filter((v) => v > 0));
  const fontSizes = pages.flatMap((page) => [page.fontSizes.median].filter((v) => v > 0));
  const lineHeightHistogram = bucketize(lineHeights, 0.5);
  const fontSizeHistogram = bucketize(fontSizes, 0.5);
  const marginsLeft = pages.map((page) => page.margins.left);
  const marginsRight = pages.map((page) => page.margins.right);
  const marginsTop = pages.map((page) => page.margins.top);
  const marginsBottom = pages.map((page) => page.margins.bottom);
  const centered = pages.map((page) => page.align.centeredRatio);
  const leftAligned = pages.map((page) => page.align.leftRatio);
  const rightAligned = pages.map((page) => page.align.rightRatio);
  const paraGapRatio = pages.map((page) => page.paragraphGaps.ratio);

  return {
    pages: pages.length,
    textItems: {
      total: itemTotals.reduce((sum, value) => sum + value, 0),
      empty: itemEmpty.reduce((sum, value) => sum + value, 0),
    },
    lineHeightMedian: median(lineHeights),
    fontSizeMedian: median(fontSizes),
    lineHeightHistogram,
    fontSizeHistogram,
    margins: {
      left: median(marginsLeft),
      right: median(marginsRight),
      top: median(marginsTop),
      bottom: median(marginsBottom),
    },
    align: {
      centeredRatio: average(centered),
      leftRatio: average(leftAligned),
      rightRatio: average(rightAligned),
    },
    paragraphGapRatio: average(paraGapRatio),
  };
};

async function main() {
  const { pdfPath, options } = parseArgs(process.argv.slice(2));
  const data = await readFile(pdfPath);
  const bytes = data instanceof Uint8Array
    ? Uint8Array.from(data)
    : new Uint8Array(data);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await getDocument({ data: bytes, disableWorker: true }).promise;

  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    pages.push(await computePageMetrics(page, pageNumber - 1));
  }

  const output = {
    file: basename(pdfPath),
    summary: summarizeMetrics(pages),
    pages,
  };

  const payload = JSON.stringify(output, null, 2);
  if (options.out) {
    await writeFile(options.out, payload, "utf8");
  }
  console.log(payload);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
