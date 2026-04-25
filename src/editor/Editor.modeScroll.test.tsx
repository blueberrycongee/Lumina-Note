import type { ForwardedRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

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
          getScrollLine: () => {
            const scrollTop = scrollRef.current?.scrollTop ?? 0;
            return Math.floor(scrollTop / 28) + 1;
          },
          scrollToLine: (line: number) => {
            if (scrollRef.current) scrollRef.current.scrollTop = (line - 1) * 28;
          },
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

vi.mock("./ReadingView", () => ({
  ReadingView: ({ content }: { content: string }) => (
    <article data-testid="reading-view">{content}</article>
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
  TabBar: ({ toolbar }: { toolbar?: React.ReactNode } = {}) =>
    toolbar ? <div data-testid="mock-tabbar-toolbar">{toolbar}</div> : null,
}));

vi.mock("@/services/pdf/exportPdf", () => ({
  exportToPdf: vi.fn(),
  getExportFileName: vi.fn(() => "export.pdf"),
}));

function setScrollableMetrics(
  element: HTMLElement,
  metrics: { scrollHeight: number; clientHeight: number; scrollTop?: number },
) {
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    get: () => metrics.scrollHeight,
  });
  Object.defineProperty(element, "clientHeight", {
    configurable: true,
    get: () => metrics.clientHeight,
  });
  if (metrics.scrollTop !== undefined) {
    element.scrollTop = metrics.scrollTop;
  }
}

async function flushModeScrollRestore() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  });
}

function seedEditorState(content = "Line 1\nLine 2\nLine 3") {
  useUIStore.setState({
    editorMode: "live",
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

describe("Editor mode scroll preservation", () => {
  beforeEach(() => {
    seedEditorState();
  });

  afterEach(() => {
    cleanup();
  });

  it("restores the current scroll position when entering reading mode", async () => {
    const { container } = render(<Editor />);
    const editorScroll = screen.getByTestId("cm-scroll");
    setScrollableMetrics(editorScroll, {
      scrollHeight: 2000,
      clientHeight: 500,
      scrollTop: 600,
    });

    fireEvent.click(screen.getByTitle("实时"));

    const readingScroll = container.querySelector(
      '[data-editor-scroll-container="reading"]',
    );
    expect(readingScroll).toBeInstanceOf(HTMLElement);
    setScrollableMetrics(readingScroll as HTMLElement, {
      scrollHeight: 1800,
      clientHeight: 500,
    });

    await flushModeScrollRestore();

    expect((readingScroll as HTMLElement).scrollTop).toBeCloseTo(520, 0);
  });

  it("uses the reading scroll position when switching back to source mode", async () => {
    const { container } = render(<Editor />);
    const editorScroll = screen.getByTestId("cm-scroll");
    setScrollableMetrics(editorScroll, {
      scrollHeight: 2000,
      clientHeight: 500,
      scrollTop: 600,
    });

    fireEvent.click(screen.getByTitle("实时"));

    const readingScroll = container.querySelector(
      '[data-editor-scroll-container="reading"]',
    );
    expect(readingScroll).toBeInstanceOf(HTMLElement);
    setScrollableMetrics(readingScroll as HTMLElement, {
      scrollHeight: 1500,
      clientHeight: 500,
      scrollTop: 300,
    });

    fireEvent.click(screen.getByTitle("阅读"));
    await flushModeScrollRestore();

    expect(editorScroll.scrollTop).toBeCloseTo(450, 0);
  });
});
