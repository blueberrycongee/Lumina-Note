import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("electron", () => ({
  shell: {
    openPath: vi.fn(),
  },
}));

import {
  fsHandlers,
  walkWorkspace,
  FILE_MODIFIED_SINCE_PREFIX,
  WORKSPACE_TOO_LARGE_PREFIX,
  type FileEntry,
  type WorkspaceListing,
} from "./fs.js";

async function mkRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "lumina-fs-test-"));
}

async function rm(p: string): Promise<void> {
  await fs.rm(p, { recursive: true, force: true });
}

function findEntry(entries: FileEntry[], name: string): FileEntry | undefined {
  for (const e of entries) {
    if (e.name === name) return e;
    if (e.is_dir && e.children) {
      const inner = findEntry(e.children, name);
      if (inner) return inner;
    }
  }
  return undefined;
}

describe("fs handler — workspace listing", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkRoot();
  });

  afterEach(async () => {
    await rm(root);
  });

  it("lists files and directories with shape compatible with renderer", async () => {
    await fs.writeFile(path.join(root, "a.md"), "");
    await fs.mkdir(path.join(root, "sub"));
    await fs.writeFile(path.join(root, "sub", "b.md"), "");

    const entries = (await fsHandlers.list_directory({
      path: root,
    })) as FileEntry[];

    expect(entries).toHaveLength(2);
    // Sorted: dirs first, then files
    expect(entries[0].name).toBe("sub");
    expect(entries[0].is_dir).toBe(true);
    expect(entries[0].isDirectory).toBe(true);
    expect(entries[0].children).toHaveLength(1);
    expect(entries[0].children?.[0].name).toBe("b.md");
    expect(entries[1].name).toBe("a.md");
    // size/mtime/ctime intentionally not collected anymore
    expect(entries[1].size).toBeNull();
    expect(entries[1].modified_at).toBeNull();
  });

  it("skips default-deny dirs (node_modules, .git, dist) without descending", async () => {
    await fs.mkdir(path.join(root, "node_modules"));
    await fs.writeFile(path.join(root, "node_modules", "huge.md"), "");
    await fs.mkdir(path.join(root, ".git"));
    await fs.writeFile(path.join(root, ".git", "HEAD"), "");
    await fs.mkdir(path.join(root, "dist"));
    await fs.writeFile(path.join(root, "kept.md"), "");

    const entries = (await fsHandlers.list_directory({
      path: root,
    })) as FileEntry[];

    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("kept.md");
  });

  it("keeps .lumina but skips other dotfiles", async () => {
    await fs.mkdir(path.join(root, ".lumina"));
    await fs.writeFile(path.join(root, ".lumina", "config.json"), "");
    await fs.writeFile(path.join(root, ".env"), "secret");
    await fs.writeFile(path.join(root, "note.md"), "");

    const entries = (await fsHandlers.list_directory({
      path: root,
    })) as FileEntry[];

    const names = entries.map((e) => e.name);
    expect(names).toContain(".lumina");
    expect(names).toContain("note.md");
    expect(names).not.toContain(".env");
  });

  it("respects .gitignore at root", async () => {
    await fs.writeFile(path.join(root, ".gitignore"), "secret/\n*.log\n");
    await fs.mkdir(path.join(root, "secret"));
    await fs.writeFile(path.join(root, "secret", "x.md"), "");
    await fs.writeFile(path.join(root, "kept.md"), "");
    await fs.writeFile(path.join(root, "noisy.log"), "");

    const entries = (await fsHandlers.list_directory({
      path: root,
    })) as FileEntry[];

    const names = entries.map((e) => e.name);
    expect(names).toContain("kept.md");
    expect(names).not.toContain("secret");
    expect(names).not.toContain("noisy.log");
  });

  it("lists only immediate children for lazy sidebar expansion", async () => {
    await fs.mkdir(path.join(root, "folder"));
    await fs.mkdir(path.join(root, "folder", "nested"));
    await fs.writeFile(path.join(root, "folder", "note.md"), "");
    await fs.writeFile(path.join(root, "folder", "nested", "deep.md"), "");

    const entries = (await fsHandlers.list_dir_shallow({
      rootPath: root,
      dirPath: path.join(root, "folder"),
    })) as FileEntry[];

    expect(entries.map((e) => e.name)).toEqual(["nested", "note.md"]);
    expect(entries[0].children).toEqual([]);
    expect(entries[0].childrenLoaded).toBe(false);
    expect(entries[1].children).toBeNull();
    expect(entries[1].childrenLoaded).toBe(true);
  });

  it("uses root .gitignore when lazily listing a child directory", async () => {
    await fs.writeFile(path.join(root, ".gitignore"), "folder/secret.md\n");
    await fs.mkdir(path.join(root, "folder"));
    await fs.writeFile(path.join(root, "folder", "secret.md"), "");
    await fs.writeFile(path.join(root, "folder", "visible.md"), "");

    const entries = (await fsHandlers.list_dir_shallow({
      rootPath: root,
      dirPath: path.join(root, "folder"),
    })) as FileEntry[];

    expect(entries.map((e) => e.name)).toEqual(["visible.md"]);
  });

  it("returns a complete listing under the entry/time budgets (truncated stays false)", async () => {
    for (let i = 0; i < 30; i++) {
      await fs.writeFile(path.join(root, `f${i}.md`), "");
    }
    const result = (await fsHandlers.list_workspace({
      path: root,
    })) as WorkspaceListing;
    expect(result.totalEntries).toBe(30);
    expect(result.truncated).toBe(false);
  });

  it("throws WORKSPACE_TOO_LARGE:count when entries exceed the cap (no partial tree)", async () => {
    // Build 25 files, then call walkWorkspace with maxEntries=10 to
    // trigger the count ceiling. The bug we're guarding against: pre-fix,
    // the walker would stop mid-flight and return a tree where an
    // already-emitted-but-not-yet-descended directory looked empty,
    // indistinguishable from a real empty dir.
    for (let i = 0; i < 25; i++) {
      await fs.writeFile(path.join(root, `f${i}.md`), "");
    }

    let caught: Error | null = null;
    try {
      await walkWorkspace(root, {
        maxEntries: 10,
        deadlineMs: 5_000,
        ignoreMatcher: null,
      });
    } catch (e) {
      caught = e as Error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught!.message).toMatch(
      new RegExp(`^${WORKSPACE_TOO_LARGE_PREFIX}:count:\\d+:`),
    );
    // Critically: caller does NOT receive entries — no partial tree leaks
    // through the throw path. (No assertion on entries because the throw
    // means there's no return value to inspect.)
  });

  it("throws WORKSPACE_TOO_LARGE:timeout when the wall-clock deadline is exceeded", async () => {
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(path.join(root, `f${i}.md`), "");
    }

    // Inject a clock that jumps past the deadline on the second call:
    // first call records start time, second call (top of the next loop
    // iteration) sees > deadline.
    let nowCalls = 0;
    const fakeNow = () => {
      nowCalls += 1;
      return nowCalls === 1 ? 0 : 999_999;
    };

    let caught: Error | null = null;
    try {
      await walkWorkspace(root, {
        maxEntries: 1_000,
        deadlineMs: 100,
        ignoreMatcher: null,
        now: fakeNow,
      });
    } catch (e) {
      caught = e as Error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught!.message).toMatch(
      new RegExp(`^${WORKSPACE_TOO_LARGE_PREFIX}:timeout:\\d+:`),
    );
  });

  it("does not throw when a subdirectory is unreadable", async () => {
    // Simulate by creating a directory we then make unreadable. On Linux
    // root can read everything, so we instead point at a non-existent
    // dir as a child via symlink to verify the EACCES/EPERM/ENOENT path
    // is tolerated. We dangle a symlink to a missing target.
    await fs.symlink(
      path.join(root, "nonexistent"),
      path.join(root, "dangling"),
    );
    await fs.writeFile(path.join(root, "real.md"), "");

    const entries = (await fsHandlers.list_directory({
      path: root,
    })) as FileEntry[];
    // dangling is a symlink (not a dir per Dirent.isDirectory()), so it
    // shows up as a file entry. real.md must still be present.
    const names = entries.map((e) => e.name);
    expect(names).toContain("real.md");
  });

  it("walks a flat path list for indexer use (fs_walk_paths)", async () => {
    await fs.writeFile(path.join(root, "a.md"), "x");
    await fs.writeFile(path.join(root, "b.md"), "x");
    await fs.writeFile(path.join(root, "skip.txt"), "x");
    await fs.mkdir(path.join(root, "sub"));
    await fs.writeFile(path.join(root, "sub", "c.md"), "x");

    const result = (await fsHandlers.fs_walk_paths({
      path: root,
      extensions: [".md"],
    })) as { paths: string[]; truncated: boolean; skippedOversize: number };

    expect(result.paths).toHaveLength(3);
    expect(result.paths.every((p) => p.endsWith(".md"))).toBe(true);
    expect(result.truncated).toBe(false);
  });

  it("fs_walk_paths skips files larger than maxFileSizeBytes", async () => {
    await fs.writeFile(path.join(root, "small.md"), "ok");
    await fs.writeFile(path.join(root, "huge.md"), "x".repeat(5_000));

    const result = (await fsHandlers.fs_walk_paths({
      path: root,
      extensions: [".md"],
      maxFileSizeBytes: 100,
    })) as { paths: string[]; skippedOversize: number };

    expect(result.paths.map((p) => path.basename(p))).toEqual(["small.md"]);
    expect(result.skippedOversize).toBe(1);
  });

  it("ignores files whose name matches the default deny set (.DS_Store)", async () => {
    await fs.writeFile(path.join(root, ".DS_Store"), "");
    await fs.writeFile(path.join(root, "note.md"), "");

    const entries = (await fsHandlers.list_directory({
      path: root,
    })) as FileEntry[];
    expect(entries.map((e) => e.name)).toEqual(["note.md"]);
  });

  // Ensure walking is iterative (not recursive) by building a deep tree
  // and confirming no stack overflow. 200 nested dirs is well past any
  // realistic case but cheap to construct.
  it("handles deeply nested directories without stack overflow", async () => {
    let cursor = root;
    for (let i = 0; i < 200; i++) {
      cursor = path.join(cursor, `d${i}`);
      await fs.mkdir(cursor);
    }
    await fs.writeFile(path.join(cursor, "leaf.md"), "");

    const entries = (await fsHandlers.list_directory({
      path: root,
    })) as FileEntry[];
    expect(findEntry(entries, "leaf.md")?.name).toBe("leaf.md");
  });

  it("refuses save_file when expected version is stale", async () => {
    const file = path.join(root, "note.md");
    await fs.writeFile(file, "old");
    const stat = await fs.stat(file);
    await fs.writeFile(file, "external");

    await expect(
      fsHandlers.save_file({
        path: file,
        content: "mine",
        expectedVersion: {
          size: stat.size,
          mtimeMs: stat.mtimeMs,
        },
      }),
    ).rejects.toThrow(FILE_MODIFIED_SINCE_PREFIX);

    await expect(fs.readFile(file, "utf-8")).resolves.toBe("external");
  });

  it("allows save_file overwrite to bypass stale expected version", async () => {
    const file = path.join(root, "note.md");
    await fs.writeFile(file, "old");
    const stat = await fs.stat(file);
    await fs.writeFile(file, "external");

    await fsHandlers.save_file({
      path: file,
      content: "mine",
      expectedVersion: {
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      },
      overwrite: true,
    });

    await expect(fs.readFile(file, "utf-8")).resolves.toBe("mine");
  });
});
