import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_MANIFEST = "tests/typesetting/samples/manifest.json";

const parseArgs = (argv) => {
  const args = [...argv];
  const options = {
    manifest: DEFAULT_MANIFEST,
    outDir: "tests/typesetting/openoffice-baselines",
    format: "pdf",
    dpi: null,
    soffice: null,
    pdftoppm: null,
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
      case "--format":
        options.format = args.shift() ?? options.format;
        break;
      case "--dpi":
        options.dpi = args.shift() ?? null;
        break;
      case "--soffice":
        options.soffice = args.shift() ?? null;
        break;
      case "--pdftoppm":
        options.pdftoppm = args.shift() ?? null;
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
  if (result.status !== 0) {
    throw new Error(result.stderr || `Command failed: ${args.join(" ")}`);
  }
  return result.stdout.trim();
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const manifestPath = path.resolve(options.manifest);
  const outDir = path.resolve(options.outDir);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const manifestDir = path.dirname(manifestPath);
  const samples = manifest.samples ?? [];

  fs.mkdirSync(outDir, { recursive: true });

  const results = [];
  for (const sample of samples) {
    if (options.only && !options.only.includes(sample.id)) continue;
    const docxPath = path.resolve(manifestDir, sample.file);
    const sampleOutDir = path.join(outDir, sample.id);
    fs.mkdirSync(sampleOutDir, { recursive: true });

    const args = ["scripts/typesetting_openoffice_render.mjs", docxPath, sampleOutDir, "--format", options.format];
    if (options.dpi) args.push("--dpi", String(options.dpi));
    if (options.soffice) args.push("--soffice", options.soffice);
    if (options.pdftoppm) args.push("--pdftoppm", options.pdftoppm);

    const stdout = run(args);
    results.push({ id: sample.id, output: JSON.parse(stdout) });
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
