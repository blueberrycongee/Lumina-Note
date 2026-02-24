import fs from "node:fs";
import path from "node:path";

const DEFAULT_DPI = 96;

const parseArgs = (argv) => {
  const args = [...argv];
  if (args.length < 1) {
    throw new Error("Usage: node scripts/typesetting_layout_metrics.mjs <layout.json> [--out <file>]");
  }
  const layoutPath = args.shift();
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
  return { layoutPath, options };
};

const mmToPx = (mm, dpi = DEFAULT_DPI) => Math.round((Math.max(0, mm) * dpi) / 25.4);

const countLinesPerPage = (lines, linePages) => {
  const counts = {};
  if (Array.isArray(linePages) && linePages.length === lines.length) {
    for (const page of linePages) {
      const key = String(page ?? 1);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }
  return null;
};

const computeLinePagesFallback = (lines, bodyHeightPx) => {
  if (!bodyHeightPx || !lines.length) return null;
  const counts = {};
  for (const line of lines) {
    const page = Math.max(1, Math.floor((line.y_offset ?? 0) / bodyHeightPx) + 1);
    const key = String(page);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
};

const main = () => {
  const { layoutPath, options } = parseArgs(process.argv.slice(2));
  const absPath = path.resolve(layoutPath);
  const layout = JSON.parse(fs.readFileSync(absPath, "utf8"));

  const bodyLines = layout.body?.lines ?? [];
  const headerLines = layout.header?.lines ?? [];
  const footerLines = layout.footer?.lines ?? [];
  const bodyHeightPx = layout.pageMm?.body?.height_mm
    ? mmToPx(layout.pageMm.body.height_mm)
    : null;

  const linesPerPage = countLinesPerPage(bodyLines, layout.body?.linePages)
    ?? computeLinePagesFallback(bodyLines, bodyHeightPx);

  const payload = {
    file: path.basename(absPath),
    totalPages: layout.totalPages ?? null,
    contentHeightPx: layout.contentHeightPx ?? null,
    lineCount: layout.lineCount ?? bodyLines.length,
    body: {
      lineCount: bodyLines.length,
      linesPerPage,
      bodyHeightPx,
    },
    header: { lineCount: headerLines.length },
    footer: { lineCount: footerLines.length },
  };

  const output = JSON.stringify(payload, null, 2);
  if (options.out) {
    fs.writeFileSync(path.resolve(options.out), output, "utf8");
  }
  console.log(output);
};

try {
  main();
} catch (err) {
  console.error(err?.message || err);
  process.exit(1);
}
