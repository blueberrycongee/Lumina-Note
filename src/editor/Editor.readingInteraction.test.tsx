import type { ForwardedRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

import { Editor } from "./Editor";
import { useFileStore } from "@/stores/useFileStore";
import { useUIStore } from "@/stores/useUIStore";

vi.mock("./CodeMirrorEditor", async () => {
  const ReactModule = await import("react");

  return {
    CodeMirrorEditor: ReactModule.forwardRef(
      function MockCodeMirrorEditor(
        { content }: { content: string },
        ref: ForwardedRef<{
          getScrollLine: () => number;
          scrollToLine: (line: number) => void;
          syncSelectionToViewport: () => void;
          getScrollDOM: () => HTMLElement | null;
        }>,
      ) {
        const scrollRef = ReactModule.useRef<HTMLDivElement>(null);
        ReactModule.useImperativeHandle(ref, () => ({
          getScrollLine: () => 1,
          scrollToLine: () => undefined,
          syncSelectionToViewport: () => undefined,
          getScrollDOM: () => scrollRef.current,
        }));

        return (
          <div ref={scrollRef} className="cm-scroller" data-testid="cm-scroll">
            <div className="cm-editor">{content}</div>
          </div>
        );
      },
    ),
  };
});

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
  TabBar: ({ toolbar }: { toolbar?: React.ReactNode } = {}) =>
    toolbar ? <div data-testid="mock-tabbar-toolbar">{toolbar}</div> : null,
}));

vi.mock("@/services/pdf/exportPdf", () => ({
  exportToPdf: vi.fn(),
  getExportFileName: vi.fn(() => "export.pdf"),
}));

function seedReadingEditorState(content = "Alpha Beta Gamma") {
  useUIStore.setState({
    editorMode: "reading",
    leftSidebarOpen: true,
    rightSidebarOpen: true,
    splitView: false,
    splitDirection: "horizontal",
    mainView: "editor",
  });

  useFileStore.setState({
    tabs: [
      {
        id: "tab-1",
        type: "file",
        path: "/file1.md",
        name: "file1",
        content,
        isDirty: false,
        lastSavedContent: content,
        undoStack: [],
        redoStack: [],
      },
    ],
    activeTabIndex: 0,
    currentFile: "/file1.md",
    currentContent: content,
    isDirty: false,
    isSaving: false,
    isLoadingFile: false,
    undoStack: [],
    redoStack: [],
    lastSavedContent: content,
  });
}

describe("Editor reading interaction", () => {
  beforeEach(() => {
    seedReadingEditorState();
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps reading mode when clicking reading content", () => {
    const { container } = render(<Editor />);
    const readingContent = container.querySelector(".cm-editor");
    expect(readingContent).toBeInstanceOf(HTMLElement);

    fireEvent.click(readingContent as HTMLElement);

    expect(useUIStore.getState().editorMode).toBe("reading");
  });
});
