import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFileStore } from "@/stores/useFileStore";
import { useTypesettingDocStore } from "@/stores/useTypesettingDocStore";

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
    navigationHistory: [],
    navigationIndex: -1,
  });
};

describe("useFileStore docx tabs", () => {
  beforeEach(() => {
    useFileStore.persist?.clearStorage?.();
    resetFileStore();
    useTypesettingDocStore.setState({
      openDoc: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("opens docx files as typesetting-doc tabs", async () => {
    const docPath = "C:/vault/report.docx";
    await useFileStore.getState().openFile(docPath);

    const { tabs, activeTabIndex, currentFile } = useFileStore.getState();
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.type).toBe("typesetting-doc");
    expect(tabs[0]?.path).toBe(docPath);
    expect(activeTabIndex).toBe(0);
    expect(currentFile).toBe(docPath);

    const openDoc = useTypesettingDocStore.getState().openDoc as unknown as ReturnType<typeof vi.fn>;
    expect(openDoc).toHaveBeenCalledWith(docPath);
  });
});
