import { describe, expect, it } from "vitest";
import { docOpFromInputType } from "./docOps";

describe("docOpFromInputType", () => {
  it("maps insertText with data to insert_text", () => {
    expect(docOpFromInputType("insertText", "Hello")).toEqual({
      type: "insert_text",
      text: "Hello",
    });
  });

  it("ignores insertText without data", () => {
    expect(docOpFromInputType("insertText", null)).toBeNull();
    expect(docOpFromInputType("insertText", "")).toBeNull();
  });

  it("maps insertParagraph to a newline insert", () => {
    expect(docOpFromInputType("insertParagraph")).toEqual({
      type: "insert_text",
      text: "\n",
    });
  });

  it("maps deleteWordBackward to a delete op", () => {
    expect(docOpFromInputType("deleteWordBackward")).toEqual({
      type: "delete_content",
      direction: "backward",
      unit: "word",
    });
  });

  it("maps formatBold to an inline style op", () => {
    expect(docOpFromInputType("formatBold")).toEqual({
      type: "apply_inline_style",
      style: { bold: true },
    });
  });

  it("maps formatJustifyCenter to a paragraph align op", () => {
    expect(docOpFromInputType("formatJustifyCenter")).toEqual({
      type: "apply_paragraph_style",
      action: { type: "align", align: "center" },
    });
  });

  it("maps formatIndent to a paragraph indent op", () => {
    expect(docOpFromInputType("formatIndent")).toEqual({
      type: "apply_paragraph_style",
      action: { type: "indent", delta: 1 },
    });
  });

  it("maps formatBlock to a paragraph block op", () => {
    expect(docOpFromInputType("formatBlock", "<h1>")).toEqual({
      type: "apply_paragraph_style",
      action: { type: "block", block: "h1" },
    });
  });
});
