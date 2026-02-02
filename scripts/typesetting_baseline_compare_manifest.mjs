import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_MANIFEST = "tests/typesetting/samples/manifest.json";
const DEFAULT_BASELINE_DIR = "tests/typesetting/openoffice-baselines";
const DEFAULT_CANDIDATE_DIR = "tests/typesetting/lumina-baselines";
const DEFAULT_OUT_DIR = "tests/typesetting/compare-reports";

const parseArgs = (argv) => {
  const args = [...argv];
  const options = {
    manifest: DEFAULT_MANIFEST,
    baselineDir: DEFAULT_BASELINE_DIR,
    candidateDir: DEFAULT_CANDIDATE_DIR,
    outDir: DEFAULT_OUT_DIR,
    dpi: null,
    threshold: null,
    strict: false,
  };

  while (args.length > 0) {
    const flag = args.shift();
    switch (flag) {
      case "--manifest":
        options.manifest = args.shift() ?? options.manifest;
        break;
      case "--baseline":
        options.baselineDir = args.shift() ?? options.baselineDir;
        break;
      case "--candidate":
        options.candidateDir = args.shift() ?? options.candidateDir;
        break;
      case "--out":
        options.outDir = args.shift() ?? options.outDir;
        break;
      case "--dpi":
        options.dpi = args.shift() ?? null;
        break;
      case "--threshold":
        options.threshold = args.shift() ?? null;
        break;
      case "--strict":
        options.strict = true;
        break;
      default:
        throw new Error(`Unknown option: ${flag}`);
    }
  }

  return options;
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const findFirstPdf = (dir) => {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter((file) => file.toLowerCase().endsWith(".pdf"))
    .sort();
  if (!files.length) return null;
  return path.join(dir, files[0]);
};

const resolveBaselineMap = (baselineDir) => {
  const summaryPath = path.join(baselineDir, "summary.json");
  if (!fs.existsSync(summaryPath)) return new Map();
  const summary = readJson(summaryPath);
  const map = new Map();
  for (const entry of summary.results ?? []) {
    if (entry?.id && entry?.output?.pdf) {
      map.set(entry.id, entry.output.pdf);
    }
  }
  return map;
};

const resolveBaselinePdf = (baselineMap, baselineDir, sampleId) => {
  if (baselineMap.has(sampleId)) return baselineMap.get(sampleId);
  return findFirstPdf(path.join(baselineDir, sampleId));
};

const resolveCandidatePdf = (candidateDir, sampleId) => {
  const flat = path.join(candidateDir, `${sampleId}.pdf`);
  if (fs.existsSync(flat)) return flat;
  return findFirstPdf(path.join(candidateDir, sampleId));
};

const resolveCandidateIr = (candidateDir, sampleId) => {
  const flat = path.join(candidateDir, `${sampleId}.ir.json`);
  if (fs.existsSync(flat)) return flat;
  const nested = path.join(candidateDir, sampleId, `${sampleId}.ir.json`);
  if (fs.existsSync(nested)) return nested;
  return null;
};

const runIrMetrics = (irPath, outPath) => {
  const args = ["scripts/typesetting_ir_metrics.mjs", irPath, "--out", outPath];
  const result = spawnSync(process.execPath ?? "node", args, { encoding: "utf8" });
  return {
    status: result.status ?? 1,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
  };
};

const runCompare = (baselinePdf, candidatePdf, outDir, options) => {
  const args = ["scripts/typesetting_baseline_compare.mjs", baselinePdf, candidatePdf, "--out", outDir];
  if (options.dpi) args.push("--dpi", String(options.dpi));
  if (options.threshold) args.push("--threshold", String(options.threshold));
  if (!options.strict) args.push("--no-fail");

  const result = spawnSync(process.execPath ?? "node", args, { encoding: "utf8" });
  return result;
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const manifestPath = path.resolve(options.manifest);
  const baselineDir = path.resolve(options.baselineDir);
  const candidateDir = path.resolve(options.candidateDir);
  const outDir = path.resolve(options.outDir);

  const manifest = readJson(manifestPath);
  const samples = manifest.samples ?? [];

  const baselineMap = resolveBaselineMap(baselineDir);
  fs.mkdirSync(outDir, { recursive: true });

  const results = [];
  const missing = [];
  const irMetricsMissing = [];

  for (const sample of samples) {
    const sampleId = sample.id;
    const baselinePdf = resolveBaselinePdf(baselineMap, baselineDir, sampleId);
    const candidatePdf = resolveCandidatePdf(candidateDir, sampleId);
    if (!baselinePdf || !candidatePdf) {
      missing.push({ id: sampleId, baselinePdf, candidatePdf });
      continue;
    }

    const sampleOutDir = path.join(outDir, sampleId);
    fs.mkdirSync(sampleOutDir, { recursive: true });

    const result = runCompare(baselinePdf, candidatePdf, sampleOutDir, options);
    const irPath = resolveCandidateIr(candidateDir, sampleId);
    let irMetrics = null;
    if (irPath) {
      const irOutPath = path.join(sampleOutDir, "ir-metrics.json");
      const irResult = runIrMetrics(irPath, irOutPath);
      irMetrics = {
        path: irOutPath,
        status: irResult.status,
        stderr: irResult.stderr,
      };
      if (irResult.status !== 0) {
        irMetricsMissing.push({ id: sampleId, irPath, error: irResult.stderr });
      }
    } else {
      irMetricsMissing.push({ id: sampleId, irPath: null, error: "missing IR json" });
    }

    const payload = {
      id: sampleId,
      baselinePdf,
      candidatePdf,
      irPath,
      irMetrics,
      status: result.status ?? 1,
      stdout: result.stdout?.trim() ?? "",
      stderr: result.stderr?.trim() ?? "",
    };

    results.push(payload);
    if (options.strict && payload.status !== 0) {
      throw new Error(payload.stderr || `Compare failed for ${sampleId}`);
    }
  }

  const summary = {
    manifest: path.basename(manifestPath),
    baselineDir,
    candidateDir,
    outDir,
    total: samples.length,
    compared: results.length,
    missing,
    irMetricsMissing,
    results,
  };

  const summaryPath = path.join(outDir, "summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
};

try {
  main();
} catch (err) {
  console.error(err?.message || err);
  process.exit(1);
}
