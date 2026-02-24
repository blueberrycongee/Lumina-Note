import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const parseArgs = (argv) => {
  const args = [...argv];
  if (args.length < 2) {
    throw new Error(
      "Usage: node scripts/typesetting_baseline_compare.mjs <baseline.pdf> <candidate.pdf> [--out <dir>] [--dpi <n>] [--threshold <ratio>] [--no-fail]",
    );
  }
  const baselinePdf = args.shift();
  const candidatePdf = args.shift();
  const options = {
    outDir: null,
    dpi: null,
    threshold: null,
    noFail: false,
  };
  while (args.length > 0) {
    const flag = args.shift();
    switch (flag) {
      case "--out":
        options.outDir = args.shift() ?? null;
        break;
      case "--dpi":
        options.dpi = args.shift() ?? null;
        break;
      case "--threshold":
        options.threshold = args.shift() ?? null;
        break;
      case "--no-fail":
        options.noFail = true;
        break;
      default:
        throw new Error(`Unknown option: ${flag}`);
    }
  }
  return { baselinePdf, candidatePdf, options };
};

const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || `Command failed: ${command}`);
  }
  return result.stdout.trim();
};

const main = () => {
  const { baselinePdf, candidatePdf, options } = parseArgs(process.argv.slice(2));
  const base = path.resolve(baselinePdf);
  const candidate = path.resolve(candidatePdf);

  if (!fs.existsSync(base)) throw new Error(`Baseline PDF not found: ${base}`);
  if (!fs.existsSync(candidate)) throw new Error(`Candidate PDF not found: ${candidate}`);

  const outDir = options.outDir ? path.resolve(options.outDir) : null;
  if (outDir) fs.mkdirSync(outDir, { recursive: true });

  const diffArgs = ["scripts/typesetting_pdf_diff.mjs", base, candidate];
  const metricsArgs = ["scripts/typesetting_pdf_metrics_diff.mjs", base, candidate];
  const pixelArgs = ["scripts/typesetting_pixel_diff.mjs", base, candidate];

  if (options.dpi) pixelArgs.push("--dpi", String(options.dpi));
  if (options.threshold) pixelArgs.push("--threshold", String(options.threshold));
  if (options.noFail) pixelArgs.push("--no-fail");

  const pdfDiff = run(process.execPath ?? "node", diffArgs);
  const metricsDiff = run(process.execPath ?? "node", metricsArgs);
  const pixelDiff = run(process.execPath ?? "node", pixelArgs);

  if (outDir) {
    fs.writeFileSync(path.join(outDir, "pdf-diff.json"), pdfDiff, "utf8");
    fs.writeFileSync(path.join(outDir, "pdf-metrics-diff.json"), metricsDiff, "utf8");
    fs.writeFileSync(path.join(outDir, "pixel-diff.json"), pixelDiff, "utf8");
  }

  const payload = {
    baseline: path.basename(base),
    candidate: path.basename(candidate),
    reports: {
      pdfDiff: outDir ? path.join(outDir, "pdf-diff.json") : null,
      metricsDiff: outDir ? path.join(outDir, "pdf-metrics-diff.json") : null,
      pixelDiff: outDir ? path.join(outDir, "pixel-diff.json") : null,
    },
  };

  console.log(JSON.stringify(payload, null, 2));
};

try {
  main();
} catch (err) {
  console.error(err?.message || err);
  process.exit(1);
}
