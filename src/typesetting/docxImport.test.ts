/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { parseDocxDocumentXml } from "./docxImport";

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

  it("returns an empty list when no paragraphs exist", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body></w:body>
      </w:document>`;

    expect(parseDocxDocumentXml(xml)).toEqual([]);
  });
});
