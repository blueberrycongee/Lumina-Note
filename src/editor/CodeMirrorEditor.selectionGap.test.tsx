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

  it("selects full document on beforeinput selectAll", () => {
    const { view } = setupEditor("Line 1\nLine 2\nLine 3");
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 0 } });
    });
    const event = new Event("beforeinput", { bubbles: true, cancelable: true }) as InputEvent;
    Object.defineProperty(event, "inputType", { value: "selectAll" });
    act(() => {
      view.contentDOM.dispatchEvent(event);
    });
    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(view.state.doc.length);
  });

  it("selects full document on Mod-A keydown", () => {
    const { view } = setupEditor("Alpha\nBeta\nGamma");
    act(() => {
      view.dispatch({ selection: { anchor: 2, head: 2 } });
    });
    const event = new KeyboardEvent("keydown", {
      key: "a",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      view.contentDOM.dispatchEvent(event);
    });
    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(view.state.doc.length);
  });

  it("enables drawSelection layer for select-all", () => {
    const { container, view } = setupEditor("Line 1\nLine 2\nLine 3");
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    });
    expect(container.querySelector(".cm-selectionLayer")).not.toBeNull();
  });

  it("does not expand code block when selection only touches its boundary", () => {
    const content = "## JSON\n```json\n{\"name\":\"demo\"}\n```";
    const { container, view } = setupEditor(content);

    // Select heading line including newline; selection end equals code fence start.
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 8 } });
    });

    // Code block should remain rendered as widget, not source text.
    expect(container.querySelector(".cm-code-block-widget")).not.toBeNull();
    expect(container.textContent ?? "").not.toContain("```json");
  });

  it("does not expand code block when selection crosses into it from heading", () => {
    const content = "## JSON\n```json\n{\"name\":\"demo\"}\n```";
    const { container, view } = setupEditor(content);

    // Slightly overshoot from heading into the first fence char.
    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 9 } });
    });

    expect(container.querySelector(".cm-code-block-widget")).not.toBeNull();
    expect(container.textContent ?? "").not.toContain("```json");
  });

  it("expands code block when selection is inside code block content", () => {
    const content = "## JSON\n```json\n{\"name\":\"demo\"}\n```";
    const { container, view } = setupEditor(content);

    // Place caret inside fenced code content.
    act(() => {
      view.dispatch({ selection: { anchor: 12, head: 12 } });
    });

    expect(container.textContent ?? "").toContain("```json");
  });

  it("renders code block widget without external margin utility classes", () => {
    const content = "```json\n{\"name\":\"demo\"}\n```";
    const { container } = setupEditor(content);
    const widget = container.querySelector(".cm-code-block-widget");
    expect(widget).not.toBeNull();
    expect(widget?.className.includes("my-2")).toBe(false);
  });

  it("keeps list and quote marks visible when another line is active", () => {
    const content = "Paragraph\n- item\n> quote\n# heading";
    const { container, view } = setupEditor(content);

    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 0 } });
    });

    const visibleBlockTexts = Array.from(
      container.querySelectorAll(".cm-formatting-block.cm-formatting-block-visible")
    ).map((el) => el.textContent ?? "");

    expect(visibleBlockTexts.some((text) => text.includes("-"))).toBe(true);
    expect(visibleBlockTexts.some((text) => text.includes(">"))).toBe(true);
  });

  it("keeps heading mark collapsed when heading line is not active", () => {
    const content = "Paragraph\n# Heading";
    const { container, view } = setupEditor(content);

    act(() => {
      view.dispatch({ selection: { anchor: 0, head: 0 } });
    });

    const headingMark = Array.from(container.querySelectorAll(".cm-formatting-block"))
      .find((el) => (el.textContent ?? "").includes("#"));

    expect(headingMark).toBeDefined();
    expect(headingMark?.classList.contains("cm-formatting-block-visible")).toBe(false);
  });
});
