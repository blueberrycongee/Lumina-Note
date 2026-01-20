/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { parseDocxDocumentXml, parseDocxHeaderFooterXml } from "./docxImport";

describe("parseDocxDocumentXml", () => {
  it("parses headings, paragraphs, and run font styles", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p>
            <w:pPr>
              <w:pStyle w:val="Heading1" />
            </w:pPr>
            <w:r>
              <w:rPr>
                <w:rFonts w:ascii="Times New Roman" />
                <w:sz w:val="28" />
                <w:b />
              </w:rPr>
              <w:t>Title</w:t>
            </w:r>
          </w:p>
          <w:p>
            <w:r>
              <w:rPr>
                <w:rFonts w:eastAsia="SimSun" />
                <w:sz w:val="24" />
                <w:i />
              </w:rPr>
              <w:t>Hello</w:t>
            </w:r>
          </w:p>
        </w:body>
      </w:document>`;

    const blocks = parseDocxDocumentXml(xml);
    expect(blocks).toHaveLength(2);

    const heading = blocks[0];
    expect(heading.type).toBe("heading");
    if (heading.type === "heading") {
      expect(heading.level).toBe(1);
      expect(heading.runs).toHaveLength(1);
      expect(heading.runs[0]).toEqual({
        text: "Title",
        style: {
          font: "Times New Roman",
          sizePt: 14,
          bold: true,
        },
      });
    }

    const paragraph = blocks[1];
    expect(paragraph.type).toBe("paragraph");
    if (paragraph.type === "paragraph") {
      expect(paragraph.runs).toEqual([
        {
          text: "Hello",
          style: {
            font: "SimSun",
            sizePt: 12,
            italic: true,
          },
        },
      ]);
    }
  });

  it("handles tabs, line breaks, and missing style values", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p>
            <w:r>
              <w:rPr>
                <w:b w:val="0" />
                <w:u w:val="none" />
              </w:rPr>
              <w:t>Alpha</w:t>
              <w:tab />
              <w:t>Beta</w:t>
              <w:br />
              <w:t>Gamma</w:t>
            </w:r>
            <w:r>
              <w:t>Tail</w:t>
            </w:r>
          </w:p>
        </w:body>
      </w:document>`;

    const blocks = parseDocxDocumentXml(xml);
    expect(blocks).toHaveLength(1);
    const paragraph = blocks[0];
    expect(paragraph.type).toBe("paragraph");
    if (paragraph.type === "paragraph") {
      expect(paragraph.runs).toEqual([
        {
          text: "Alpha\tBeta\nGamma",
        },
        {
          text: "Tail",
        },
      ]);
    }
  });

  it("parses strikethrough run styles", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p>
            <w:r>
              <w:rPr>
                <w:strike />
              </w:rPr>
              <w:t>Strike</w:t>
            </w:r>
            <w:r>
              <w:rPr>
                <w:dstrike w:val="true" />
              </w:rPr>
              <w:t>Double</w:t>
            </w:r>
          </w:p>
        </w:body>
      </w:document>`;

    const blocks = parseDocxDocumentXml(xml);
    expect(blocks).toHaveLength(1);
    const paragraph = blocks[0];
    expect(paragraph.type).toBe("paragraph");
    if (paragraph.type === "paragraph") {
      expect(paragraph.runs).toEqual([
        {
          text: "Strike",
          style: { strikethrough: true },
        },
        {
          text: "Double",
          style: { strikethrough: true },
        },
      ]);
    }
  });

  it("returns an empty list when no paragraphs exist", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body></w:body>
      </w:document>`;

    expect(parseDocxDocumentXml(xml)).toEqual([]);
  });

  it("groups list paragraphs into list blocks", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p>
            <w:pPr>
              <w:numPr>
                <w:ilvl w:val="0" />
                <w:numId w:val="7" />
              </w:numPr>
            </w:pPr>
            <w:r><w:t>Item A</w:t></w:r>
          </w:p>
          <w:p>
            <w:pPr>
              <w:numPr>
                <w:ilvl w:val="0" />
                <w:numId w:val="7" />
              </w:numPr>
            </w:pPr>
            <w:r><w:t>Item B</w:t></w:r>
          </w:p>
          <w:p>
            <w:r><w:t>Break</w:t></w:r>
          </w:p>
          <w:p>
            <w:pPr>
              <w:numPr>
                <w:ilvl w:val="0" />
                <w:numId w:val="8" />
              </w:numPr>
            </w:pPr>
            <w:r><w:t>Item C</w:t></w:r>
          </w:p>
        </w:body>
      </w:document>`;

    const blocks = parseDocxDocumentXml(xml);
    expect(blocks).toHaveLength(3);

    const first = blocks[0];
    expect(first.type).toBe("list");
    if (first.type === "list") {
      expect(first.ordered).toBe(false);
      expect(first.items).toEqual([
        { runs: [{ text: "Item A" }] },
        { runs: [{ text: "Item B" }] },
      ]);
    }

    const middle = blocks[1];
    expect(middle.type).toBe("paragraph");
    if (middle.type === "paragraph") {
      expect(middle.runs).toEqual([{ text: "Break" }]);
    }

    const last = blocks[2];
    expect(last.type).toBe("list");
    if (last.type === "list") {
      expect(last.items).toEqual([{ runs: [{ text: "Item C" }] }]);
    }
  });

  it("parses tables with paragraph cells", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:tbl>
            <w:tr>
              <w:tc>
                <w:p><w:r><w:t>R1C1</w:t></w:r></w:p>
              </w:tc>
              <w:tc>
                <w:p><w:r><w:t>R1C2</w:t></w:r></w:p>
              </w:tc>
            </w:tr>
            <w:tr>
              <w:tc>
                <w:p><w:r><w:t>R2C1</w:t></w:r></w:p>
              </w:tc>
              <w:tc>
                <w:p><w:r><w:t>R2C2</w:t></w:r></w:p>
              </w:tc>
            </w:tr>
          </w:tbl>
        </w:body>
      </w:document>`;

    const blocks = parseDocxDocumentXml(xml);
    expect(blocks).toHaveLength(1);
    const table = blocks[0];
    expect(table.type).toBe("table");
    if (table.type === "table") {
      expect(table.rows).toHaveLength(2);
      expect(table.rows[0].cells[0].blocks).toEqual([
        { type: "paragraph", runs: [{ text: "R1C1" }] },
      ]);
      expect(table.rows[0].cells[1].blocks).toEqual([
        { type: "paragraph", runs: [{ text: "R1C2" }] },
      ]);
      expect(table.rows[1].cells[0].blocks).toEqual([
        { type: "paragraph", runs: [{ text: "R2C1" }] },
      ]);
      expect(table.rows[1].cells[1].blocks).toEqual([
        { type: "paragraph", runs: [{ text: "R2C2" }] },
      ]);
    }
  });

  it("parses image-only paragraphs into image blocks", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <w:body>
          <w:p>
            <w:r>
              <w:drawing>
                <a:blip r:embed="rId5" />
              </w:drawing>
            </w:r>
          </w:p>
        </w:body>
      </w:document>`;

    const blocks = parseDocxDocumentXml(xml);
    expect(blocks).toHaveLength(1);
    const image = blocks[0];
    expect(image.type).toBe("image");
    if (image.type === "image") {
      expect(image.embedId).toBe("rId5");
    }
  });

  it("parses header XML roots into blocks", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:p>
          <w:r><w:t>Header Text</w:t></w:r>
        </w:p>
      </w:hdr>`;

    const blocks = parseDocxHeaderFooterXml(xml);
    expect(blocks).toEqual([
      { type: "paragraph", runs: [{ text: "Header Text" }] },
    ]);
  });

  it("parses footer XML roots into blocks", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:p>
          <w:r><w:t>Footer Text</w:t></w:r>
        </w:p>
      </w:ftr>`;

    const blocks = parseDocxHeaderFooterXml(xml);
    expect(blocks).toEqual([
      { type: "paragraph", runs: [{ text: "Footer Text" }] },
    ]);
  });
});
