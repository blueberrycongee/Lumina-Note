import { describe, expect, it } from "vitest";
import type { DocxBlock } from "./docxImport";
import {
  DOCX_IMAGE_PLACEHOLDER,
  docxBlocksToPlainText,
  docxBlocksToFontSizePx,
  docxBlocksToLayoutTextOptions,
  docxBlocksToLineHeightPx,
} from "./docxText";

describe("docxBlocksToPlainText", () => {
  it("replaces image blocks with a layout placeholder", () => {
    const blocks: DocxBlock[] = [
      { type: "paragraph", runs: [{ text: "Intro" }] },
      { type: "image", embedId: "rId1", widthEmu: 914400, heightEmu: 457200 },
      { type: "paragraph", runs: [{ text: "Outro" }] },
    ];

    expect(docxBlocksToPlainText(blocks)).toBe(
      `Intro\n${DOCX_IMAGE_PLACEHOLDER}\nOutro`,
    );
  });
});

describe("docxBlocksToLineHeightPx", () => {
  it("returns the default when no paragraph style is present", () => {
    const blocks: DocxBlock[] = [
      { type: "paragraph", runs: [{ text: "Hello" }] },
    ];

    expect(docxBlocksToLineHeightPx(blocks, 20)).toBe(20);
  });

  it("uses auto line height as a multiplier", () => {
    const blocks: DocxBlock[] = [
      {
        type: "paragraph",
        runs: [{ text: "Hello" }],
        paragraphStyle: { lineHeight: 1.5, lineHeightRule: "auto" },
      },
    ];

    expect(docxBlocksToLineHeightPx(blocks, 20)).toBe(30);
  });

  it("uses exact line height in points", () => {
    const blocks: DocxBlock[] = [
      {
        type: "paragraph",
        runs: [{ text: "Hello" }],
        paragraphStyle: { lineHeight: 14, lineHeightRule: "exact" },
      },
    ];

    expect(docxBlocksToLineHeightPx(blocks, 20)).toBe(19);
  });

  it("keeps atLeast line height above the default", () => {
    const blocks: DocxBlock[] = [
      {
        type: "paragraph",
        runs: [{ text: "Hello" }],
        paragraphStyle: { lineHeight: 10, lineHeightRule: "atLeast" },
      },
    ];

    expect(docxBlocksToLineHeightPx(blocks, 20)).toBe(20);
  });

  it("reads line height from list items", () => {
    const blocks: DocxBlock[] = [
      {
        type: "list",
        ordered: false,
        items: [
          {
            runs: [{ text: "Item" }],
            paragraphStyle: { lineHeight: 2, lineHeightRule: "auto" },
          },
        ],
      },
    ];

    expect(docxBlocksToLineHeightPx(blocks, 20)).toBe(40);
  });
});

describe("docxBlocksToLayoutTextOptions", () => {
  it("defaults to left alignment with zero spacing and indent", () => {
    const blocks: DocxBlock[] = [
      { type: "paragraph", runs: [{ text: "Hello" }] },
    ];

    expect(docxBlocksToLayoutTextOptions(blocks)).toEqual({
      align: "left",
      leftIndentPx: 0,
      rightIndentPx: 0,
      firstLineIndentPx: 0,
      spaceBeforePx: 0,
      spaceAfterPx: 0,
      tabStopsPx: [],
      defaultTabStopPx: 48,
    });
  });

  it("maps alignment and spacing from paragraph style", () => {
    const blocks: DocxBlock[] = [
      {
        type: "paragraph",
        runs: [{ text: "Hello" }],
        paragraphStyle: {
          alignment: "center",
          spacingBeforePt: 12,
          spacingAfterPt: 6,
        },
      },
    ];

    expect(docxBlocksToLayoutTextOptions(blocks)).toEqual({
      align: "center",
      leftIndentPx: 0,
      rightIndentPx: 0,
      firstLineIndentPx: 0,
      spaceBeforePx: 16,
      spaceAfterPx: 8,
      tabStopsPx: [],
      defaultTabStopPx: 48,
    });
  });

  it("combines left and first-line indents (including hanging indents)", () => {
    const blocks: DocxBlock[] = [
      {
        type: "paragraph",
        runs: [{ text: "Hello" }],
        paragraphStyle: {
          indentLeftPt: 6,
          indentFirstLinePt: -12,
        },
      },
    ];

    expect(docxBlocksToLayoutTextOptions(blocks)).toEqual({
      align: "left",
      leftIndentPx: 8,
      rightIndentPx: 0,
      firstLineIndentPx: -16,
      spaceBeforePx: 0,
      spaceAfterPx: 0,
      tabStopsPx: [],
      defaultTabStopPx: 48,
    });
  });

  it("clamps negative spacing values to zero", () => {
    const blocks: DocxBlock[] = [
      {
        type: "paragraph",
        runs: [{ text: "Hello" }],
        paragraphStyle: {
          spacingBeforePt: -4,
          spacingAfterPt: -2,
        },
      },
    ];

    expect(docxBlocksToLayoutTextOptions(blocks)).toEqual({
      align: "left",
      leftIndentPx: 0,
      rightIndentPx: 0,
      firstLineIndentPx: 0,
      spaceBeforePx: 0,
      spaceAfterPx: 0,
      tabStopsPx: [],
      defaultTabStopPx: 48,
    });
  });
});

describe("docxBlocksToFontSizePx", () => {
  it("returns the default when no run size is present", () => {
    const blocks: DocxBlock[] = [
      { type: "paragraph", runs: [{ text: "Hello" }] },
    ];

    expect(docxBlocksToFontSizePx(blocks, 16)).toBe(16);
  });

  it("uses the first run size in points", () => {
    const blocks: DocxBlock[] = [
      {
        type: "paragraph",
        runs: [{ text: "Hello", style: { sizePt: 14 } }],
      },
    ];

    expect(docxBlocksToFontSizePx(blocks, 16)).toBe(19);
  });

  it("searches list items and table cells for run sizes", () => {
    const blocks: DocxBlock[] = [
      {
        type: "list",
        ordered: false,
        items: [{ runs: [{ text: "Item", style: { sizePt: 10 } }] }],
      },
      {
        type: "table",
        rows: [
          {
            cells: [
              {
                blocks: [
                  { type: "paragraph", runs: [{ text: "Cell", style: { sizePt: 18 } }] },
                ],
              },
            ],
          },
        ],
      },
    ];

    expect(docxBlocksToFontSizePx(blocks, 16)).toBe(13);
  });
});
