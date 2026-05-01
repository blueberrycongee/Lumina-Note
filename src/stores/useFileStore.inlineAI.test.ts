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

import { useFileStore, type Tab } from "./useFileStore";
import {
  getSlashAIInlineTaskForTab,
  removeSlashAIInlineTask,
  startSlashAIInlineTask,
  useSlashAIInlineStore,
  type SlashAIInlineTask,
} from "./useSlashAIInlineStore";

function fileTab(id: string, path: string): Tab {
  return {
    id,
    type: "file",
    path,
    name: path.split("/").pop() ?? path,
    content: id,
    isDirty: false,
    lastSavedContent: id,
    undoStack: [],
    redoStack: [],
  };
}

function inlineTask(id: string, tabId: string): SlashAIInlineTask {
  return {
    id,
    tabId,
    filePath: `/vault/${tabId}.md`,
    action: "chat-insert",
    request: "write",
    slashRange: { from: 0, to: 1 },
    preview: {
      id,
      status: "running",
      anchor: 0,
      commandLabel: "AI Chat",
      labels: {
        previewTitle: "Preview",
        generating: "Generating",
        insert: "Insert",
        cancel: "Cancel",
        regenerate: "Regenerate",
        stages: {
          understanding: "Understanding",
          "reading-context": "Reading",
          "preparing-context": "Preparing",
          generating: "Generating",
          ready: "Ready",
        },
      },
      stageStatuses: {
        understanding: "active",
        "reading-context": "pending",
        "preparing-context": "pending",
        generating: "pending",
        ready: "pending",
      },
      startedAt: 1,
    },
  };
}

function reset(tabs: Tab[], activeTabIndex = 0) {
  useFileStore.setState({
    vaultPath: "/vault",
    fileTree: [],
    tabs,
    activeTabIndex,
    currentFile: tabs[activeTabIndex]?.path ?? null,
    currentContent: tabs[activeTabIndex]?.content ?? "",
    isDirty: tabs[activeTabIndex]?.isDirty ?? false,
    undoStack: tabs[activeTabIndex]?.undoStack ?? [],
    redoStack: tabs[activeTabIndex]?.redoStack ?? [],
    lastSavedContent: tabs[activeTabIndex]?.lastSavedContent ?? "",
    navigationHistory: [],
    navigationIndex: -1,
    recentFiles: [],
    isLoadingTree: false,
    isLoadingFile: false,
    isSaving: false,
  });
}

describe("useFileStore inline AI tab lifecycle", () => {
  beforeEach(() => {
    for (const id of Object.keys(useSlashAIInlineStore.getState().tasks)) {
      removeSlashAIInlineTask(id);
    }
    vi.clearAllMocks();
  });

  it("keeps inline AI running when switching tabs", () => {
    reset([
      fileTab("tab-a", "/vault/A.md"),
      fileTab("tab-b", "/vault/B.md"),
    ]);
    const controller = new AbortController();
    const abortSpy = vi.spyOn(controller, "abort");
    startSlashAIInlineTask(inlineTask("task-a", "tab-a"), controller);

    useFileStore.getState().switchTab(1);

    expect(abortSpy).not.toHaveBeenCalled();
    expect(getSlashAIInlineTaskForTab("tab-a")?.id).toBe("task-a");
  });

  it("aborts inline AI when its tab is closed", async () => {
    reset([
      fileTab("tab-a", "/vault/A.md"),
      fileTab("tab-b", "/vault/B.md"),
    ]);
    const controller = new AbortController();
    const abortSpy = vi.spyOn(controller, "abort");
    startSlashAIInlineTask(inlineTask("task-a", "tab-a"), controller);

    await useFileStore.getState().closeTab(0);

    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(getSlashAIInlineTaskForTab("tab-a")).toBeNull();
  });
});
