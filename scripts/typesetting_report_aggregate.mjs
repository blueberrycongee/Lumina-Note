import fs from "node:fs";
import path from "node:path";

const DEFAULT_DIR = "tests/typesetting/lumina-baselines";

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

const listReports = (root) => {
  const results = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (entry.endsWith(".report.json")) {
        results.push(full);
      }
    }
  };
  if (fs.existsSync(root)) walk(root);
  return results;
};

const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};

const average = (values) => {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const rootDir = path.resolve(options.dir);
  const reports = listReports(rootDir);
  const entries = [];

  for (const filePath of reports) {
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (typeof payload.durationMs !== "number") continue;
    entries.push({
      file: path.relative(rootDir, filePath),
      durationMs: payload.durationMs,
      inputDocx: payload.inputDocx,
      outputPdf: payload.outputPdf,
    });
  }

  const durations = entries.map((entry) => entry.durationMs);
  const summary = {
    rootDir,
    count: entries.length,
    durationMs: {
      min: durations.length ? Math.min(...durations) : 0,
      max: durations.length ? Math.max(...durations) : 0,
      mean: average(durations),
      median: median(durations),
    },
    entries,
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
