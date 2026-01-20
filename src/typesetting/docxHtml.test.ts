/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { docxHtmlToBlocks } from "./docxHtml";

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
});
