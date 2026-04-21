import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { EditorView } from "@codemirror/view";

import { CodeMirrorEditor } from "./CodeMirrorEditor";

function setupEditor(
  content: string,
  options?: {
    filePath?: string | null;
    onChange?: (
      nextContent: string,
      selection?: { anchor: number; head: number },
    ) => void;
  },
) {
  const onChange = options?.onChange ?? vi.fn();
  const rendered = render(
    <CodeMirrorEditor
      content={content}
      onChange={onChange}
      viewMode="live"
      filePath={options?.filePath ?? null}
    />,
  );
  const editor = rendered.container.querySelector(".cm-editor");
  if (!(editor instanceof HTMLElement)) {
    throw new Error("CodeMirror editor root not found");
  }
  const view = EditorView.findFromDOM(editor);
  if (!view) {
    throw new Error("EditorView instance not found");
  }
  return { ...rendered, view, onChange };
}

describe("CodeMirror undo integration", () => {
  afterEach(() => {
    cleanup();
  });

  it("reports the pre-edit selection with content changes", () => {
    const onChange = vi.fn();
    const { view } = setupEditor("hello", {
      filePath: "/file1.md",
      onChange,
    });

    act(() => {
      view.dispatch({ selection: { anchor: 2 } });
    });

    onChange.mockClear();

    act(() => {
      view.dispatch({
        changes: { from: 2, to: 2, insert: "X" },
        selection: { anchor: 3 },
      });
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("heXllo", {
      anchor: 2,
      head: 2,
    });
  });

  it("restores selection only for the matching file", () => {
    const { view } = setupEditor("hello", {
      filePath: "/file1.md",
    });

    act(() => {
      view.dispatch({ selection: { anchor: 0 } });
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent("lumina-restore-selection", {
          detail: {
            filePath: "/other.md",
            selection: { anchor: 4, head: 4 },
          },
        }),
      );
    });

    expect(view.state.selection.main.anchor).toBe(0);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("lumina-restore-selection", {
          detail: {
            filePath: "/file1.md",
            selection: { anchor: 4, head: 4 },
          },
        }),
      );
    });

    expect(view.state.selection.main.anchor).toBe(4);
    expect(view.state.selection.main.head).toBe(4);
  });
});
