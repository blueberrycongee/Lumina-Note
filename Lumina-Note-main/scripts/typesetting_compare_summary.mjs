import fs from "node:fs";
import path from "node:path";

const DEFAULT_DIR = "tests/typesetting/compare-reports";

const parseArgs = (argv) => {
  const args = [...argv];
  const options = {
    dir: DEFAULT_DIR,
    out: null,
  };
  while (args.length > 0) {
    const flag = args.shift();
    switch (flag) {
      case "--dir":
        options.dir = args.shift() ?? options.dir;
        break;
      case "--out":
        options.out = args.shift() ?? null;
        break;
      default:
        throw new Error(`Unknown option: ${flag}`);
    }
  }
  return options;
};

const readJson = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
};

const collectSampleDirs = (rootDir) => {
  if (!fs.existsSync(rootDir)) return [];
  return fs.readdirSync(rootDir)
    .map((name) => path.join(rootDir, name))
    .filter((full) => fs.statSync(full).isDirectory());
};

const evaluatePixelDiff = (payload) => {
  if (!payload) return { status: "missing" };
  const threshold = payload.thresholds?.diffRatio ?? null;
  const maxDiff = payload.diff?.maxDiffRatio ?? null;
  const pageDelta = payload.pageCountDelta ?? 0;
  const ok = (threshold !== null && maxDiff !== null)
    ? maxDiff <= threshold && pageDelta === 0
    : false;
  return {
    status: ok ? "pass" : "fail",
    threshold,
    maxDiff,
    pageDelta,
  };
};

const evaluatePdfDiff = (payload) => {
  if (!payload) return { status: "missing" };
  const thresholds = payload.thresholds ?? {};
  const diff = payload.diff ?? {};
  const ok =
    (diff.pageCountDelta ?? 0) === (thresholds.pageCountDelta ?? 0)
    && Math.abs(diff.maxWidthDeltaPt ?? 0) <= (thresholds.maxWidthDeltaPt ?? Infinity)
    && Math.abs(diff.maxHeightDeltaPt ?? 0) <= (thresholds.maxHeightDeltaPt ?? Infinity);
  return {
    status: ok ? "pass" : "fail",
    diff,
    thresholds,
  };
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const rootDir = path.resolve(options.dir);
  const sampleDirs = collectSampleDirs(rootDir);

  const samples = sampleDirs.map((dir) => {
    const id = path.basename(dir);
    const pixelDiff = readJson(path.join(dir, "pixel-diff.json"));
    const pdfDiff = readJson(path.join(dir, "pdf-diff.json"));
    const pdfMetrics = readJson(path.join(dir, "pdf-metrics-diff.json"));
    const irMetrics = readJson(path.join(dir, "ir-metrics.json"));
    const layoutMetrics = readJson(path.join(dir, "layout-metrics.json"));

    const pixelEval = evaluatePixelDiff(pixelDiff);
    const pdfEval = evaluatePdfDiff(pdfDiff);

    const status = [pixelEval.status, pdfEval.status].includes("fail")
      ? "fail"
      : [pixelEval.status, pdfEval.status].includes("missing")
        ? "partial"
        : "pass";

    return {
      id,
      status,
      pixel: pixelEval,
      pdf: pdfEval,
      pdfMetrics,
      irMetrics,
      layoutMetrics,
    };
  });

  const summary = {
    rootDir,
    total: samples.length,
    pass: samples.filter((s) => s.status === "pass").length,
    partial: samples.filter((s) => s.status === "partial").length,
    fail: samples.filter((s) => s.status === "fail").length,
    samples,
  };

  const output = JSON.stringify(summary, null, 2);
  if (options.out) {
    const outPath = path.resolve(options.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, output, "utf8");
  }
  console.log(output);
};

try {
  main();
} catch (err) {
  console.error(err?.message || err);
  process.exit(1);
}
