import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { EditorView } from "@codemirror/view";

import { CodeMirrorEditor } from "./CodeMirrorEditor";
import { setHoveredBlock } from "./extensions/blockEditor";

function setupEditor(content: string) {
  const onChange = vi.fn();
  const rendered = render(
    <CodeMirrorEditor content={content} onChange={onChange} viewMode="live" />,
  );
  const editor = rendered.container.querySelector(".cm-editor");
  if (!editor) {
    throw new Error("CodeMirror editor root not found");
  }
  const view = EditorView.findFromDOM(editor as HTMLElement);
  if (!view) {
    throw new Error("EditorView instance not found");
  }
  return { ...rendered, view, onChange };
}

function hoverFirstParagraph(view: EditorView, content: string) {
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

describe("CodeMirror block toolbar", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("shows the block handle when a block is hovered", () => {
    const content = "Plain paragraph";
    const { container, view } = setupEditor(content);

    hoverFirstParagraph(view, content);

    const handle = container.querySelector(".cm-block-handle");
    expect(handle).not.toBeNull();
  });

  it("emits lumina-block-menu with combined mode on handle click", () => {
    const content = "const answer = 42;";
    const { container, view } = setupEditor(content);

    hoverFirstParagraph(view, content);

    const handler = vi.fn();
    window.addEventListener("lumina-block-menu", handler as EventListener);

    const handle = container.querySelector(".cm-block-handle") as HTMLElement;
    expect(handle).not.toBeNull();

    act(() => {
      fireEvent.mouseDown(handle);
      fireEvent.mouseUp(document);
    });

    expect(handler).toHaveBeenCalled();
    const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.mode).toBe("combined");

    window.removeEventListener("lumina-block-menu", handler as EventListener);
  });

  it("renders BlockMenu when lumina-block-menu event fires", () => {
    const content = "test";
    const { view } = setupEditor(content);

    vi.spyOn(view, "coordsAtPos").mockReturnValue({
      left: 180,
      right: 320,
      top: 48,
      bottom: 76,
    } as any);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("lumina-block-menu", {
          detail: {
            from: 0,
            to: content.length,
            clientX: 100,
            clientY: 100,
            mode: "combined",
          },
        }),
      );
    });

    const menu = document.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
  });

  it("renders insert-mode BlockMenu for empty blocks", () => {
    const content = "test";
    const { view } = setupEditor(content);

    vi.spyOn(view, "coordsAtPos").mockReturnValue({
      left: 180,
      right: 320,
      top: 48,
      bottom: 76,
    } as any);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("lumina-block-menu", {
          detail: {
            from: 0,
            to: 0,
            clientX: 100,
            clientY: 100,
            mode: "insert",
          },
        }),
      );
    });

    const menu = document.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(menu?.textContent).not.toContain("Delete");
  });
});
