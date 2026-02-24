/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { docxBlocksToHtml, docxHtmlToBlocks } from "./docxHtml";

describe("docxHtmlToBlocks", () => {
  it("captures inline CSS styles for bold/italic/underline", () => {
    const root = document.createElement("div");
    root.innerHTML = `<p><span style="font-weight: 700; font-style: italic; text-decoration: underline;">Hello</span> world</p>`;

    const blocks = docxHtmlToBlocks(root);
    expect(blocks).toEqual([
      {
        type: "paragraph",
        runs: [
          {
            text: "Hello",
            style: {
              bold: true,
              italic: true,
              underline: true,
            },
          },
          { text: " world" },
        ],
      },
    ]);
  });

  it("treats numeric font-weight and text-decoration-line as styles", () => {
    const root = document.createElement("div");
    root.innerHTML = `<p><span style="font-weight: 500;">Light</span> <span style="font-weight: 600; text-decoration-line: underline;">Bold</span></p>`;

    const blocks = docxHtmlToBlocks(root);
    expect(blocks).toEqual([
      {
        type: "paragraph",
        runs: [
          { text: "Light" },
          { text: " " },
          {
            text: "Bold",
            style: {
              bold: true,
              underline: true,
            },
          },
        ],
      },
    ]);
  });

  it("captures strikethrough from tags and text-decoration", () => {
    const root = document.createElement("div");
    root.innerHTML = `<p><span style="text-decoration: line-through;">Cut</span> <s>Old</s></p>`;

    const blocks = docxHtmlToBlocks(root);
    expect(blocks).toEqual([
      {
        type: "paragraph",
        runs: [
          {
            text: "Cut",
            style: {
              strikethrough: true,
            },
          },
          { text: " " },
          {
            text: "Old",
            style: {
              strikethrough: true,
            },
          },
        ],
      },
    ]);
  });

  it("captures font family and font size from inline styles", () => {
    const root = document.createElement("div");
    root.innerHTML =
      `<p><span style="font-family: 'Times New Roman', serif; font-size: 16px;">Hello</span> ` +
      `<span style="font-size: 12pt;">World</span></p>`;

    const blocks = docxHtmlToBlocks(root);
    expect(blocks).toEqual([
      {
        type: "paragraph",
        runs: [
          {
            text: "Hello",
            style: {
              font: "Times New Roman",
              sizePt: 12,
            },
          },
          { text: " " },
          {
            text: "World",
            style: {
              sizePt: 12,
            },
          },
        ],
      },
    ]);
  });

  it("ignores nested list items when mapping to flat list blocks", () => {
    const root = document.createElement("div");
    root.innerHTML = `<ul><li>First<ul><li>Nested</li></ul></li><li>Second</li></ul>`;

    const blocks = docxHtmlToBlocks(root);
    expect(blocks).toEqual([
      {
        type: "list",
        ordered: false,
        items: [{ runs: [{ text: "First" }] }, { runs: [{ text: "Second" }] }],
      },
    ]);
  });

  it("parses image-only paragraphs into image blocks with extents", () => {
    const root = document.createElement("div");
    root.innerHTML = `<p><img data-embed-id="rId3" data-width-emu="914400" data-height-emu="457200" src="data:image/png;base64,abc" /></p>`;

    const blocks = docxHtmlToBlocks(root);
    expect(blocks).toEqual([
      {
        type: "image",
        embedId: "rId3",
        widthEmu: 914400,
        heightEmu: 457200,
      },
    ]);
  });

  it("renders image blocks with resolver data and preserves embed id", () => {
    const html = docxBlocksToHtml(
      [{ type: "image", embedId: "rId5", widthEmu: 914400, heightEmu: 457200 }],
      {
        imageResolver: (embedId) =>
          embedId === "rId5"
            ? { src: "data:image/png;base64,abc", alt: "Logo" }
            : null,
      },
    );

    expect(html).toContain("data-embed-id=\"rId5\"");
    expect(html).toContain("data-width-emu=\"914400\"");
    expect(html).toContain("data-height-emu=\"457200\"");
    expect(html).toContain("width:96px");
    expect(html).toContain("src=\"data:image/png;base64,abc\"");
    expect(html).toContain("alt=\"Logo\"");
  });

  it("falls back to placeholder text when image resolver is missing", () => {
    const html = docxBlocksToHtml([{ type: "image", embedId: "rId7" }]);
    expect(html).toContain("[image:rId7]");
  });
});
