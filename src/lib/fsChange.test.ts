import { describe, expect, it, vi } from "vitest";
import {
  getFsChangeAffectedDirectoryPaths,
  getFsChangeAffectedPaths,
  handleFsChangeEvent,
  normalizeFsChange,
} from "./fsChange";

describe("handleFsChangeEvent", () => {
  it("calls onReloadPath for modified events", () => {
    const onReloadPath = vi.fn();
    handleFsChangeEvent({ type: "Modified", path: "/tmp/a.md" }, onReloadPath);
    expect(onReloadPath).toHaveBeenCalledWith("/tmp/a.md");
  });

  it("normalizes current Electron watcher events", () => {
    expect(
      normalizeFsChange({
        kind: "modified",
        type: "Modified",
        path: "/tmp/a.md",
        isDirectory: false,
      }),
    ).toEqual({
      kind: "modified",
      path: "/tmp/a.md",
      isDirectory: false,
    });
  });

  it("normalizes legacy lowercase watcher events", () => {
    expect(normalizeFsChange({ type: "remove", path: "/tmp/a.md" })).toEqual({
      kind: "deleted",
      path: "/tmp/a.md",
      isDirectory: false,
    });
  });

  it("calls onReloadPath for created events", () => {
    const onReloadPath = vi.fn();
    handleFsChangeEvent({ type: "Created", path: "/tmp/b.md" }, onReloadPath);
    expect(onReloadPath).toHaveBeenCalledWith("/tmp/b.md");
  });

  it("calls onReloadPath for deleted events", () => {
    const onReloadPath = vi.fn();
    handleFsChangeEvent({ type: "Deleted", path: "/tmp/c.md" }, onReloadPath);
    expect(onReloadPath).toHaveBeenCalledWith("/tmp/c.md");
  });

  it("uses new_path for renamed events", () => {
    const onReloadPath = vi.fn();
    handleFsChangeEvent(
      { type: "Renamed", old_path: "/tmp/old.md", new_path: "/tmp/new.md" },
      onReloadPath,
    );
    expect(onReloadPath).toHaveBeenCalledWith("/tmp/new.md");
  });

  it("returns both paths for rename events", () => {
    const change = normalizeFsChange({
      type: "Renamed",
      old_path: "/tmp/old.md",
      new_path: "/tmp/new.md",
    });
    expect(change).not.toBeNull();
    expect(getFsChangeAffectedPaths(change!)).toEqual([
      "/tmp/old.md",
      "/tmp/new.md",
    ]);
  });

  it("does not call onReloadPath for invalid payloads", () => {
    const onReloadPath = vi.fn();
    handleFsChangeEvent(null, onReloadPath);
    handleFsChangeEvent(undefined, onReloadPath);
    handleFsChangeEvent({ type: "Modified" }, onReloadPath);
    handleFsChangeEvent(
      { type: "Renamed", old_path: "/tmp/old.md" },
      onReloadPath,
    );
    handleFsChangeEvent({ type: "Unknown", path: "/tmp/d.md" }, onReloadPath);
    expect(onReloadPath).not.toHaveBeenCalled();
  });
});

describe("getFsChangeAffectedDirectoryPaths", () => {
  it("returns the parent directory for file changes", () => {
    const change = normalizeFsChange({
      kind: "created",
      path: "/vault/notes/a.md",
    });

    expect(change).not.toBeNull();
    expect(getFsChangeAffectedDirectoryPaths(change!, "/vault")).toEqual([
      "/vault/notes",
    ]);
  });

  it("returns old and new parent directories for rename events", () => {
    const change = normalizeFsChange({
      type: "Renamed",
      old_path: "/vault/drafts/a.md",
      new_path: "/vault/published/a.md",
    });

    expect(change).not.toBeNull();
    expect(getFsChangeAffectedDirectoryPaths(change!, "/vault")).toEqual([
      "/vault/published",
      "/vault/drafts",
    ]);
  });

  it("clamps affected directories to the watched root", () => {
    const change = normalizeFsChange({
      type: "Renamed",
      old_path: "/outside/a.md",
      new_path: "/vault/a.md",
    });

    expect(change).not.toBeNull();
    expect(getFsChangeAffectedDirectoryPaths(change!, "/vault")).toEqual([
      "/vault",
    ]);
  });
});
