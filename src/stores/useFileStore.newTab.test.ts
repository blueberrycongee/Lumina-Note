import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/host", () => ({
  listDirectory: vi.fn(() => Promise.resolve([])),
  listDirShallow: vi.fn(() => Promise.resolve([])),
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

function previewFileTab(path = "/vault/A.md"): Tab {
  return {
    ...fileTab(path),
    isPreview: true,
  };
}

function previewPdfTab(path = "/vault/A.pdf"): Tab {
  return {
    id: `__pdf_${path}__`,
    type: "pdf",
    path,
    name: "A.pdf",
    content: "",
    isDirty: false,
    isPreview: true,
    undoStack: [],
    redoStack: [],
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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

  it("initializes the workspace home tab idempotently", () => {
    const store = useFileStore.getState();

    store.ensureOpenTab();
    store.ensureOpenTab();

    const state = useFileStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].type).toBe("ai-chat");
    expect(state.activeTabIndex).toBe(0);
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

  it("repairs current file state when switching to the already active file tab", () => {
    resetStore([fileTab("/vault/Open.md")], 0);
    useFileStore.setState({
      currentFile: null,
      currentContent: "",
      isDirty: false,
      undoStack: [],
      redoStack: [],
      lastSavedContent: "",
    });

    useFileStore.getState().switchTab(0);

    const state = useFileStore.getState();
    expect(state.currentFile).toBe("/vault/Open.md");
    expect(state.currentContent).toBe("A");
    expect(state.lastSavedContent).toBe("A");
  });

  it("promotes an existing preview tab when the same file is explicitly opened", async () => {
    resetStore([previewFileTab("/vault/Open.md")], 0);

    await useFileStore.getState().openFile("/vault/Open.md");

    const state = useFileStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].isPreview).toBeUndefined();
    expect(state.activeTabIndex).toBe(0);
  });

  it("reuses one preview slot across file types", async () => {
    vi.mocked(readFile).mockResolvedValue("Opened content");
    resetStore([previewPdfTab("/vault/A.pdf")], 0);

    await useFileStore.getState().openFile("/vault/B.md", { preview: true });

    const state = useFileStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]).toMatchObject({
      type: "file",
      path: "/vault/B.md",
      isPreview: true,
    });
  });

  it("opens diagram, pdf, and image files as preview tabs when requested", async () => {
    resetStore([fileTab("/vault/A.md")], 0);

    await useFileStore.getState().openFile("/vault/Sketch.drawio.json", { preview: true });
    expect(useFileStore.getState().tabs.at(-1)).toMatchObject({
      type: "diagram",
      isPreview: true,
    });

    useFileStore.getState().openPDFTab("/vault/Guide.pdf", { preview: true });
    expect(useFileStore.getState().tabs.at(-1)).toMatchObject({
      type: "pdf",
      path: "/vault/Guide.pdf",
      isPreview: true,
    });

    useFileStore.getState().openImageTab("/vault/Image.png", { preview: true });
    expect(useFileStore.getState().tabs.at(-1)).toMatchObject({
      type: "image",
      path: "/vault/Image.png",
      isPreview: true,
    });
  });

  it("ignores a stale preview open when a later permanent open wins the race", async () => {
    resetStore([newTab()], 0);

    const first = createDeferred<string>();
    const second = createDeferred<string>();
    vi.mocked(readFile)
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const firstOpen = useFileStore.getState().openFile("/vault/Race.md", { preview: true });
    const secondOpen = useFileStore.getState().openFile("/vault/Race.md");

    second.resolve("# Race\n\nlatest");
    await secondOpen;

    first.resolve("# Race\n\nstale");
    await firstOpen;

    const state = useFileStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]).toMatchObject({
      type: "file",
      path: "/vault/Race.md",
      content: "# Race\n\nlatest",
    });
    expect(state.tabs[0].isPreview).toBeUndefined();
    expect(state.currentContent).toBe("# Race\n\nlatest");
    expect(state.isLoadingFile).toBe(false);
  });
});
