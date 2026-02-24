import { beforeEach, describe, expect, it } from "vitest";
import { useFileStore } from "@/stores/useFileStore";

const resetFileStore = () => {
  useFileStore.setState({
    tabs: [],
    activeTabIndex: -1,
    currentFile: null,
    currentContent: "",
    isDirty: false,
    undoStack: [],
    redoStack: [],
    lastSavedContent: "",
  });
};

describe("useFileStore typesetting preview tab", () => {
  beforeEach(() => {
    useFileStore.persist?.clearStorage?.();
    resetFileStore();
  });

  it("opens a new typesetting preview tab", () => {
    useFileStore.getState().openTypesettingPreviewTab();

    const { tabs, activeTabIndex, currentFile, currentContent, isDirty } = useFileStore.getState();

    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.type).toBe("typesetting-preview");
    expect(tabs[0]?.name).toBe("Typesetting Preview");
    expect(activeTabIndex).toBe(0);
    expect(currentFile).toBeNull();
    expect(currentContent).toBe("");
    expect(isDirty).toBe(false);
  });

  it("preserves the active tab state before opening the preview", () => {
    useFileStore.setState({
      tabs: [
        {
          id: "file-1",
          type: "file",
          path: "/tmp/note.md",
          name: "note",
          content: "old",
          isDirty: false,
          undoStack: [],
          redoStack: [],
        },
      ],
      activeTabIndex: 0,
      currentFile: "/tmp/note.md",
      currentContent: "new content",
      isDirty: true,
      undoStack: [{ content: "old", type: "user", timestamp: 1 }],
      redoStack: [],
    });

    useFileStore.getState().openTypesettingPreviewTab();

    const { tabs } = useFileStore.getState();
    expect(tabs[0]?.content).toBe("new content");
    expect(tabs[0]?.isDirty).toBe(true);
    expect(tabs[0]?.undoStack.length).toBe(1);
  });

  it("reuses an existing typesetting preview tab", () => {
    const store = useFileStore.getState();
    store.openTypesettingPreviewTab();
    store.openTypesettingPreviewTab();

    const { tabs, activeTabIndex } = useFileStore.getState();
    expect(tabs).toHaveLength(1);
    expect(activeTabIndex).toBe(0);
  });
});
