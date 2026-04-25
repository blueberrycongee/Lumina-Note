import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { EditorView } from "@codemirror/view";

import { CodeMirrorEditor } from "./CodeMirrorEditor";
import { setHoveredBlock } from "./extensions/blockEditor";
import { useUIStore } from "@/stores/useUIStore";

function setupEditor(content: string) {
  const onChange = vi.fn();
  const rendered = render(
    <CodeMirrorEditor content={content} onChange={onChange} viewMode="live" />,
  );
  const editor = rendered.container.querySelector(".cm-editor");
  if (!editor) throw new Error("CodeMirror editor root not found");
  const view = EditorView.findFromDOM(editor as HTMLElement);
  if (!view) throw new Error("EditorView instance not found");
  return { ...rendered, view, onChange };
}

function hoverBlock(view: EditorView, content: string) {
  vi.spyOn(view, "coordsAtPos").mockReturnValue({
    left: 180,
    right: 320,
    top: 48,
    bottom: 76,
  } as any);
  act(() => {
    view.dispatch({
      effects: setHoveredBlock.of({
        from: 0,
        to: content.length,
        type: "Paragraph",
        startLine: 1,
        endLine: 1,
      }),
    });
  });
}

describe("CodeMirrorEditor block editor toggle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
    useUIStore.setState({ blockEditorEnabled: false });
  });

  it("does not render block decorations when blockEditorEnabled is false", () => {
    useUIStore.setState({ blockEditorEnabled: false });
    const content = "Plain paragraph";
    const { container, view } = setupEditor(content);

    hoverBlock(view, content);

    expect(container.querySelector(".cm-block-handle")).toBeNull();
    expect(container.querySelector(".cm-block-line")).toBeNull();
  });

  it("renders block handle when blockEditorEnabled is true", () => {
    useUIStore.setState({ blockEditorEnabled: true });
    const content = "Plain paragraph";
    const { container, view } = setupEditor(content);

    hoverBlock(view, content);

    expect(container.querySelector(".cm-block-handle")).not.toBeNull();
  });
});
