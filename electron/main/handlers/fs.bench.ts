/**
 * Benchmarks for the workspace walker. Run with `npm run bench`.
 *
 * Each scenario builds a synthetic vault on a tmpdir once, reuses it
 * across runs, and tears down after. We bench three sizes (1k / 5k /
 * 20k files) so regressions show up at the scale where the walker
 * actually gets exercised.
 */

import { afterAll, beforeAll, bench, describe } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { fsHandlers, type FileEntry } from "./fs.js";

// ─── Legacy walker (pre-rewrite) ─────────────────────────────────────
// Reproduces the exact shape of `listDirRecursive` as it lived before
// the workspace performance rewrite, so the bench can compare old vs
// new on the same synthetic vault. Three differences from the new
// walker matter for the numbers:
//   1. recursive (vs iterative) — small but real call-stack cost
//   2. fs.stat() per file to fill size/mtime/ctime — the dominant cost
//   3. hardcoded 3-name ignore set, no .gitignore — irrelevant on our
//      synthetic vaults but explains why production vaults that hit
//      node_modules/.next blew up under the old code

const LEGACY_IGNORED_DIRS = new Set(["node_modules", "target", ".git"]);

function legacyShouldSkip(name: string): boolean {
  if (LEGACY_IGNORED_DIRS.has(name)) return true;
  if (name.startsWith(".") && name !== ".lumina") return true;
  return false;
}

async function legacyListDirRecursive(dirPath: string): Promise<FileEntry[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EPERM" || code === "EACCES" || code === "EMFILE") return [];
    throw err;
  }

  const result: FileEntry[] = [];
  for (const entry of entries) {
    if (legacyShouldSkip(entry.name)) continue;

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const children = await legacyListDirRecursive(fullPath);
      result.push({
        name: entry.name,
        path: fullPath,
        is_dir: true,
        isDirectory: true,
        size: null,
        modified_at: null,
        created_at: null,
        children,
      });
    } else {
      let stat: import("node:fs").Stats | null = null;
      try {
        stat = await fs.stat(fullPath);
      } catch {
        /* ignore */
      }
      result.push({
        name: entry.name,
        path: fullPath,
        is_dir: false,
        isDirectory: false,
        size: stat?.size ?? null,
        modified_at: stat ? Math.floor(stat.mtimeMs) : null,
        created_at: stat ? Math.floor(stat.birthtimeMs) : null,
        children: null,
      });
    }
  }

  result.sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return result;
}

interface Vault {
  root: string;
  fileCount: number;
}

/**
 * Build a synthetic vault with markdown files split across nested
 * directories so the walker has to recurse rather than handling one
 * giant flat dir.
 */
async function buildVault(
  fileCount: number,
  filesPerDir = 50,
): Promise<Vault> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), `lumina-bench-${fileCount}-`),
  );

  const topDirs = Math.max(1, Math.ceil(fileCount / filesPerDir));
  let written = 0;

  for (let d = 0; d < topDirs && written < fileCount; d++) {
    const dirPath = path.join(root, `dir-${d.toString().padStart(4, "0")}`);
    await fs.mkdir(dirPath);

    const half = Math.min(filesPerDir / 2, fileCount - written);
    for (let f = 0; f < half && written < fileCount; f++) {
      await fs.writeFile(
        path.join(dirPath, `note-${f}.md`),
        `# note ${d}/${f}\n\nbody [[other-${f}]] #tag${f % 8}\n`,
      );
      written++;
    }

    if (written < fileCount) {
      const sub = path.join(dirPath, "sub");
      await fs.mkdir(sub);
      const remaining = Math.min(filesPerDir / 2, fileCount - written);
      for (let f = 0; f < remaining && written < fileCount; f++) {
        await fs.writeFile(
          path.join(sub, `nested-${f}.md`),
          `# nested ${d}/${f}\n`,
        );
        written++;
      }
    }
  }

  return { root, fileCount: written };
}

const SIZES = [1_000, 5_000, 20_000] as const;

const vaults = new Map<number, Vault>();

beforeAll(async () => {
  for (const size of SIZES) {
    const vault = await buildVault(size);
    vaults.set(size, vault);
  }
});

afterAll(async () => {
  const tasks: Promise<void>[] = [];
  vaults.forEach((vault) => {
    tasks.push(fs.rm(vault.root, { recursive: true, force: true }));
  });
  await Promise.all(tasks);
});

describe("workspace listing — NEW vs LEGACY", () => {
  for (const size of SIZES) {
    bench(
      `NEW list_directory · ${size.toLocaleString()} files`,
      async () => {
        const vault = vaults.get(size)!;
        await fsHandlers.list_directory({ path: vault.root });
      },
      { iterations: 5 },
    );
    bench(
      `LEGACY listDirRecursive · ${size.toLocaleString()} files`,
      async () => {
        const vault = vaults.get(size)!;
        await legacyListDirRecursive(vault.root);
      },
      { iterations: 5 },
    );
  }
});

describe("fs_walk_paths (flat .md enumeration)", () => {
  for (const size of SIZES) {
    bench(
      `${size.toLocaleString()} files`,
      async () => {
        const vault = vaults.get(size)!;
        await fsHandlers.fs_walk_paths({
          path: vault.root,
          extensions: [".md"],
        });
      },
      { iterations: 5 },
    );
  }
});

describe("fs_walk_paths with size cap (stat each file)", () => {
  for (const size of SIZES) {
    bench(
      `${size.toLocaleString()} files`,
      async () => {
        const vault = vaults.get(size)!;
        await fsHandlers.fs_walk_paths({
          path: vault.root,
          extensions: [".md"],
          maxFileSizeBytes: 2_000_000,
        });
      },
      { iterations: 5 },
    );
  }
});

// Surface walker output type so `FileEntry` is treated as referenced
// by tsc when the file is type-checked in isolation.
export type _WalkerOutput = FileEntry[];
