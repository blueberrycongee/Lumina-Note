import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");

const SKIP_SEGMENTS = ["node_modules", "dist", "target", ".git"];
const SKIP_SUFFIXES = [
  ".test.tsx",
  ".test.ts",
  ".spec.tsx",
  ".spec.ts",
  ".d.ts",
];

function shouldSkipDir(name) {
  return SKIP_SEGMENTS.includes(name);
}

function shouldScanFile(filePath) {
  if (!filePath.endsWith(".tsx") && !filePath.endsWith(".jsx")) return false;
  return !SKIP_SUFFIXES.some((suffix) => filePath.endsWith(suffix));
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name)) continue;
      files.push(...(await walk(fullPath)));
      continue;
    }
    if (entry.isFile() && shouldScanFile(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function getLine(source, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (source.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function hasTooltipSource(openTag) {
  return /\b(title|aria-label|data-tooltip)\s*=/.test(openTag);
}

function isLikelyIconOnly(openTag) {
  return /<\s*(Icon|[A-Z][A-Za-z0-9]*|svg|[A-Za-z]+Icon)\b/.test(openTag);
}

function extractButtonOpenTags(source) {
  const tags = [];
  let start = source.indexOf("<button");

  while (start !== -1) {
    let i = start;
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inTemplate = false;
    let braceDepth = 0;

    while (i < source.length) {
      const ch = source[i];
      const prev = i > 0 ? source[i - 1] : "";

      if (!inDoubleQuote && !inTemplate && ch === "'" && prev !== "\\") {
        inSingleQuote = !inSingleQuote;
      } else if (!inSingleQuote && !inTemplate && ch === '"' && prev !== "\\") {
        inDoubleQuote = !inDoubleQuote;
      } else if (!inSingleQuote && !inDoubleQuote && ch === "`" && prev !== "\\") {
        inTemplate = !inTemplate;
      } else if (!inSingleQuote && !inDoubleQuote && !inTemplate) {
        if (ch === "{") braceDepth += 1;
        if (ch === "}") braceDepth = Math.max(0, braceDepth - 1);
        if (ch === ">" && braceDepth === 0) {
          tags.push({
            index: start,
            openTag: source.slice(start, i + 1),
          });
          break;
        }
      }

      i += 1;
    }

    start = source.indexOf("<button", start + 7);
  }

  return tags;
}

async function main() {
  const files = await walk(SRC_DIR);
  const findings = [];

  for (const filePath of files) {
    const source = await readFile(filePath, "utf8");
    const tags = extractButtonOpenTags(source);
    for (const tag of tags) {
      const openTag = tag.openTag;
      if (hasTooltipSource(openTag)) continue;
      findings.push({
        filePath: path.relative(ROOT, filePath),
        line: getLine(source, tag.index),
        iconOnly: isLikelyIconOnly(openTag),
        snippet: openTag.replace(/\s+/g, " ").slice(0, 160),
      });
    }
  }

  if (findings.length === 0) {
    console.log("[tooltip-audit] No raw <button> without title/aria-label/data-tooltip found.");
    process.exit(0);
  }

  console.log(`[tooltip-audit] Found ${findings.length} raw <button> tags without explicit tooltip source.`);
  const iconOnlyCount = findings.filter((item) => item.iconOnly).length;
  console.log(`[tooltip-audit] ${iconOnlyCount} are likely icon-only and should be prioritized.`);

  const preview = findings.slice(0, 80);
  for (const item of preview) {
    const marker = item.iconOnly ? "[icon]" : "[text?]";
    console.log(`${marker} ${item.filePath}:${item.line} :: ${item.snippet}`);
  }

  if (findings.length > preview.length) {
    console.log(`[tooltip-audit] ...and ${findings.length - preview.length} more.`);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error("[tooltip-audit] Failed:", error);
  process.exit(1);
});
