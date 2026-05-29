import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileEntry } from "@/lib/host";

vi.mock("@/lib/host", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/host")>("@/lib/host");
  return {
    invoke: vi.fn(async () => undefined),
    listDirectory: vi.fn(async () => []),
    listDirShallow: vi.fn(),
    parseWorkspaceTooLargeError: actual.parseWorkspaceTooLargeError,
    readFile: vi.fn(),
    saveFile: vi.fn(),
    getFileVersion: vi.fn(async () => null),
    isFileModifiedSinceError: actual.isFileModifiedSinceError,
    createFile: vi.fn(),
    createDir: vi.fn(async () => undefined),
    estimateDirSize: vi.fn(async () => ({
      warning: false,
      isSystemDir: false,
      topLevelCount: 0,
    })),
  };
});

import { listDirShallow } from "@/lib/host";
import { useFileStore, type Tab } from "@/stores/useFileStore";

function file(name: string, parentPath = "/vault"): FileEntry {
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

function dir(
  name: string,
  parentPath = "/vault",
  children: FileEntry[] | null = null,
  childrenLoaded = false,
): FileEntry {
  return {
    name,
    path: `${parentPath}/${name}`,
    is_dir: true,
    isDirectory: true,
    size: null,
    modified_at: null,
    created_at: null,
    children,
    childrenLoaded,
  };
}

function resetStore() {
  useFileStore.setState({
    vaultPath: "/vault",
    fileTree: [],
    loadingDirectoryPaths: [],
    tabs: [],
    activeTabIndex: -1,
    currentFile: null,
    currentContent: "",
    isDirty: false,
    isLoadingTree: false,
    isLoadingFile: false,
    isSaving: false,
    undoStack: [],
    redoStack: [],
    lastSavedContent: "",
    navigationHistory: [],
    navigationIndex: -1,
    recentFiles: [],
  });
}

function fileTab(path: string): Tab {
  return {
    id: path,
    type: "file",
    path,
    name: path.split("/").pop()?.replace(/\.md$/i, "") ?? path,
    content: "",
    isDirty: false,
    undoStack: [],
    redoStack: [],
  };
}

describe("useFileStore file tree refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("refreshes loaded directory children in place", async () => {
    useFileStore.setState({
      fileTree: [
        dir(
          "notes",
          "/vault",
          [
            file("old.md", "/vault/notes"),
            dir(
              "nested",
              "/vault/notes",
              [file("deep.md", "/vault/notes/nested")],
              true,
            ),
          ],
          true,
        ),
      ],
    });
    vi.mocked(listDirShallow).mockResolvedValueOnce([
      file("new.md", "/vault/notes"),
      dir("nested", "/vault/notes", null, false),
    ]);

    await useFileStore.getState().refreshDirectoryChildren("/vault/notes");

    expect(listDirShallow).toHaveBeenCalledWith("/vault", "/vault/notes");
    const notes = useFileStore.getState().fileTree[0];
    expect(notes.children?.map((entry) => entry.name)).toEqual([
      "new.md",
      "nested",
    ]);
    const nested = notes.children?.[1];
    expect(nested?.childrenLoaded).toBe(true);
    expect(nested?.children?.map((entry) => entry.name)).toEqual(["deep.md"]);
  });

  it("does not load collapsed directories after external changes", async () => {
    useFileStore.setState({
      fileTree: [dir("notes", "/vault", null, false)],
    });

    await useFileStore.getState().refreshDirectoryChildren("/vault/notes");

    expect(listDirShallow).not.toHaveBeenCalled();
  });

  it("preserves loaded directory state during a root refresh", async () => {
    useFileStore.setState({
      fileTree: [
        dir("notes", "/vault", [file("a.md", "/vault/notes")], true),
      ],
    });
    vi.mocked(listDirShallow).mockResolvedValueOnce([
      dir("notes"),
      file("root.md"),
    ]);

    await useFileStore.getState().refreshFileTree();

    const state = useFileStore.getState();
    expect(listDirShallow).toHaveBeenCalledWith("/vault", "/vault");
    expect(state.fileTree.map((entry) => entry.name)).toEqual([
      "notes",
      "root.md",
    ]);
    expect(state.fileTree[0].childrenLoaded).toBe(true);
    expect(state.fileTree[0].children?.map((entry) => entry.name)).toEqual([
      "a.md",
    ]);
  });

  it("remaps open child tabs when a folder is renamed", () => {
    useFileStore.setState({
      tabs: [fileTab("/vault/old/a.md")],
      activeTabIndex: 0,
      currentFile: "/vault/old/a.md",
      navigationHistory: ["/vault/old/a.md"],
      recentFiles: ["/vault/old/a.md"],
    });

    useFileStore
      .getState()
      .updateTabPath("/vault/old", "/vault/new", { isDirectory: true });

    const state = useFileStore.getState();
    expect(state.tabs[0].path).toBe("/vault/new/a.md");
    expect(state.tabs[0].id).toBe("/vault/new/a.md");
    expect(state.currentFile).toBe("/vault/new/a.md");
    expect(state.navigationHistory).toEqual(["/vault/new/a.md"]);
    expect(state.recentFiles).toEqual(["/vault/new/a.md"]);
  });
});
