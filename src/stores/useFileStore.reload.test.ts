import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/tauri", () => ({
  listDirectory: vi.fn(() => Promise.resolve([])),
  readFile: vi.fn(),
  saveFile: vi.fn(),
  createFile: vi.fn(),
}));

import { readFile } from "@/lib/tauri";
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
  });
});
