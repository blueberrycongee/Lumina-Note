import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { EditorView } from "@codemirror/view";

import { CodeMirrorEditor } from "./CodeMirrorEditor";

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
  return { ...rendered, view };
}

function expectScrollTarget(
  dispatchCalls: Array<any[]>,
  expectedPos: number,
) {
  const lastCall = dispatchCalls.at(-1)?.[0] as
    | {
        effects?:
          | {
              value?: {
                range?: { from?: number };
                y?: string;
                yMargin?: number;
              };
            }
          | Array<{
              value?: {
                range?: { from?: number };
                y?: string;
                yMargin?: number;
              };
            }>;
      }
    | undefined;
  const effect = Array.isArray(lastCall?.effects)
    ? lastCall.effects[0]
    : lastCall?.effects;

  expect(effect?.value?.range?.from).toBe(expectedPos);
  expect(effect?.value?.y).toBe("start");
  expect(effect?.value?.yMargin).toBe(24);
}

describe("CodeMirror external jump navigation", () => {
  afterEach(() => {
    cleanup();
  });

  it("scrolls to the exact heading position from outline events", () => {
    const content = "# Title\n\n## Section\nBody";
    const { view } = setupEditor(content);
    const dispatchSpy = vi.spyOn(view, "dispatch");
    const targetPos = content.indexOf("## Section");

    act(() => {
      window.dispatchEvent(
        new CustomEvent("outline-scroll-to", {
          detail: { line: 3, text: "Section", pos: targetPos },
        }),
      );
    });

    expectScrollTarget(dispatchSpy.mock.calls, targetPos);
  });

  it("falls back to line-based jumps for search events", () => {
    const content = "# Title\n\n## Section\nBody";
    const { view } = setupEditor(content);
    const dispatchSpy = vi.spyOn(view, "dispatch");
    const expectedPos = content.indexOf("## Section");

    act(() => {
      window.dispatchEvent(
        new CustomEvent("search-jump-to", {
          detail: { line: 3 },
        }),
      );
    });

    expectScrollTarget(dispatchSpy.mock.calls, expectedPos);
  });
});
