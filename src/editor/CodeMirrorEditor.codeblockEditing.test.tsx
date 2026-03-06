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
  return { container, view, onChange };
}

function getStableCodeBlockShell(container: HTMLElement) {
  return container.querySelector('.cm-lumina-codeblock-shell');
}

describe("CodeMirror live code block editing", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders code block with interactive UI in live mode", () => {
    const content = "Before\n\n```js\nconst token = 1;\n```\nAfter";
    const { container } = setupEditor(content);

    // Different codemirror-live-markdown variants render different DOM structures.
    const inlineUi = container.querySelector(".cm-codeblock-header");
    const widgetUi = container.querySelector(".cm-codeblock-widget");
    const sourceLines = container.querySelectorAll(".cm-codeblock-source");
    const inlineContentLines = container.querySelectorAll(".cm-codeblock-content");
    const widgetContentLines = container.querySelectorAll(".cm-codeblock-line");
    expect(Boolean(inlineUi || widgetUi) || sourceLines.length > 0).toBe(true);
    expect(
      sourceLines.length + inlineContentLines.length + widgetContentLines.length
    ).toBeGreaterThan(0);
  });

  it("allows native cursor placement inside code content", () => {
    const content = "Before\n\n```js\nconst token = 1;\n```\nAfter";
    const { view } = setupEditor(content);
    const codeStart = content.indexOf("const token = 1;");

    // Place cursor inside the code content
    act(() => {
      view.dispatch({ selection: { anchor: codeStart + 6 } });
    });

    const pos = view.state.selection.main.from;
    expect(pos).toBe(codeStart + 6);
  });

  it("allows native text editing inside code content", () => {
    const content = "Before\n\n```js\nconst x = 1;\n```\nAfter";
    const { view } = setupEditor(content);
    const insertPos = content.indexOf("const x = 1;") + "const x".length;

    act(() => {
      view.dispatch({
        changes: { from: insertPos, to: insertPos, insert: "y" },
        selection: { anchor: insertPos + 1 },
      });
    });

    expect(view.state.doc.toString()).toContain("const xy = 1;");
  });

  it('keeps the same outer shell when caret enters code content', () => {
    const content = "Before\n\n```js\nconst token = 1;\n```\nAfter";
    const { container, view } = setupEditor(content);
    const codeStart = content.indexOf('const token = 1;');

    expect(getStableCodeBlockShell(container)).not.toBeNull();

    act(() => {
      view.dispatch({ selection: { anchor: codeStart + 3 } });
    });

    expect(getStableCodeBlockShell(container)).not.toBeNull();
  });
});
