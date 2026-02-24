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

describe("useFileStore profile preview tab", () => {
  beforeEach(() => {
    useFileStore.persist?.clearStorage?.();
    resetFileStore();
  });

  it("opens a new profile preview tab", () => {
    useFileStore.getState().openProfilePreviewTab();

    const { tabs, activeTabIndex, currentFile, currentContent, isDirty } = useFileStore.getState();

    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.type).toBe("profile-preview");
    expect(tabs[0]?.name).toBe("Profile Preview");
    expect(activeTabIndex).toBe(0);
    expect(currentFile).toBeNull();
    expect(currentContent).toBe("");
    expect(isDirty).toBe(false);
  });

  it("reuses an existing profile preview tab", () => {
    const store = useFileStore.getState();
    store.openProfilePreviewTab();
    store.openProfilePreviewTab();

    const { tabs, activeTabIndex } = useFileStore.getState();
    expect(tabs).toHaveLength(1);
    expect(activeTabIndex).toBe(0);
  });
});
