import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { CodeMirrorEditor } from "./CodeMirrorEditor";

function setupEditor(content: string, viewMode: "live" | "reading" = "live") {
  const onChange = vi.fn();
  const { container, rerender } = render(
    <CodeMirrorEditor content={content} onChange={onChange} viewMode={viewMode} />
  );
  const editor = container.querySelector(".cm-editor");
  if (!editor) {
    throw new Error("CodeMirror editor root not found");
  }
  const view = EditorView.findFromDOM(editor as HTMLElement);
  if (!view) {
    throw new Error("EditorView instance not found");
  }
  return { container, view, onChange, rerender };
}

function getStableCodeBlockShell(container: HTMLElement) {
  return container.querySelector(".cm-lumina-codeblock-open");
}

describe("CodeMirror live code block editing", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders code block with interactive UI in live mode", () => {
    const content = "Before\n\n```js\nconst token = 1;\n```\nAfter";
    const { container } = setupEditor(content);

    const liveShell = container.querySelector(".cm-lumina-codeblock-open");
    const liveContentLines = container.querySelectorAll(".cm-lumina-codeblock-content-line");
    const liveFooter = container.querySelector(".cm-lumina-codeblock-close");
    const widgetUi = container.querySelector(".cm-codeblock-widget");
    const sourceLines = container.querySelectorAll(".cm-codeblock-source");
    expect(liveShell).not.toBeNull();
    expect(liveFooter).not.toBeNull();
    expect(liveContentLines.length).toBeGreaterThan(0);
    expect(widgetUi).toBeNull();
    expect(sourceLines.length).toBe(0);
    expect(container.querySelector(".hljs-keyword, .hljs-number")).not.toBeNull();
    expect(container.querySelector(".cm-codeblock-copy")).not.toBeNull();
  });

  it("copies code content from the live-mode copy button", async () => {
    const content = "Before\n\n```js\nconst token = 1;\n```\nAfter";
    const { container } = setupEditor(content);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const button = container.querySelector(".cm-codeblock-copy");
    expect(button).not.toBeNull();

    await act(async () => {
      fireEvent.click(button as HTMLElement);
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith("const token = 1;");
    expect((button as HTMLButtonElement).textContent).toBe("Copied!");
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
    expect(container.querySelectorAll(".cm-codeblock-source")).toHaveLength(0);
  });

  it("restores the same live shell after a reading/live mode roundtrip", () => {
    const content = "Before\n\n```js\nconst token = 1;\n```\nAfter";
    const { container, rerender } = setupEditor(content);

    rerender(<CodeMirrorEditor content={content} onChange={vi.fn()} viewMode="reading" />);
    expect(container.querySelector(".cm-codeblock-widget")).toBeNull();
    expect(getStableCodeBlockShell(container)).not.toBeNull();

    rerender(<CodeMirrorEditor content={content} onChange={vi.fn()} viewMode="live" />);
    expect(getStableCodeBlockShell(container)).not.toBeNull();
    expect(container.querySelector(".cm-codeblock-widget")).toBeNull();
    expect(container.querySelectorAll(".cm-codeblock-source")).toHaveLength(0);
  });

  it("keeps code block text-backed in reading mode", () => {
    const content = "Before\n\n```js\nconst token = 1;\n```\nAfter";
    const { container } = setupEditor(content, "reading");

    expect(container.querySelector(".cm-codeblock-widget")).toBeNull();
    expect(getStableCodeBlockShell(container)).not.toBeNull();
    expect(container.querySelectorAll(".cm-lumina-codeblock-content-line").length).toBeGreaterThan(0);
    expect(container.querySelector(".cm-codeblock-copy")).not.toBeNull();
  });

  it("keeps the blank line between adjacent code blocks as a normal editor line", () => {
    const content = "```js\nconst a = 1;\n```\n\n```js\nconst b = 2;\n```";
    const { container } = setupEditor(content);
    const blankLine = Array.from(container.querySelectorAll(".cm-line")).find(
      (line) => (line.textContent ?? "") === "",
    );

    expect(blankLine).toBeDefined();
    expect(blankLine?.className.includes("cm-lumina-codeblock")).toBe(false);
  });
});
