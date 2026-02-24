import fs from "node:fs";
import path from "node:path";

const parseArgs = (argv) => {
  const args = [...argv];
  if (args.length < 1) {
    throw new Error("Usage: node scripts/typesetting_ir_metrics.mjs <ir.json> [--out <file>]");
  }
  const irPath = args.shift();
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
  return { irPath, options };
};

const countBlocks = (blocks, stats) => {
  for (const block of blocks) {
    stats.blocks.total += 1;
    stats.blocks.byType[block.type] = (stats.blocks.byType[block.type] ?? 0) + 1;

    switch (block.type) {
      case "paragraph":
      case "heading":
        stats.inlines.total += block.children?.length ?? 0;
        break;
      case "list":
        stats.lists.total += 1;
        for (const item of block.items ?? []) {
          stats.lists.items += 1;
          countBlocks(item.blocks ?? [], stats);
        }
        break;
      case "table":
        stats.tables.total += 1;
        stats.tables.rows += block.rows?.length ?? 0;
        for (const row of block.rows ?? []) {
          stats.tables.cells += row.cells?.length ?? 0;
          for (const cell of row.cells ?? []) {
            countBlocks(cell.blocks ?? [], stats);
          }
        }
        break;
      default:
        break;
    }
  }
};

const main = () => {
  const { irPath, options } = parseArgs(process.argv.slice(2));
  const absPath = path.resolve(irPath);
  const doc = JSON.parse(fs.readFileSync(absPath, "utf8"));

  const stats = {
    file: path.basename(absPath),
    blocks: {
      total: 0,
      byType: {},
    },
    lists: {
      total: 0,
      items: 0,
    },
    tables: {
      total: 0,
      rows: 0,
      cells: 0,
    },
    inlines: {
      total: 0,
    },
  };

  countBlocks(doc.blocks ?? [], stats);
  if (Array.isArray(doc.headers)) countBlocks(doc.headers, stats);
  if (Array.isArray(doc.footers)) countBlocks(doc.footers, stats);

  const payload = JSON.stringify(stats, null, 2);
  if (options.out) {
    fs.writeFileSync(path.resolve(options.out), payload, "utf8");
  }
  console.log(payload);
};

try {
  main();
} catch (err) {
  console.error(err?.message || err);
  process.exit(1);
}
