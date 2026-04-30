import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { CodeMirrorEditor } from "./CodeMirrorEditor";

function setupEditor(
  content: string,
  viewMode: "live" | "reading" | "source" = "live",
) {
  const onChange = vi.fn();
  const rendered = render(
    <CodeMirrorEditor
      content={content}
      onChange={onChange}
      viewMode={viewMode}
    />,
  );
  const editor = rendered.container.querySelector(".cm-editor");
  if (!editor) {
    throw new Error("CodeMirror editor root not found");
  }
  const view = EditorView.findFromDOM(editor as HTMLElement);
  if (!view) {
    throw new Error("EditorView instance not found");
  }
  return { ...rendered, view };
}

function editorText(container: HTMLElement) {
  return container.querySelector(".cm-content")?.textContent ?? "";
}

function findFormattingSpan(container: HTMLElement, text: string) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(".cm-formatting-inline"),
  ).find((el) => (el.textContent ?? "").includes(text));
}

describe("CodeMirror live markdown rendering polish", () => {
  afterEach(() => {
    cleanup();
  });

  it("hides link destination markers until the link source is active", () => {
    const content = 'Intro\n[Example](https://example.com "Title")';
    const { container, view } = setupEditor(content, "live");

    const inactiveUrl = findFormattingSpan(container, "https://example.com");
    expect(inactiveUrl).toBeDefined();
    expect(inactiveUrl?.classList.contains("cm-formatting-inline-visible")).toBe(
      false,
    );

    act(() => {
      view.dispatch({
        selection: { anchor: content.indexOf("https://example.com") + 3 },
      });
    });

    const activeUrl = findFormattingSpan(container, "https://example.com");
    expect(activeUrl?.classList.contains("cm-formatting-inline-visible")).toBe(
      true,
    );
  });

  it("renders inactive task list markers and restores raw markers on the active line", () => {
    const content = "Intro\n- [x] Done\n- [ ] Todo";
    const { container, view } = setupEditor(content, "live");

    expect(container.querySelectorAll(".cm-rendered-task-marker")).toHaveLength(
      2,
    );
    expect(editorText(container)).not.toContain("[x]");
    expect(editorText(container)).not.toContain("[ ]");

    act(() => {
      view.dispatch({ selection: { anchor: content.indexOf("[x]") + 1 } });
    });

    expect(container.querySelectorAll(".cm-rendered-task-marker")).toHaveLength(
      1,
    );
    expect(editorText(container)).toContain("- [x] Done");
  });

  it("keeps source mode as raw markdown for task lists", () => {
    const content = "- [x] Done";
    const { container } = setupEditor(content, "source");

    expect(container.querySelector(".cm-rendered-task-marker")).toBeNull();
    expect(editorText(container)).toContain("- [x] Done");
  });

  it("keeps source mode as raw markdown for callouts", () => {
    const content = "> [!NOTE]\n> Raw callout body";
    const { container } = setupEditor(content, "source");

    expect(container.querySelector(".callout")).toBeNull();
    expect(editorText(container)).toContain("> [!NOTE]");
    expect(editorText(container)).toContain("> Raw callout body");
  });

  it("renders blockquote lines while revealing quote markers on the active line", () => {
    const content = "Intro\n> Quoted text";
    const { container, view } = setupEditor(content, "live");

    expect(container.querySelector(".cm-blockquote-line")).not.toBeNull();
    expect(editorText(container)).not.toContain(">");

    act(() => {
      view.dispatch({ selection: { anchor: content.indexOf("Quoted") } });
    });

    expect(editorText(container)).toContain("> Quoted text");
  });
});
