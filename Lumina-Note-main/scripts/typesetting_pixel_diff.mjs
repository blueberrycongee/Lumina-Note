import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_DPI = 150;
const DEFAULT_THRESHOLD = 0.02;
const DEFAULT_TOLERANCE = 8;
const DEFAULT_TIMEOUT_MS = 120_000;

const parseArgs = (argv) => {
  const args = [...argv];
  if (args.length < 2) {
    throw new Error(
      "Usage: node scripts/typesetting_pixel_diff.mjs <base.pdf> <candidate.pdf> [--out <file>] [--dpi <n>] [--threshold <ratio>] [--tolerance <0-255>] [--pdftoppm <path>] [--timeout <ms>] [--no-fail]",
    );
  }
  const basePath = args.shift();
  const candidatePath = args.shift();
  const options = {
    out: null,
    dpi: DEFAULT_DPI,
    threshold: DEFAULT_THRESHOLD,
    tolerance: DEFAULT_TOLERANCE,
    pdftoppm: null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    noFail: false,
  };

  while (args.length > 0) {
    const flag = args.shift();
    switch (flag) {
      case "--out":
        options.out = args.shift() ?? null;
        break;
      case "--dpi":
        options.dpi = Number(args.shift() ?? DEFAULT_DPI);
        break;
      case "--threshold":
        options.threshold = Number(args.shift() ?? DEFAULT_THRESHOLD);
        break;
      case "--tolerance":
        options.tolerance = Number(args.shift() ?? DEFAULT_TOLERANCE);
        break;
      case "--pdftoppm":
        options.pdftoppm = args.shift() ?? null;
        break;
      case "--timeout":
        options.timeoutMs = Number(args.shift() ?? DEFAULT_TIMEOUT_MS);
        break;
      case "--no-fail":
        options.noFail = true;
        break;
      default:
        throw new Error(`Unknown option: ${flag}`);
    }
  }

  return { basePath, candidatePath, options };
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

const renderPpm = (pdfPath, outDir, options) => {
  const pdftoppm = resolveTool("pdftoppm", options.pdftoppm);
  const baseName = path.basename(pdfPath, path.extname(pdfPath));
  const prefix = path.join(outDir, baseName);
  run(pdftoppm, ["-r", String(options.dpi), pdfPath, prefix], options.timeoutMs);
  return fs.readdirSync(outDir)
    .filter((file) => file.startsWith(`${baseName}-`) && file.endsWith(".ppm"))
    .sort()
    .map((file) => path.join(outDir, file));
};

const parsePpm = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  let offset = 0;
  const readToken = () => {
    while (offset < buffer.length) {
      const char = buffer[offset];
      if (char === 0x23) {
        while (offset < buffer.length && buffer[offset] !== 0x0a) offset += 1;
      } else if (char === 0x20 || char === 0x0a || char === 0x0d || char === 0x09) {
        offset += 1;
      } else {
        break;
      }
    }
    let start = offset;
    while (offset < buffer.length) {
      const char = buffer[offset];
      if (char === 0x20 || char === 0x0a || char === 0x0d || char === 0x09) break;
      offset += 1;
    }
    return buffer.slice(start, offset).toString("ascii");
  };

  const magic = readToken();
  if (magic !== "P6") throw new Error(`Unsupported PPM format: ${magic}`);
  const width = Number(readToken());
  const height = Number(readToken());
  const maxVal = Number(readToken());
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`Invalid PPM dimensions in ${filePath}`);
  }
  if (maxVal !== 255) {
    throw new Error(`Unsupported PPM max value: ${maxVal}`);
  }
  if (buffer[offset] === 0x0a) offset += 1;

  const data = buffer.slice(offset);
  const expected = width * height * 3;
  if (data.length < expected) {
    throw new Error(`PPM data truncated: ${filePath}`);
  }
  return { width, height, data };
};

const diffPpm = (base, candidate, tolerance) => {
  if (base.width !== candidate.width || base.height !== candidate.height) {
    return { diffRatio: 1, mismatched: base.width * base.height };
  }
  const len = base.width * base.height * 3;
  let mismatched = 0;
  for (let i = 0; i < len; i += 3) {
    const dr = Math.abs(base.data[i] - candidate.data[i]);
    const dg = Math.abs(base.data[i + 1] - candidate.data[i + 1]);
    const db = Math.abs(base.data[i + 2] - candidate.data[i + 2]);
    if (dr > tolerance || dg > tolerance || db > tolerance) {
      mismatched += 1;
    }
  }
  const total = base.width * base.height;
  return { diffRatio: total ? mismatched / total : 0, mismatched };
};

const cleanupDir = (dir) => {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
};

const main = () => {
  const { basePath, candidatePath, options } = parseArgs(process.argv.slice(2));
  const absBase = path.resolve(basePath);
  const absCandidate = path.resolve(candidatePath);

  if (!fs.existsSync(absBase)) throw new Error(`Base PDF not found: ${absBase}`);
  if (!fs.existsSync(absCandidate)) throw new Error(`Candidate PDF not found: ${absCandidate}`);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lumina-pixel-diff-"));
  const baseDir = path.join(tempRoot, "base");
  const candDir = path.join(tempRoot, "candidate");
  fs.mkdirSync(baseDir, { recursive: true });
  fs.mkdirSync(candDir, { recursive: true });

  const start = process.hrtime.bigint();

  try {
    const basePages = renderPpm(absBase, baseDir, options);
    const candPages = renderPpm(absCandidate, candDir, options);
    const compared = Math.min(basePages.length, candPages.length);
    const perPage = [];
    let maxDiffRatio = 0;
    let sumDiffRatio = 0;

    for (let idx = 0; idx < compared; idx += 1) {
      const basePpm = parsePpm(basePages[idx]);
      const candPpm = parsePpm(candPages[idx]);
      const diff = diffPpm(basePpm, candPpm, options.tolerance);
      perPage.push({ index: idx + 1, diffRatio: diff.diffRatio, mismatched: diff.mismatched });
      maxDiffRatio = Math.max(maxDiffRatio, diff.diffRatio);
      sumDiffRatio += diff.diffRatio;
    }

    const meanDiffRatio = compared ? sumDiffRatio / compared : 0;
    const payload = {
      base: path.basename(absBase),
      candidate: path.basename(absCandidate),
      pageCountDelta: candPages.length - basePages.length,
      pagesCompared: compared,
      diff: {
        maxDiffRatio,
        meanDiffRatio,
        perPage,
      },
      thresholds: {
        diffRatio: options.threshold,
      },
      dpi: options.dpi,
      tolerance: options.tolerance,
      timingMs: Math.round(Number(process.hrtime.bigint() - start) / 1e6),
    };

    const output = JSON.stringify(payload, null, 2);
    if (options.out) fs.writeFileSync(options.out, output, "utf8");
    console.log(output);

    const shouldFail = payload.pageCountDelta !== 0 || maxDiffRatio > options.threshold;
    if (shouldFail && !options.noFail) process.exit(2);
  } finally {
    cleanupDir(tempRoot);
  }
};

try {
  main();
} catch (err) {
  console.error(err?.message || err);
  process.exit(1);
}
