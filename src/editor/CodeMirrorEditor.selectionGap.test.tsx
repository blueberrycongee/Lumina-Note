import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { CodeMirrorEditor } from "./CodeMirrorEditor";

function setupEditor(content: string) {
  const onChange = vi.fn();
  const { container } = render(
    <CodeMirrorEditor content={content} onChange={onChange} viewMode="live" />
  );
  const editor = container.querySelector(".cm-editor");
  if (!editor) {
    throw new Error("CodeMirror editor root not found");
  }
  const view = EditorView.findFromDOM(editor as HTMLElement);
  if (!view) {
    throw new Error("EditorView instance not found");
  }
  return { container, view };
}

describe("CodeMirror live selection gap bridge", () => {
  afterEach(() => {
    cleanup();
  });

  it("adds selection gap highlight for header spacing", () => {
    const { container, view } = setupEditor("## Heading");
    act(() => {
      view.dispatch({ selection: { anchor: 3, head: 10 } });
    });
    const gap = container.querySelector(".cm-selection-gap");
    expect(gap).not.toBeNull();
    expect(gap?.textContent).toBe(" ");
  });

  it("adds selection bridge for inline formatting marks", () => {
    const { container, view } = setupEditor("**bold**");
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 8 } });
    });
    const markers = Array.from(container.querySelectorAll(".cm-selection-bridge"))
      .filter((el) => el.textContent === "**");
    expect(markers.length).toBeGreaterThanOrEqual(2);
  });

  it("does not add selection gap when selection is empty", () => {
    const { container, view } = setupEditor("## Heading\n\n**bold**");
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 0 } });
    });
    expect(container.querySelector(".cm-selection-gap")).toBeNull();
    expect(container.querySelector(".cm-selection-bridge")).toBeNull();
  });
});
