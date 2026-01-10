import { describe, it, expect, beforeEach, vi } from "vitest";
import { useFavoriteStore } from "./useFavoriteStore";
import type { FileEntry } from "@/lib/tauri";

const makeFileTree = (paths: string[]): FileEntry[] => {
  const toEntry = (path: string): FileEntry => ({
    name: path.split(/[/\\]/).pop() || path,
    path,
    is_dir: false,
    children: null,
  });
  return paths.map(toEntry);
};

describe("useFavoriteStore", () => {
  beforeEach(() => {
    useFavoriteStore.setState({
      favorites: {},
      manualOrder: [],
      defaultSortMode: "manual",
    });
    vi.useRealTimers();
  });

  it("adds only markdown favorites", () => {
    const store = useFavoriteStore.getState();
    store.addFavorite("/notes/a.md");
    store.addFavorite("/notes/b.pdf");

    expect(store.isFavorite("/notes/a.md")).toBe(true);
    expect(store.isFavorite("/notes/b.pdf")).toBe(false);
    expect(store.getFavorites("manual").map((f) => f.path)).toEqual(["/notes/a.md"]);
  });

  it("supports manual ordering and move", () => {
    const store = useFavoriteStore.getState();
    store.addFavorite("/notes/a.md");
    store.addFavorite("/notes/b.md");
    store.addFavorite("/notes/c.md");

    store.moveFavorite(2, 0);
    const ordered = store.getFavorites("manual").map((f) => f.path);
    expect(ordered).toEqual(["/notes/c.md", "/notes/a.md", "/notes/b.md"]);
  });

  it("sorts by recent added", () => {
    const store = useFavoriteStore.getState();
    store.addFavorite("/notes/a.md", 1000);
    store.addFavorite("/notes/b.md", 2000);
    store.addFavorite("/notes/c.md", 1500);

    const ordered = store.getFavorites("recentAdded").map((f) => f.path);
    expect(ordered).toEqual(["/notes/b.md", "/notes/c.md", "/notes/a.md"]);
  });

  it("sorts by recent opened with addedAt fallback", () => {
    const store = useFavoriteStore.getState();
    store.addFavorite("/notes/a.md", 1000);
    store.addFavorite("/notes/b.md", 2000);
    store.addFavorite("/notes/c.md", 1500);

    store.markOpened("/notes/a.md", 5000);
    store.markOpened("/notes/c.md", 3000);

    const ordered = store.getFavorites("recentOpened").map((f) => f.path);
    expect(ordered).toEqual(["/notes/a.md", "/notes/c.md", "/notes/b.md"]);
  });

  it("updates paths on rename", () => {
    const store = useFavoriteStore.getState();
    store.addFavorite("/notes/a.md");
    store.updatePath("/notes/a.md", "/notes/renamed.md");

    expect(store.isFavorite("/notes/a.md")).toBe(false);
    expect(store.isFavorite("/notes/renamed.md")).toBe(true);
    expect(store.getFavorites("manual").map((f) => f.path)).toEqual(["/notes/renamed.md"]);
  });

  it("updates paths on folder move", () => {
    const store = useFavoriteStore.getState();
    store.addFavorite("/notes/folder/a.md");
    store.addFavorite("/notes/folder/sub/b.md");

    store.updatePathsForFolderMove("/notes/folder", "/notes/moved");
    const ordered = store.getFavorites("manual").map((f) => f.path);
    expect(ordered).toEqual(["/notes/moved/a.md", "/notes/moved/sub/b.md"]);
  });

  it("prunes missing favorites based on file tree", () => {
    const store = useFavoriteStore.getState();
    store.addFavorite("/notes/a.md");
    store.addFavorite("/notes/b.md");
    store.addFavorite("/notes/c.md");

    const tree = makeFileTree(["/notes/a.md", "/notes/c.md"]);
    store.pruneMissing(tree);

    const remaining = store.getFavorites("manual").map((f) => f.path);
    expect(remaining).toEqual(["/notes/a.md", "/notes/c.md"]);
  });
});
