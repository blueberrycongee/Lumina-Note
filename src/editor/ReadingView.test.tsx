import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ReadingView } from "./ReadingView";

vi.mock("@/services/markdown/markdown", () => ({
  parseMarkdown: () => "<p>Alpha Beta Gamma</p>",
}));

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    run: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("@/services/plugins/renderRuntime", () => ({
  pluginRenderRuntime: {
    apply: (html: string) => html,
    mountReadingView: vi.fn(() => vi.fn()),
  },
}));

describe("ReadingView edit activation", () => {
  afterEach(() => {
    cleanup();
    window.getSelection()?.removeAllRanges();
  });

  it("activates edit mode on a normal content click", () => {
    const onActivateEdit = vi.fn();
    render(<ReadingView content="Alpha Beta Gamma" onActivateEdit={onActivateEdit} />);

    fireEvent.click(screen.getByText("Alpha Beta Gamma"));

    expect(onActivateEdit).toHaveBeenCalledTimes(1);
  });

  it("does not activate edit mode when text is selected", () => {
    const onActivateEdit = vi.fn();
    render(<ReadingView content="Alpha Beta Gamma" onActivateEdit={onActivateEdit} />);

    const paragraph = screen.getByText("Alpha Beta Gamma");
    const textNode = paragraph.firstChild;
    if (!(textNode instanceof Text)) {
      throw new Error("Expected paragraph text node");
    }

    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    fireEvent.click(paragraph);

    expect(onActivateEdit).not.toHaveBeenCalled();
  });

  it("does not activate edit mode after a drag gesture", () => {
    const onActivateEdit = vi.fn();
    render(<ReadingView content="Alpha Beta Gamma" onActivateEdit={onActivateEdit} />);

    const paragraph = screen.getByText("Alpha Beta Gamma");
    fireEvent.pointerDown(paragraph, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(paragraph, { button: 0, clientX: 40, clientY: 10 });
    fireEvent.click(paragraph);

    expect(onActivateEdit).not.toHaveBeenCalled();
  });
});
