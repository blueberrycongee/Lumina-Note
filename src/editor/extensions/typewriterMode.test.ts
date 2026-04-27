import { describe, expect, it } from "vitest";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { typewriterExtensions } from "./typewriterMode";

describe("typewriterExtensions wiring", () => {
  it("adds cm-focus-on class and active-line decoration when focus is enabled via reconfigure", () => {
    const compartment = new Compartment();
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    const state = EditorState.create({
      doc: "# Heading\n\nFirst paragraph line.\n\nSecond paragraph here.\n",
      extensions: [markdown(), compartment.of(typewriterExtensions(false, false))],
    });
    const view = new EditorView({ state, parent });

    expect(view.dom.classList.contains("cm-focus-on")).toBe(false);

    view.dispatch({
      effects: compartment.reconfigure(typewriterExtensions(false, true)),
    });

    expect(view.dom.classList.contains("cm-focus-on")).toBe(true);
    const active = view.contentDOM.querySelectorAll(".cm-line.cm-typewriter-active");
    expect(active.length).toBeGreaterThan(0);

    view.destroy();
    parent.remove();
  });

  it("removes cm-focus-on class when focus is toggled back off", () => {
    const compartment = new Compartment();
    const parent = document.createElement("div");
    document.body.appendChild(parent);

    const state = EditorState.create({
      doc: "Hello world\n",
      extensions: [markdown(), compartment.of(typewriterExtensions(false, true))],
    });
    const view = new EditorView({ state, parent });

    expect(view.dom.classList.contains("cm-focus-on")).toBe(true);

    view.dispatch({
      effects: compartment.reconfigure(typewriterExtensions(false, false)),
    });

    expect(view.dom.classList.contains("cm-focus-on")).toBe(false);

    view.destroy();
    parent.remove();
  });
});
