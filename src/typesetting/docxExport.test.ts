/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import type { DocxBlock } from "./docxImport";
import { buildDocxDocumentXml } from "./docxExport";

describe("buildDocxDocumentXml", () => {
  it("exports headings and paragraphs with run styles", () => {
    const blocks: DocxBlock[] = [
      {
        type: "heading",
        level: 2,
        runs: [
          {
            text: "Title",
            style: { font: "Times New Roman", sizePt: 14, bold: true },
          },
        ],
      },
      {
        type: "paragraph",
        runs: [
          {
            text: "Body",
            style: { font: "SimSun", sizePt: 12, italic: true, underline: true },
          },
        ],
      },
    ];

    const xml = buildDocxDocumentXml(blocks);
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const paragraphs = Array.from(doc.getElementsByTagName("w:p"));
    expect(paragraphs).toHaveLength(2);

    const headingStyle = paragraphs[0]
      .getElementsByTagName("w:pStyle")[0]
      ?.getAttribute("w:val");
    expect(headingStyle).toBe("Heading2");

    const headingFonts =
      paragraphs[0].getElementsByTagName("w:rFonts")[0];
    expect(headingFonts?.getAttribute("w:ascii")).toBe("Times New Roman");

    const headingSize = paragraphs[0]
      .getElementsByTagName("w:sz")[0]
      ?.getAttribute("w:val");
    expect(headingSize).toBe("28");
    expect(paragraphs[0].getElementsByTagName("w:b")).toHaveLength(1);

    const bodyFonts = paragraphs[1].getElementsByTagName("w:rFonts")[0];
    expect(bodyFonts?.getAttribute("w:ascii")).toBe("SimSun");
    expect(paragraphs[1].getElementsByTagName("w:i")).toHaveLength(1);
    expect(paragraphs[1].getElementsByTagName("w:u")).toHaveLength(1);
  });

  it("escapes text and emits tab/line break nodes", () => {
    const blocks: DocxBlock[] = [
      {
        type: "paragraph",
        runs: [
          {
            text: "A&B <C>\nLine2\tTab",
          },
        ],
      },
    ];

    const xml = buildDocxDocumentXml(blocks);
    expect(xml).toContain("A&amp;B &lt;C&gt;");
    expect(xml).toContain("<w:br");
    expect(xml).toContain("<w:tab");
  });

  it("exports lists, tables, and images", () => {
    const blocks: DocxBlock[] = [
      {
        type: "list",
        ordered: true,
        items: [{ runs: [{ text: "First" }] }, { runs: [{ text: "Second" }] }],
      },
      {
        type: "table",
        rows: [
          {
            cells: [
              { blocks: [{ type: "paragraph", runs: [{ text: "Cell A" }] }] },
              { blocks: [{ type: "paragraph", runs: [{ text: "Cell B" }] }] },
            ],
          },
        ],
      },
      {
        type: "image",
        embedId: "rId42",
      },
    ];

    const xml = buildDocxDocumentXml(blocks);
    const doc = new DOMParser().parseFromString(xml, "application/xml");

    const listProps = Array.from(doc.getElementsByTagName("w:numPr"));
    expect(listProps).toHaveLength(2);
    expect(listProps[0].getElementsByTagName("w:numId")[0]?.getAttribute("w:val")).toBe("1");
    expect(listProps[0].getElementsByTagName("w:ilvl")[0]?.getAttribute("w:val")).toBe("0");

    const tables = Array.from(doc.getElementsByTagName("w:tbl"));
    expect(tables).toHaveLength(1);
    const cells = Array.from(tables[0].getElementsByTagName("w:tc"));
    expect(cells).toHaveLength(2);
    const cellText = cells[0].getElementsByTagName("w:t")[0]?.textContent;
    expect(cellText).toBe("Cell A");

    const blip = doc.getElementsByTagName("a:blip")[0];
    expect(blip?.getAttribute("r:embed")).toBe("rId42");
  });
});
