import fs from "node:fs";
import path from "node:path";

const parseArgs = (argv) => {
  const args = [...argv];
  if (args.length < 2) {
    throw new Error("Usage: node scripts/typesetting_ir_diff.mjs <base.json> <candidate.json> [--out <file>]");
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

const diffNumber = (base, candidate) => candidate - base;

const main = () => {
  const { basePath, candidatePath, options } = parseArgs(process.argv.slice(2));
  const base = JSON.parse(fs.readFileSync(path.resolve(basePath), "utf8"));
  const candidate = JSON.parse(fs.readFileSync(path.resolve(candidatePath), "utf8"));

  const output = {
    base: base.file ?? path.basename(basePath),
    candidate: candidate.file ?? path.basename(candidatePath),
    diff: {
      blocks: {
        total: diffNumber(base.blocks.total, candidate.blocks.total),
        byType: {},
      },
      lists: {
        total: diffNumber(base.lists.total, candidate.lists.total),
        items: diffNumber(base.lists.items, candidate.lists.items),
      },
      tables: {
        total: diffNumber(base.tables.total, candidate.tables.total),
        rows: diffNumber(base.tables.rows, candidate.tables.rows),
        cells: diffNumber(base.tables.cells, candidate.tables.cells),
      },
      inlines: {
        total: diffNumber(base.inlines.total, candidate.inlines.total),
      },
    },
  };

  const allTypes = new Set([ ...Object.keys(base.blocks.byType ?? {}), ...Object.keys(candidate.blocks.byType ?? {}) ]);
  for (const type of allTypes) {
    const baseVal = base.blocks.byType?.[type] ?? 0;
    const candVal = candidate.blocks.byType?.[type] ?? 0;
    output.diff.blocks.byType[type] = diffNumber(baseVal, candVal);
  }

  const payload = JSON.stringify(output, null, 2);
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
