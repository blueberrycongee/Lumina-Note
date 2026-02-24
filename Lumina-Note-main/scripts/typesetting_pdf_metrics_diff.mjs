import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const parseArgs = (argv) => {
  const args = [...argv];
  if (args.length < 2) {
    throw new Error("Usage: node scripts/typesetting_pdf_metrics_diff.mjs <base.pdf> <candidate.pdf> [--out <file>]");
  }
  const basePath = args.shift();
  const candidatePath = args.shift();
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
  return { basePath, candidatePath, options };
};

const runMetrics = (pdfPath) => new Promise((resolve, reject) => {
  const proc = spawn(process.execPath ?? "node", ["scripts/typesetting_pdf_metrics.mjs", pdfPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  proc.on("exit", (code) => {
    if (code !== 0) {
      reject(new Error(stderr || `metrics failed for ${pdfPath} (code=${code})`));
      return;
    }
    try {
      resolve(JSON.parse(stdout));
    } catch (err) {
      reject(err);
    }
  });
});

const diffValue = (base, candidate) => candidate - base;

const diffSummary = (base, candidate) => ({
  pageCountDelta: diffValue(base.pages, candidate.pages),
  lineHeightMedianDelta: diffValue(base.lineHeightMedian, candidate.lineHeightMedian),
  fontSizeMedianDelta: diffValue(base.fontSizeMedian, candidate.fontSizeMedian),
  margins: {
    leftDelta: diffValue(base.margins.left, candidate.margins.left),
    rightDelta: diffValue(base.margins.right, candidate.margins.right),
    topDelta: diffValue(base.margins.top, candidate.margins.top),
    bottomDelta: diffValue(base.margins.bottom, candidate.margins.bottom),
  },
  align: {
    centeredRatioDelta: diffValue(base.align.centeredRatio, candidate.align.centeredRatio),
    leftRatioDelta: diffValue(base.align.leftRatio, candidate.align.leftRatio),
    rightRatioDelta: diffValue(base.align.rightRatio, candidate.align.rightRatio),
  },
  paragraphGapRatioDelta: diffValue(base.paragraphGapRatio, candidate.paragraphGapRatio),
});

async function main() {
  const { basePath, candidatePath, options } = parseArgs(process.argv.slice(2));
  const [baseMetrics, candidateMetrics] = await Promise.all([
    runMetrics(basePath),
    runMetrics(candidatePath),
  ]);

  const output = {
    base: baseMetrics.file,
    candidate: candidateMetrics.file,
    baseSummary: baseMetrics.summary,
    candidateSummary: candidateMetrics.summary,
    diff: diffSummary(baseMetrics.summary, candidateMetrics.summary),
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
