import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TypesettingDocumentPane } from "@/components/typesetting/TypesettingDocumentPane";
import * as tauri from "@/lib/tauri";
import {
  TypesettingDoc,
  useTypesettingDocStore,
} from "@/stores/useTypesettingDocStore";
import { useUIStore } from "@/stores/useUIStore";
import { DocxBlock } from "@/typesetting/docxImport";

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const buildDoc = (path: string, overrides: Partial<TypesettingDoc> = {}): TypesettingDoc => ({
  path,
  blocks: [{ type: "paragraph", runs: [{ text: "" }] } as DocxBlock],
  headerBlocks: [],
  footerBlocks: [],
  relationships: {},
  media: {},
  isDirty: false,
  styleRefs: {},
  ...overrides,
});

describe("TypesettingDocumentPane", () => {
  beforeEach(() => {
    useTypesettingDocStore.setState({ docs: {} });
  });

  it("stores layout cache after a layout run", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-20T12:00:00Z"));

    const path = "C:/vault/report.docx";
    useTypesettingDocStore.setState({
      docs: {
        [path]: buildDoc(path, {
          blocks: [{ type: "paragraph", runs: [{ text: "Hello world" }] } as DocxBlock],
        }),
      },
    });

    render(<TypesettingDocumentPane path={path} />);

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const doc = useTypesettingDocStore.getState().docs[path];
    expect(doc?.layoutCache?.lineCount).toBe(2);
    expect(doc?.layoutCache?.updatedAt).toBe(new Date().toISOString());

    vi.useRealTimers();
  });

  it("ignores stale layout runs after newer edits", async () => {
    vi.useFakeTimers();

    const path = "C:/vault/report.docx";
    useTypesettingDocStore.setState({
      docs: {
        [path]: buildDoc(path, {
          blocks: [{ type: "paragraph", runs: [{ text: "First draft" }] } as DocxBlock],
        }),
      },
    });

    const first = createDeferred<tauri.TypesettingTextLayout>();
    const second = createDeferred<tauri.TypesettingTextLayout>();
    const layoutSpy = vi
      .spyOn(tauri, "getTypesettingLayoutText")
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    render(<TypesettingDocumentPane path={path} />);

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      useTypesettingDocStore
        .getState()
        .updateDocBlocks(path, [
          { type: "paragraph", runs: [{ text: "Second draft update" }] } as DocxBlock,
        ]);
    });

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      second.resolve({
        lines: [
          { start: 0, end: 5, width: 200, x_offset: 0, y_offset: 0 },
          { start: 6, end: 10, width: 180, x_offset: 0, y_offset: 20 },
          { start: 11, end: 16, width: 160, x_offset: 0, y_offset: 40 },
        ],
      });
    });

    expect(useTypesettingDocStore.getState().docs[path]?.layoutCache?.lineCount)
      .toBe(3);

    await act(async () => {
      first.resolve({
        lines: [{ start: 0, end: 3, width: 120, x_offset: 0, y_offset: 0 }],
      });
    });

    expect(useTypesettingDocStore.getState().docs[path]?.layoutCache?.lineCount)
      .toBe(3);

    layoutSpy.mockRestore();
    vi.useRealTimers();
  });

  it("shows page navigation controls with a single-page default", async () => {
    const path = "C:/vault/report.docx";
    useTypesettingDocStore.setState({
      docs: {
        [path]: buildDoc(path),
      },
    });

    render(<TypesettingDocumentPane path={path} />);

    const prevButton = await screen.findByLabelText("Previous page");
    const nextButton = screen.getByLabelText("Next page");

    expect(screen.getByText("Page 1 / 1")).toBeInTheDocument();
    expect(prevButton).toBeDisabled();
    expect(nextButton).toBeDisabled();
  });

  it("triggers list formatting commands from the toolbar", async () => {
    const path = "C:/vault/report.docx";
    useTypesettingDocStore.setState({
      docs: {
        [path]: buildDoc(path),
      },
    });

    const previousMode = useUIStore.getState().chatMode;
    useUIStore.setState({ chatMode: "codex" });

    const originalExecCommand = document.execCommand;
    const execSpy = vi.fn();
    document.execCommand = execSpy;

    render(<TypesettingDocumentPane path={path} />);

    const bulleted = await screen.findByLabelText("Bulleted list");
    const numbered = screen.getByLabelText("Numbered list");

    fireEvent.click(bulleted);
    fireEvent.click(numbered);

    expect(execSpy).toHaveBeenCalledWith("insertUnorderedList");
    expect(execSpy).toHaveBeenCalledWith("insertOrderedList");

    document.execCommand = originalExecCommand;
    useUIStore.setState({ chatMode: previousMode });
  });
});
