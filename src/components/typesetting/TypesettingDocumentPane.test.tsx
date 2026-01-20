import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TypesettingDocumentPane } from "@/components/typesetting/TypesettingDocumentPane";
import * as tauri from "@/lib/tauri";
import {
  TypesettingDoc,
  useTypesettingDocStore,
} from "@/stores/useTypesettingDocStore";
import { useUIStore } from "@/stores/useUIStore";
import { DocxBlock } from "@/typesetting/docxImport";
import { DOCX_IMAGE_PLACEHOLDER } from "@/typesetting/docxText";

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
    expect(doc?.layoutCache?.contentHeightPx).toBe(40);
    expect(doc?.layoutCache?.updatedAt).toBe(new Date().toISOString());

    vi.useRealTimers();
  });

  it("uses layout content height for page count", async () => {
    vi.useFakeTimers();

    const path = "C:/vault/report.docx";
    useTypesettingDocStore.setState({
      docs: {
        [path]: buildDoc(path, {
          blocks: [{ type: "paragraph", runs: [{ text: "Hello world" }] } as DocxBlock],
        }),
      },
    });

    const layoutSpy = vi
      .spyOn(tauri, "getTypesettingLayoutText")
      .mockResolvedValue({
        lines: [
          {
            start: 0,
            end: 5,
            width: 200,
            x_offset: 0,
            y_offset: 0,
            start_byte: 0,
            end_byte: 5,
          },
          {
            start: 6,
            end: 12,
            width: 180,
            x_offset: 0,
            y_offset: 900,
            start_byte: 6,
            end_byte: 12,
          },
        ],
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

    expect(screen.getByText("Page 1 / 2")).toBeInTheDocument();

    layoutSpy.mockRestore();
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
          {
            start: 0,
            end: 5,
            width: 200,
            x_offset: 0,
            y_offset: 0,
            start_byte: 0,
            end_byte: 5,
          },
          {
            start: 6,
            end: 10,
            width: 180,
            x_offset: 0,
            y_offset: 20,
            start_byte: 6,
            end_byte: 10,
          },
          {
            start: 11,
            end: 16,
            width: 160,
            x_offset: 0,
            y_offset: 40,
            start_byte: 11,
            end_byte: 16,
          },
        ],
      });
    });

    expect(useTypesettingDocStore.getState().docs[path]?.layoutCache?.lineCount)
      .toBe(3);

    await act(async () => {
      first.resolve({
        lines: [
          {
            start: 0,
            end: 3,
            width: 120,
            x_offset: 0,
            y_offset: 0,
            start_byte: 0,
            end_byte: 3,
          },
        ],
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

  it("renders header and footer blocks in the preview boxes", async () => {
    vi.useFakeTimers();

    const path = "C:/vault/report.docx";
    useTypesettingDocStore.setState({
      docs: {
        [path]: buildDoc(path, {
          headerBlocks: [
            { type: "paragraph", runs: [{ text: "Header Text" }] } as DocxBlock,
          ],
          footerBlocks: [
            { type: "paragraph", runs: [{ text: "Footer Text" }] } as DocxBlock,
          ],
        }),
      },
    });

    const layoutSpy = vi
      .spyOn(tauri, "getTypesettingLayoutText")
      .mockResolvedValueOnce({
        lines: [
          {
            start: 0,
            end: 5,
            width: 200,
            x_offset: 0,
            y_offset: 0,
            start_byte: 0,
            end_byte: 5,
          },
        ],
      })
      .mockResolvedValueOnce({
        lines: [
          {
            start: 0,
            end: 11,
            width: 180,
            x_offset: 0,
            y_offset: 0,
            start_byte: 0,
            end_byte: 11,
          },
        ],
      })
      .mockResolvedValueOnce({
        lines: [
          {
            start: 0,
            end: 11,
            width: 160,
            x_offset: 0,
            y_offset: 0,
            start_byte: 0,
            end_byte: 11,
          },
        ],
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

    expect(screen.getByText("Header Text")).toBeInTheDocument();
    expect(screen.getByText("Footer Text")).toBeInTheDocument();
    expect(layoutSpy).toHaveBeenCalledWith(expect.objectContaining({ text: "Header Text" }));
    expect(layoutSpy).toHaveBeenCalledWith(expect.objectContaining({ text: "Footer Text" }));

    layoutSpy.mockRestore();
    vi.useRealTimers();
  });

  it("renders engine body text for simple blocks when not editing", async () => {
    vi.useFakeTimers();

    const path = "C:/vault/report.docx";
    useTypesettingDocStore.setState({
      docs: {
        [path]: buildDoc(path, {
          blocks: [
            { type: "paragraph", runs: [{ text: "Engine text" }] } as DocxBlock,
          ],
        }),
      },
    });

    const layoutSpy = vi
      .spyOn(tauri, "getTypesettingLayoutText")
      .mockResolvedValue({
        lines: [
          {
            start: 0,
            end: 11,
            width: 200,
            x_offset: 0,
            y_offset: 0,
            start_byte: 0,
            end_byte: 11,
          },
        ],
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

    const engineBody = screen.getByTestId("typesetting-body-engine");
    expect(engineBody).toHaveTextContent("Engine text");

    layoutSpy.mockRestore();
    vi.useRealTimers();
  });

  it("renders engine body images for image blocks", async () => {
    vi.useFakeTimers();

    const path = "C:/vault/report.docx";
    useTypesettingDocStore.setState({
      docs: {
        [path]: buildDoc(path, {
          blocks: [
            { type: "paragraph", runs: [{ text: "Intro" }] } as DocxBlock,
            {
              type: "image",
              embedId: "rId1",
              widthEmu: 914400,
              heightEmu: 457200,
            } as DocxBlock,
            { type: "paragraph", runs: [{ text: "Outro" }] } as DocxBlock,
          ],
          relationships: { rId1: "media/image1.png" },
          media: { "word/media/image1.png": new Uint8Array([1, 2, 3]) },
        }),
      },
    });

    const encoder = new TextEncoder();
    const beforeBytes = encoder.encode("Intro").length;
    const placeholderBytes = encoder.encode(DOCX_IMAGE_PLACEHOLDER).length;
    const afterBytes = encoder.encode("Outro").length;
    const line2Start = beforeBytes + 1;
    const line2End = line2Start + placeholderBytes;
    const line3Start = line2End + 1;
    const line3End = line3Start + afterBytes;

    const layoutSpy = vi
      .spyOn(tauri, "getTypesettingLayoutText")
      .mockResolvedValue({
        lines: [
          {
            start: 0,
            end: 5,
            width: 200,
            x_offset: 0,
            y_offset: 0,
            start_byte: 0,
            end_byte: beforeBytes,
          },
          {
            start: 6,
            end: 7,
            width: 120,
            x_offset: 0,
            y_offset: 20,
            start_byte: line2Start,
            end_byte: line2End,
          },
          {
            start: 8,
            end: 13,
            width: 200,
            x_offset: 0,
            y_offset: 40,
            start_byte: line3Start,
            end_byte: line3End,
          },
        ],
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

    expect(screen.getByTestId("typesetting-body-engine")).toBeInTheDocument();
    const image = screen.getByTestId("typesetting-body-image");
    expect(image).toHaveAttribute("data-embed-id", "rId1");
    expect(image.getAttribute("src")).toContain("data:image/png;base64,");

    layoutSpy.mockRestore();
    vi.useRealTimers();
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
