import { describe, expect, it } from "vitest";
import type { FileEntry } from "@/lib/host";

import { flattenFileTree, type FileTreeRow } from "./Sidebar";
import type { CreatingState } from "./hooks/useSidebarFileOperations";

function dir(name: string, children: FileEntry[]): FileEntry {
  return {
    name,
    path: `/v/${name}`,
    is_dir: true,
    isDirectory: true,
    size: null,
    modified_at: null,
    created_at: null,
    children,
  };
}

function file(name: string, parentPath = "/v"): FileEntry {
  return {
    name,
    path: `${parentPath}/${name}`,
    is_dir: false,
    isDirectory: false,
    size: null,
    modified_at: null,
    created_at: null,
    children: null,
  };
}

function nested(name: string, parent: FileEntry, kids: FileEntry[]): FileEntry {
  const fullPath = `${parent.path}/${name}`;
  return {
    name,
    path: fullPath,
    is_dir: true,
    isDirectory: true,
    size: null,
    modified_at: null,
    created_at: null,
    children: kids.map((k) => ({ ...k, path: `${fullPath}/${k.name}` })),
  };
}

describe("flattenFileTree", () => {
  it("only includes children of expanded folders", () => {
    const tree: FileEntry[] = [
      dir("alpha", [file("a1.md", "/v/alpha"), file("a2.md", "/v/alpha")]),
      dir("beta", [file("b1.md", "/v/beta")]),
      file("root.md"),
    ];

    const expanded = new Set<string>(["/v/alpha"]);
    const rows: FileTreeRow[] = [];
    flattenFileTree(tree, expanded, null, new Set(), 0, rows);

    expect(
      rows.map((r) => (r.kind === "entry" ? r.entry.name : "[input]")),
    ).toEqual(["alpha", "a1.md", "a2.md", "beta", "root.md"]);
    // Levels: alpha=0, its children=1, beta=0, root.md=0
    expect(rows.map((r) => r.level)).toEqual([0, 1, 1, 0, 0]);
  });

  it("collapsed folders contribute exactly one row", () => {
    const tree: FileEntry[] = [
      dir("alpha", [file("a1.md", "/v/alpha"), file("a2.md", "/v/alpha")]),
    ];
    const rows: FileTreeRow[] = [];
    flattenFileTree(tree, new Set(), null, new Set(), 0, rows);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind === "entry" && rows[0].entry.name).toBe("alpha");
  });

  it("inserts a creating row at the top of the parent folder when expanded", () => {
    const tree: FileEntry[] = [dir("alpha", [file("a1.md", "/v/alpha")])];
    const expanded = new Set<string>(["/v/alpha"]);
    const creating: CreatingState = {
      parentPath: "/v/alpha",
      type: "file",
    };
    const rows: FileTreeRow[] = [];
    flattenFileTree(tree, expanded, creating, new Set(), 0, rows);

    expect(rows).toHaveLength(3);
    expect(rows[0].kind).toBe("entry");
    expect(rows[1].kind).toBe("creating");
    expect(rows[1].level).toBe(1);
    expect(rows[2].kind).toBe("entry");
  });

  it("inserts a loading row for an expanded folder still loading children", () => {
    const tree: FileEntry[] = [dir("alpha", []), file("root.md")];
    const expanded = new Set<string>(["/v/alpha"]);
    const rows: FileTreeRow[] = [];
    flattenFileTree(tree, expanded, null, new Set(["/v/alpha"]), 0, rows);

    expect(rows.map((r) => r.kind)).toEqual(["entry", "loading", "entry"]);
    expect(rows[1].level).toBe(1);
  });

  it("does not insert a creating row when its parent is collapsed", () => {
    const tree: FileEntry[] = [dir("alpha", [file("a1.md", "/v/alpha")])];
    const creating: CreatingState = {
      parentPath: "/v/alpha",
      type: "file",
    };
    const rows: FileTreeRow[] = [];
    flattenFileTree(tree, new Set(), creating, new Set(), 0, rows);
    expect(rows).toHaveLength(1);
    expect(rows.every((r) => r.kind === "entry")).toBe(true);
  });

  it("handles deeply nested expansion without losing order", () => {
    const leaf = dir("leaf", [file("z.md", "/v/a/b/leaf")]);
    const mid = nested("b", { ...dir("a", []) }, [leaf]);
    const root = dir("a", [mid]);
    const tree = [root];

    const expanded = new Set<string>(["/v/a", "/v/a/b", "/v/a/b/leaf"]);
    const rows: FileTreeRow[] = [];
    flattenFileTree(tree, expanded, null, new Set(), 0, rows);

    const names = rows.map((r) =>
      r.kind === "entry" ? `${r.level}:${r.entry.name}` : "[input]",
    );
    expect(names).toEqual(["0:a", "1:b", "2:leaf", "3:z.md"]);
  });
});
