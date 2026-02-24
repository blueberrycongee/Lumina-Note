import { bench, describe } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { CodeMirrorEditor } from "../../editor/CodeMirrorEditor";
import { buildSyntheticMarkdown } from "../startupPerfScenarios";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function setupEditor(content: string) {
  const onChange = () => {};
  const { container } = render(
    <CodeMirrorEditor content={content} onChange={onChange} viewMode="live" />,
  );
  const el = container.querySelector(".cm-editor");
  if (!el) throw new Error("CodeMirror editor root not found");
  const view = EditorView.findFromDOM(el as HTMLElement);
  if (!view) throw new Error("EditorView instance not found");
  return { container, view };
}

/* Keep document sizes modest — jsdom full-pipeline is slower */
const docSizes = [10, 50, 200] as const;
const docs: Record<string, string> = {};
for (const kb of docSizes) {
  docs[`${kb}KB`] = buildSyntheticMarkdown(kb);
}

/* ------------------------------------------------------------------ */
/*  Initialization: EditorState creation + first decoration build     */
/* ------------------------------------------------------------------ */
describe("初始化 (EditorState + 首次 decoration)", () => {
  for (const kb of docSizes) {
    bench(
      `${kb}KB document`,
      () => {
        const { container } = setupEditor(docs[`${kb}KB`]);
        // Force layout read so decorations are computed
        void container.querySelector(".cm-content")?.textContent;
      },
      {
        teardown() {
          cleanup();
        },
      },
    );
  }
});

/* ------------------------------------------------------------------ */
/*  Document change: append a line → full decoration rebuild          */
/* ------------------------------------------------------------------ */
describe("文档变更 (append → decoration rebuild)", () => {
  for (const kb of docSizes) {
    let view: EditorView;

    bench(
      `${kb}KB + append`,
      () => {
        const docLen = view.state.doc.length;
        view.dispatch({
          changes: { from: docLen, insert: "\n\nNew line with $x^2$ and ==mark==\n" },
        });
      },
      {
        setup() {
          ({ view } = setupEditor(docs[`${kb}KB`]));
        },
        teardown() {
          cleanup();
        },
      },
    );
  }
});

/* ------------------------------------------------------------------ */
/*  Selection move: cursor change → selection-sensitive decorations   */
/* ------------------------------------------------------------------ */
describe("选区移动 (cursor → decoration rebuild)", () => {
  for (const kb of docSizes) {
    let view: EditorView;

    bench(
      `${kb}KB cursor move`,
      () => {
        const pos = Math.min(100, view.state.doc.length);
        view.dispatch({ selection: { anchor: pos } });
      },
      {
        setup() {
          ({ view } = setupEditor(docs[`${kb}KB`]));
        },
        teardown() {
          cleanup();
        },
      },
    );
  }
});
