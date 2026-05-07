/**
 * Benchmarks for the renderer-side tree flattening that drives sidebar
 * virtualization. Recomputed on every expansion toggle, so its cost
 * lives on the critical path of the most common interaction.
 */

import { bench, describe } from "vitest";
import type { FileEntry } from "@/lib/host";
import { flattenFileTree } from "@/components/layout/Sidebar";

/**
 * Build a synthetic in-memory file tree mirroring the shape returned
 * by `list_directory`: top-level directories, each with files plus a
 * nested subdir. Done as plain object construction so the bench
 * captures only flatten cost, never IO.
 */
function buildTree(fileCount: number, filesPerDir = 50): FileEntry[] {
  const root: FileEntry[] = [];
  const topDirs = Math.max(1, Math.ceil(fileCount / filesPerDir));
  let written = 0;

  for (let d = 0; d < topDirs && written < fileCount; d++) {
    const dirPath = `/v/dir-${d}`;
    const dirChildren: FileEntry[] = [];

    const half = Math.min(filesPerDir / 2, fileCount - written);
    for (let f = 0; f < half && written < fileCount; f++) {
      dirChildren.push({
        name: `note-${f}.md`,
        path: `${dirPath}/note-${f}.md`,
        is_dir: false,
        isDirectory: false,
        size: null,
        modified_at: null,
        created_at: null,
        children: null,
      });
      written++;
    }

    if (written < fileCount) {
      const subPath = `${dirPath}/sub`;
      const subChildren: FileEntry[] = [];
      const remaining = Math.min(filesPerDir / 2, fileCount - written);
      for (let f = 0; f < remaining && written < fileCount; f++) {
        subChildren.push({
          name: `nested-${f}.md`,
          path: `${subPath}/nested-${f}.md`,
          is_dir: false,
          isDirectory: false,
          size: null,
          modified_at: null,
          created_at: null,
          children: null,
        });
        written++;
      }
      dirChildren.push({
        name: "sub",
        path: subPath,
        is_dir: true,
        isDirectory: true,
        size: null,
        modified_at: null,
        created_at: null,
        children: subChildren,
      });
    }

    root.push({
      name: `dir-${d}`,
      path: dirPath,
      is_dir: true,
      isDirectory: true,
      size: null,
      modified_at: null,
      created_at: null,
      children: dirChildren,
    });
  }

  return root;
}

function collectAllDirs(entries: FileEntry[], out: Set<string>): void {
  for (const e of entries) {
    if (e.is_dir) {
      out.add(e.path);
      if (e.children) collectAllDirs(e.children, out);
    }
  }
}

const SIZES = [1_000, 5_000, 20_000] as const;
const trees = new Map<number, FileEntry[]>();
const allExpanded = new Map<number, Set<string>>();
const noneExpanded = new Set<string>();

for (const size of SIZES) {
  const t = buildTree(size);
  trees.set(size, t);
  const exp = new Set<string>();
  collectAllDirs(t, exp);
  allExpanded.set(size, exp);
}

describe("flattenFileTree (all folders expanded — worst case)", () => {
  for (const size of SIZES) {
    bench(
      `${size.toLocaleString()} files`,
      () => {
        flattenFileTree(trees.get(size)!, allExpanded.get(size)!, null, 0, []);
      },
      { iterations: 100 },
    );
  }
});

describe("flattenFileTree (all folders collapsed — typical case)", () => {
  for (const size of SIZES) {
    bench(
      `${size.toLocaleString()} files`,
      () => {
        flattenFileTree(trees.get(size)!, noneExpanded, null, 0, []);
      },
      { iterations: 100 },
    );
  }
});
