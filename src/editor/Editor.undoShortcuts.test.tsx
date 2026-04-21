import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, createEvent, fireEvent, render } from "@testing-library/react";

import { Editor } from "./Editor";
import { useFileStore } from "@/stores/useFileStore";
import { useUIStore } from "@/stores/useUIStore";

vi.mock("./CodeMirrorEditor", () => ({
  CodeMirrorEditor: React.forwardRef<HTMLDivElement, { content: string }>(
    ({ content }, ref) => (
      <div ref={ref} className="cm-editor" tabIndex={0}>
        {content}
      </div>
    ),
  ),
}));

vi.mock("@/components/toolbar/SelectionToolbar", () => ({
  SelectionToolbar: () => null,
}));

vi.mock("@/components/toolbar/SelectionContextMenu", () => ({
  SelectionContextMenu: () => null,
}));

vi.mock("@/components/layout/MainAIChatShell", () => ({
  MainAIChatShell: () => null,
}));

vi.mock("@/components/effects/LocalGraph", () => ({
  LocalGraph: () => null,
}));

vi.mock("@/components/layout/TabBar", () => ({
  TabBar: () => null,
}));

vi.mock("@/services/pdf/exportPdf", () => ({
  exportToPdf: vi.fn(),
  getExportFileName: vi.fn(() => "export.pdf"),
}));

describe("Editor undo shortcuts", () => {
  beforeEach(() => {
    useUIStore.setState({
      editorMode: "live",
      leftSidebarOpen: true,
      rightSidebarOpen: true,
      splitView: false,
      splitDirection: "horizontal",
      mainView: "editor",
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("routes Ctrl/Cmd+Z through the store even when the live editor has focus", () => {
    useFileStore.setState({
      tabs: [
        {
          id: "tab-1",
          type: "file",
          path: "/file1.md",
          name: "file1",
          content: "edited",
          isDirty: true,
          lastSavedContent: "saved",
          undoStack: [{ content: "saved", type: "user", timestamp: 1 }],
          redoStack: [],
        },
      ],
      activeTabIndex: 0,
      currentFile: "/file1.md",
      currentContent: "edited",
      isDirty: true,
      isSaving: false,
      isLoadingFile: false,
      undoStack: [{ content: "saved", type: "user", timestamp: 1 }],
      redoStack: [],
      lastSavedContent: "saved",
    });

    const { container } = render(<Editor />);
    const editor = container.querySelector(".cm-editor");
    if (!(editor instanceof HTMLElement)) {
      throw new Error("mocked editor not found");
    }

    editor.focus();
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });

    expect(useFileStore.getState().currentContent).toBe("saved");
    expect(useFileStore.getState().redoStack).toHaveLength(1);
  });

  it("routes Ctrl/Cmd+Shift+Z to redo instead of undo", () => {
    useFileStore.setState({
      tabs: [
        {
          id: "tab-1",
          type: "file",
          path: "/file1.md",
          name: "file1",
          content: "saved",
          isDirty: false,
          lastSavedContent: "saved",
          undoStack: [],
          redoStack: [{ content: "edited", type: "user", timestamp: 1 }],
        },
      ],
      activeTabIndex: 0,
      currentFile: "/file1.md",
      currentContent: "saved",
      isDirty: false,
      isSaving: false,
      isLoadingFile: false,
      undoStack: [],
      redoStack: [{ content: "edited", type: "user", timestamp: 1 }],
      lastSavedContent: "saved",
    });

    const { container } = render(<Editor />);
    const editor = container.querySelector(".cm-editor");
    if (!(editor instanceof HTMLElement)) {
      throw new Error("mocked editor not found");
    }

    editor.focus();
    fireEvent.keyDown(window, { key: "Z", ctrlKey: true, shiftKey: true });

    expect(useFileStore.getState().currentContent).toBe("edited");
    expect(useFileStore.getState().undoStack).toHaveLength(1);
  });

  it("prevents native undo even when the current file has no store undo history", () => {
    useFileStore.setState({
      tabs: [
        {
          id: "tab-1",
          type: "file",
          path: "/file1.md",
          name: "file1",
          content: "A content",
          isDirty: false,
          lastSavedContent: "A content",
          undoStack: [],
          redoStack: [],
        },
      ],
      activeTabIndex: 0,
      currentFile: "/file1.md",
      currentContent: "A content",
      isDirty: false,
      isSaving: false,
      isLoadingFile: false,
      undoStack: [],
      redoStack: [],
      lastSavedContent: "A content",
    });

    const { container } = render(<Editor />);
    const editor = container.querySelector(".cm-editor");
    if (!(editor instanceof HTMLElement)) {
      throw new Error("mocked editor not found");
    }

    editor.focus();
    const event = createEvent.keyDown(window, {
      key: "z",
      ctrlKey: true,
      cancelable: true,
    });
    fireEvent(window, event);

    expect(event.defaultPrevented).toBe(true);
    expect(useFileStore.getState().currentContent).toBe("A content");
    expect(useFileStore.getState().undoStack).toHaveLength(0);
  });

  it("prevents native beforeinput historyUndo fallback inside the editor", () => {
    useFileStore.setState({
      tabs: [
        {
          id: "tab-1",
          type: "file",
          path: "/file1.md",
          name: "file1",
          content: "A content",
          isDirty: false,
          lastSavedContent: "A content",
          undoStack: [],
          redoStack: [],
        },
      ],
      activeTabIndex: 0,
      currentFile: "/file1.md",
      currentContent: "A content",
      isDirty: false,
      isSaving: false,
      isLoadingFile: false,
      undoStack: [],
      redoStack: [],
      lastSavedContent: "A content",
    });

    const { container } = render(<Editor />);
    const editor = container.querySelector(".cm-editor");
    if (!(editor instanceof HTMLElement)) {
      throw new Error("mocked editor not found");
    }

    editor.focus();
    const event = new Event("beforeinput", {
      bubbles: true,
      cancelable: true,
    }) as InputEvent;
    Object.defineProperty(event, "inputType", {
      value: "historyUndo",
      configurable: true,
    });
    fireEvent(editor, event);

    expect(event.defaultPrevented).toBe(true);
    expect(useFileStore.getState().currentContent).toBe("A content");
    expect(useFileStore.getState().undoStack).toHaveLength(0);
  });

  it("routes beforeinput historyUndo to store undo for the active file", () => {
    useFileStore.setState({
      tabs: [
        {
          id: "tab-1",
          type: "file",
          path: "/file1.md",
          name: "file1",
          content: "edited",
          isDirty: true,
          lastSavedContent: "saved",
          undoStack: [{ content: "saved", type: "user", timestamp: 1 }],
          redoStack: [],
        },
      ],
      activeTabIndex: 0,
      currentFile: "/file1.md",
      currentContent: "edited",
      isDirty: true,
      isSaving: false,
      isLoadingFile: false,
      undoStack: [{ content: "saved", type: "user", timestamp: 1 }],
      redoStack: [],
      lastSavedContent: "saved",
    });

    const { container } = render(<Editor />);
    const editor = container.querySelector(".cm-editor");
    if (!(editor instanceof HTMLElement)) {
      throw new Error("mocked editor not found");
    }

    editor.focus();
    const event = new Event("beforeinput", {
      bubbles: true,
      cancelable: true,
    }) as InputEvent;
    Object.defineProperty(event, "inputType", {
      value: "historyUndo",
      configurable: true,
    });
    fireEvent(editor, event);

    expect(event.defaultPrevented).toBe(true);
    expect(useFileStore.getState().currentContent).toBe("saved");
    expect(useFileStore.getState().redoStack).toHaveLength(1);
  });
});
