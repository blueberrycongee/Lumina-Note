import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_MANIFEST = "tests/typesetting/samples/manifest.json";
const DEFAULT_OUT_DIR = "tests/typesetting/lumina-baselines";

const parseArgs = (argv) => {
  const args = [...argv];
  const options = {
    manifest: DEFAULT_MANIFEST,
    outDir: DEFAULT_OUT_DIR,
    port: null,
    noServer: false,
    font: null,
    only: null,
  };

  while (args.length > 0) {
    const flag = args.shift();
    switch (flag) {
      case "--manifest":
        options.manifest = args.shift() ?? options.manifest;
        break;
      case "--out":
        options.outDir = args.shift() ?? options.outDir;
        break;
      case "--port":
        options.port = args.shift() ?? null;
        break;
      case "--no-server":
        options.noServer = true;
        break;
      case "--font":
        options.font = args.shift() ?? null;
        break;
      case "--only":
        options.only = (args.shift() ?? "").split(",").map((v) => v.trim()).filter(Boolean);
        break;
      default:
        throw new Error(`Unknown option: ${flag}`);
    }
  }

  return options;
};

const run = (args) => {
  const result = spawnSync(process.execPath ?? "node", args, { encoding: "utf8" });
  if (result.error) throw result.error;
  return {
    status: result.status ?? 1,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
  };
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const manifestPath = path.resolve(options.manifest);
  const outDir = path.resolve(options.outDir);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const manifestDir = path.dirname(manifestPath);

  fs.mkdirSync(outDir, { recursive: true });

  const results = [];
  for (const sample of manifest.samples ?? []) {
    if (options.only && !options.only.includes(sample.id)) continue;
    const docxPath = path.resolve(manifestDir, sample.file);
    const sampleDir = path.join(outDir, sample.id);
    fs.mkdirSync(sampleDir, { recursive: true });

    const pdfPath = path.join(sampleDir, `${sample.id}.pdf`);
    const reportPath = path.join(sampleDir, `${sample.id}.report.json`);
    const layoutPath = path.join(sampleDir, `${sample.id}.layout.json`);

    const args = [
      "scripts/typesetting_export_harness.mjs",
      docxPath,
      pdfPath,
      "--report",
      reportPath,
      "--layout-out",
      layoutPath,
    ];

    if (options.noServer) args.push("--no-server");
    if (options.port) args.push("--port", String(options.port));
    if (options.font) args.push("--font", options.font);

    const result = run(args);
    results.push({
      id: sample.id,
      docx: docxPath,
      pdf: pdfPath,
      report: reportPath,
      layout: layoutPath,
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });

    if (result.status !== 0) {
      throw new Error(result.stderr || `Export failed for ${sample.id}`);
    }
  }

  const summary = {
    manifest: path.basename(manifestPath),
    outDir,
    count: results.length,
    results,
  };

  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
};

try {
  main();
} catch (err) {
  console.error(err?.message || err);
  process.exit(1);
}
