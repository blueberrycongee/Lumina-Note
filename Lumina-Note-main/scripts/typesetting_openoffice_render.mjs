import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_DPI = 150;
const DEFAULT_TIMEOUT_MS = 120_000;

const parseArgs = (argv) => {
  const args = [...argv];
  if (args.length < 2) {
    throw new Error(
      "Usage: node scripts/typesetting_openoffice_render.mjs <docx> <out-dir> [--format pdf|png|ppm] [--dpi <n>] [--soffice <path>] [--pdftoppm <path>] [--timeout <ms>]",
    );
  }
  const docxPath = args.shift();
  const outDir = args.shift();
  const options = {
    format: "pdf",
    dpi: DEFAULT_DPI,
    soffice: null,
    pdftoppm: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  while (args.length > 0) {
    const flag = args.shift();
    switch (flag) {
      case "--format":
        options.format = args.shift() ?? "pdf";
        break;
      case "--dpi":
        options.dpi = Number(args.shift() ?? DEFAULT_DPI);
        break;
      case "--soffice":
        options.soffice = args.shift() ?? null;
        break;
      case "--pdftoppm":
        options.pdftoppm = args.shift() ?? null;
        break;
      case "--timeout":
        options.timeoutMs = Number(args.shift() ?? DEFAULT_TIMEOUT_MS);
        break;
      default:
        throw new Error(`Unknown option: ${flag}`);
    }
  }

  return { docxPath, outDir, options };
};

const resolveTool = (name, explicitPath) => {
  if (explicitPath) return explicitPath;
  const binDir = process.env.LUMINA_DOC_TOOLS_BIN;
  if (binDir) {
    const candidate = path.join(binDir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return name;
};

const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

const run = (command, args, timeoutMs) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: timeoutMs,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || `Command failed: ${command}`);
  }
};

const findGeneratedPdf = (outDir, docxPath) => {
  const baseName = path.basename(docxPath, path.extname(docxPath));
  const expected = path.join(outDir, `${baseName}.pdf`);
  if (fs.existsSync(expected)) return expected;

  const files = fs.readdirSync(outDir);
  const fallback = files.find((file) => file.toLowerCase().endsWith(".pdf") && file.startsWith(baseName));
  if (fallback) return path.join(outDir, fallback);
  return null;
};

const renderPdf = (docxPath, outDir, options) => {
  const soffice = resolveTool("soffice", options.soffice);
  ensureDir(outDir);
  run(
    soffice,
    ["--headless", "--convert-to", "pdf", "--outdir", outDir, docxPath],
    options.timeoutMs,
  );
  const pdfPath = findGeneratedPdf(outDir, docxPath);
  if (!pdfPath) {
    throw new Error("OpenOffice did not produce a PDF output.");
  }
  return pdfPath;
};

const renderRaster = (pdfPath, outDir, options, format) => {
  const pdftoppm = resolveTool("pdftoppm", options.pdftoppm);
  const baseName = path.basename(pdfPath, path.extname(pdfPath));
  const prefix = path.join(outDir, baseName);
  const args = ["-r", String(options.dpi)];
  if (format === "png") args.push("-png");
  args.push(pdfPath, prefix);
  run(pdftoppm, args, options.timeoutMs);

  const files = fs.readdirSync(outDir)
    .filter((file) => file.startsWith(`${baseName}-`))
    .map((file) => path.join(outDir, file));
  return files;
};

const main = () => {
  const { docxPath, outDir, options } = parseArgs(process.argv.slice(2));
  const absDocx = path.resolve(docxPath);
  const absOut = path.resolve(outDir);
  const start = process.hrtime.bigint();

  if (!fs.existsSync(absDocx)) {
    throw new Error(`Docx not found: ${absDocx}`);
  }

  const pdfPath = renderPdf(absDocx, absOut, options);
  let rasterFiles = [];
  if (options.format === "png" || options.format === "ppm") {
    rasterFiles = renderRaster(pdfPath, absOut, options, options.format);
  }

  const end = process.hrtime.bigint();
  const elapsedMs = Number(end - start) / 1e6;

  const payload = {
    input: absDocx,
    outputDir: absOut,
    pdf: pdfPath,
    format: options.format,
    rasterFiles,
    timingMs: Math.round(elapsedMs),
    host: os.hostname(),
  };

  console.log(JSON.stringify(payload, null, 2));
};

try {
  main();
} catch (err) {
  console.error(err?.message || err);
  process.exit(1);
}
