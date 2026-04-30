import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/host", () => ({
  listDirectory: vi.fn(() => Promise.resolve([])),
  readFile: vi.fn(),
  saveFile: vi.fn(() => Promise.resolve()),
  createFile: vi.fn(() => Promise.resolve()),
  createDir: vi.fn(() => Promise.resolve()),
  estimateDirSize: vi.fn(() => Promise.resolve(0)),
  invoke: vi.fn(() => Promise.resolve()),
}));

import { readFile } from "@/lib/host";
import { useFileStore, type Tab } from "./useFileStore";

function resetStore(tabs: Tab[] = [], activeTabIndex = -1) {
  useFileStore.setState({
    vaultPath: "/vault",
    fileTree: [],
    tabs,
    activeTabIndex,
    currentFile: tabs[activeTabIndex]?.path || null,
    currentContent: tabs[activeTabIndex]?.content || "",
    isDirty: tabs[activeTabIndex]?.isDirty || false,
    isLoadingTree: false,
    isLoadingFile: false,
    isSaving: false,
    undoStack: tabs[activeTabIndex]?.undoStack || [],
    redoStack: tabs[activeTabIndex]?.redoStack || [],
    lastSavedContent: tabs[activeTabIndex]?.lastSavedContent || "",
    navigationHistory: [],
    navigationIndex: -1,
    recentFiles: [],
  });
}

function newTab(id = "new-tab-1"): Tab {
  return {
    id,
    type: "new-tab",
    path: "",
    name: "New Tab",
    content: "",
    isDirty: false,
    lastSavedContent: "",
    undoStack: [],
    redoStack: [],
  };
}

function fileTab(path = "/vault/A.md"): Tab {
  return {
    id: path,
    type: "file",
    path,
    name: "A",
    content: "A",
    isDirty: false,
    lastSavedContent: "A",
    undoStack: [],
    redoStack: [],
  };
}

describe("useFileStore new tabs", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it("allows multiple store-backed new tabs", () => {
    const store = useFileStore.getState();

    store.openNewTab();
    store.openNewTab();

    const state = useFileStore.getState();
    expect(state.tabs.map((tab) => tab.type)).toEqual(["new-tab", "new-tab"]);
    expect(state.activeTabIndex).toBe(1);
  });

  it("replenishes a new tab when the last tab is closed", async () => {
    resetStore([newTab()], 0);

    await useFileStore.getState().closeTab(0);

    const state = useFileStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].type).toBe("new-tab");
    expect(state.activeTabIndex).toBe(0);
    expect(state.currentFile).toBeNull();
  });

  it("replaces all unpinned tabs with a new tab when closing all leaves none", async () => {
    resetStore([fileTab()], 0);

    await useFileStore.getState().closeAllTabs();

    const state = useFileStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].type).toBe("new-tab");
    expect(state.activeTabIndex).toBe(0);
  });

  it("uses the active new tab when opening a file", async () => {
    vi.mocked(readFile).mockResolvedValue("Opened content");
    resetStore([newTab()], 0);

    await useFileStore.getState().openFile("/vault/Open.md");

    const state = useFileStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]).toMatchObject({
      type: "file",
      path: "/vault/Open.md",
      content: "Opened content",
    });
    expect(state.activeTabIndex).toBe(0);
    expect(state.currentFile).toBe("/vault/Open.md");
  });
});
