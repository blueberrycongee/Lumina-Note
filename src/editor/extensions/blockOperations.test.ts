import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { executeBlockAction, getBlockAtPos } from "./blockOperations";

function createView(text: string) {
  const state = EditorState.create({
    doc: text,
    extensions: [markdown()],
  });
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({ state, parent });
  ensureSyntaxTree(view.state, view.state.doc.length, 100);
  return { view, cleanup: () => parent.remove() };
}

describe("executeBlockAction", () => {
  it("transforms paragraph to heading1", () => {
    const { view, cleanup } = createView("hello world");
    const block = getBlockAtPos(view.state, 0);
    expect(block).not.toBeNull();
    const ok = executeBlockAction(view, block!, "heading1");
    expect(ok).toBe(true);
    expect(view.state.doc.toString()).toBe("# hello world");
    cleanup();
  });

  it("inserts code block template", () => {
    const { view, cleanup } = createView("placeholder");
    const block = getBlockAtPos(view.state, 0);
    expect(block).not.toBeNull();
    const ok = executeBlockAction(view, block!, "codeBlock");
    expect(ok).toBe(true);
    expect(view.state.doc.toString()).toBe("```\n\n```");
    expect(view.state.selection.main.anchor).toBe(4);
    cleanup();
  });

  it("inserts image template", () => {
    const { view, cleanup } = createView("placeholder");
    const block = getBlockAtPos(view.state, 0);
    expect(block).not.toBeNull();
    const ok = executeBlockAction(view, block!, "image");
    expect(ok).toBe(true);
    expect(view.state.doc.toString()).toBe("![]()");
    expect(view.state.selection.main.anchor).toBe(4);
    cleanup();
  });
});
