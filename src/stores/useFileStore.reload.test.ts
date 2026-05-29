import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/host", () => ({
  listDirectory: vi.fn(() => Promise.resolve([])),
  readFile: vi.fn(),
  saveFile: vi.fn(),
  getFileVersion: vi.fn(),
  isFileModifiedSinceError: vi.fn((error: unknown) => {
    return (
      error instanceof Error && error.message.includes("FILE_MODIFIED_SINCE")
    );
  }),
  createFile: vi.fn(),
  createDir: vi.fn((path: string, options?: { recursive?: boolean }) => Promise.resolve({ path, options })),
}));

import { getFileVersion, readFile, saveFile } from "@/lib/host";
import { useFileStore } from "./useFileStore";

describe("useFileStore reloadFileIfOpen", () => {
  beforeEach(() => {
    useFileStore.setState({
      tabs: [],
      activeTabIndex: -1,
      currentFile: null,
      currentContent: "",
      lastSavedContent: "",
      isDirty: false,
    });
    vi.clearAllMocks();
    vi.mocked(getFileVersion).mockResolvedValue({
      size: 8,
      mtimeMs: 100,
    });
    vi.mocked(saveFile).mockResolvedValue(undefined);
  });

  it("reloads open file when not dirty", async () => {
    vi.mocked(readFile).mockResolvedValue("Reloaded");

    useFileStore.setState({
      tabs: [
        {
          id: "/path/to/file.md",
          type: "file",
          path: "/path/to/file.md",
          name: "file",
          content: "Old",
          isDirty: false,
          undoStack: [],
          redoStack: [],
        },
      ],
      activeTabIndex: 0,
      currentFile: "/path/to/file.md",
      currentContent: "Old",
      lastSavedContent: "Old",
      isDirty: false,
    });

    const store = useFileStore.getState();
    await store.reloadFileIfOpen("/path/to/file.md");

    expect(readFile).toHaveBeenCalledWith("/path/to/file.md");
    expect(useFileStore.getState().currentContent).toBe("Reloaded");
    expect(useFileStore.getState().lastSavedContent).toBe("Reloaded");
    expect(useFileStore.getState().tabs[0].diskStatus).toBe("clean");
  });

  it("skips reload when dirty and skipIfDirty is true", async () => {
    vi.mocked(readFile).mockResolvedValue("Reloaded");

    useFileStore.setState({
      tabs: [
        {
          id: "/path/to/file.md",
          type: "file",
          path: "/path/to/file.md",
          name: "file",
          content: "Dirty",
          isDirty: true,
          undoStack: [],
          redoStack: [],
        },
      ],
      activeTabIndex: 0,
      currentFile: "/path/to/file.md",
      currentContent: "Dirty",
      lastSavedContent: "Dirty",
      isDirty: true,
    });

    const store = useFileStore.getState();
    await store.reloadFileIfOpen("/path/to/file.md", { skipIfDirty: true });

    expect(readFile).not.toHaveBeenCalled();
    expect(useFileStore.getState().currentContent).toBe("Dirty");
    expect(useFileStore.getState().tabs[0].diskStatus).toBe("modified");
  });

  it("skips reload when active content is dirty even if tab is clean", async () => {
    vi.mocked(readFile).mockResolvedValue("Reloaded");

    useFileStore.setState({
      tabs: [
        {
          id: "/path/to/file.md",
          type: "file",
          path: "/path/to/file.md",
          name: "file",
          content: "Saved",
          isDirty: false,
          undoStack: [],
          redoStack: [],
        },
      ],
      activeTabIndex: 0,
      currentFile: "/path/to/file.md",
      currentContent: "Typing",
      lastSavedContent: "Saved",
      isDirty: true,
    });

    const store = useFileStore.getState();
    await store.reloadFileIfOpen("/path/to/file.md", { skipIfDirty: true });

    expect(readFile).not.toHaveBeenCalled();
    expect(useFileStore.getState().currentContent).toBe("Typing");
    expect(useFileStore.getState().tabs[0].diskStatus).toBe("modified");
  });

  it("marks open file as deleted on disk without reading", async () => {
    useFileStore.setState({
      tabs: [
        {
          id: "/path/to/file.md",
          type: "file",
          path: "/path/to/file.md",
          name: "file",
          content: "Saved",
          isDirty: false,
          undoStack: [],
          redoStack: [],
        },
      ],
      activeTabIndex: 0,
      currentFile: "/path/to/file.md",
      currentContent: "Saved",
      lastSavedContent: "Saved",
      isDirty: false,
    });

    await useFileStore
      .getState()
      .reloadFileIfOpen("/path/to/file.md", { changeKind: "deleted" });

    expect(readFile).not.toHaveBeenCalled();
    expect(useFileStore.getState().tabs[0].diskStatus).toBe("deleted");
    expect(useFileStore.getState().currentContent).toBe("Saved");
  });

  it("marks save conflict and keeps dirty content", async () => {
    vi.mocked(saveFile).mockRejectedValue(
      new Error("FILE_MODIFIED_SINCE:changed"),
    );

    useFileStore.setState({
      tabs: [
        {
          id: "/path/to/file.md",
          type: "file",
          path: "/path/to/file.md",
          name: "file",
          content: "Dirty",
          isDirty: true,
          lastSavedContent: "Saved",
          diskVersion: { size: 5, mtimeMs: 1 },
          undoStack: [],
          redoStack: [],
        },
      ],
      activeTabIndex: 0,
      currentFile: "/path/to/file.md",
      currentContent: "Dirty",
      lastSavedContent: "Saved",
      isDirty: true,
      isSaving: false,
    });

    const saved = await useFileStore.getState().save();

    expect(saved).toBe(false);
    expect(useFileStore.getState().tabs[0].diskStatus).toBe("conflict");
    expect(useFileStore.getState().currentContent).toBe("Dirty");
    expect(useFileStore.getState().isDirty).toBe(true);
  });

  it("does not recreate a deleted-on-disk file on normal save", async () => {
    useFileStore.setState({
      tabs: [
        {
          id: "/path/to/file.md",
          type: "file",
          path: "/path/to/file.md",
          name: "file",
          content: "Dirty",
          isDirty: true,
          lastSavedContent: "Saved",
          diskStatus: "deleted",
          diskVersion: null,
          undoStack: [],
          redoStack: [],
        },
      ],
      activeTabIndex: 0,
      currentFile: "/path/to/file.md",
      currentContent: "Dirty",
      lastSavedContent: "Saved",
      isDirty: true,
      isSaving: false,
    });

    const saved = await useFileStore.getState().save();

    expect(saved).toBe(false);
    expect(saveFile).not.toHaveBeenCalled();
    expect(useFileStore.getState().tabs[0].diskStatus).toBe("deleted");
  });
});
