/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { parseDocxDocumentXml, parseDocxHeaderFooterXml, parseDocxPageStyle } from "./docxImport";
import { parseDocxStylesXml } from "./docxStyles";

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

  it("applies paragraph and run styles from styles.xml", () => {
    const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:docDefaults>
          <w:rPrDefault>
            <w:rPr>
              <w:rFonts w:ascii="Times New Roman" />
              <w:sz w:val="24" />
            </w:rPr>
          </w:rPrDefault>
          <w:pPrDefault>
            <w:pPr>
              <w:jc w:val="left" />
            </w:pPr>
          </w:pPrDefault>
        </w:docDefaults>
        <w:style w:type="paragraph" w:styleId="Normal">
          <w:rPr>
            <w:sz w:val="24" />
          </w:rPr>
        </w:style>
        <w:style w:type="paragraph" w:styleId="Heading1">
          <w:basedOn w:val="Normal" />
          <w:pPr>
            <w:jc w:val="center" />
          </w:pPr>
          <w:rPr>
            <w:sz w:val="36" />
          </w:rPr>
        </w:style>
      </w:styles>`;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p>
            <w:pPr>
              <w:pStyle w:val="Heading1" />
            </w:pPr>
            <w:r>
              <w:t>Styled Title</w:t>
            </w:r>
          </w:p>
        </w:body>
      </w:document>`;

    const styles = parseDocxStylesXml(stylesXml);
    const blocks = parseDocxDocumentXml(xml, styles);
    expect(blocks).toHaveLength(1);
    const heading = blocks[0];
    expect(heading.type).toBe("heading");
    if (heading.type !== "heading") return;
    expect(heading.paragraphStyle?.alignment).toBe("center");
    expect(heading.runs[0].style?.sizePt).toBe(18);
    expect(heading.runs[0].style?.font).toBe("Times New Roman");
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

  it("parses paragraph styles for alignment, spacing, and indent", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p>
            <w:pPr>
              <w:jc w:val="center" />
              <w:spacing w:before="120" w:after="240" w:line="360" w:lineRule="auto" />
              <w:ind w:firstLine="240" w:left="720" w:right="360" />
            </w:pPr>
            <w:r><w:t>Styled</w:t></w:r>
          </w:p>
        </w:body>
      </w:document>`;

    const blocks = parseDocxDocumentXml(xml);
    expect(blocks).toHaveLength(1);
    const paragraph = blocks[0];
    expect(paragraph.type).toBe("paragraph");
    if (paragraph.type === "paragraph") {
      expect(paragraph.paragraphStyle).toEqual({
        alignment: "center",
        spacingBeforePt: 6,
        spacingAfterPt: 12,
        lineHeight: 1.5,
        lineHeightRule: "auto",
        indentFirstLinePt: 12,
        indentLeftPt: 36,
        indentRightPt: 18,
      });
    }
  });

  it("preserves empty paragraphs for spacing", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p>
            <w:pPr>
              <w:spacing w:before="120" w:after="120" />
            </w:pPr>
          </w:p>
        </w:body>
      </w:document>`;

    const blocks = parseDocxDocumentXml(xml);
    expect(blocks).toHaveLength(1);
    const paragraph = blocks[0];
    expect(paragraph.type).toBe("paragraph");
    if (paragraph.type === "paragraph") {
      expect(paragraph.runs).toEqual([]);
      expect(paragraph.paragraphStyle).toEqual({
        spacingBeforePt: 6,
        spacingAfterPt: 6,
      });
    }
  });

  it("parses sdt content blocks", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:sdt>
            <w:sdtContent>
              <w:p>
                <w:r><w:t>Inside</w:t></w:r>
              </w:p>
            </w:sdtContent>
          </w:sdt>
        </w:body>
      </w:document>`;

    const blocks = parseDocxDocumentXml(xml);
    expect(blocks).toHaveLength(1);
    const paragraph = blocks[0];
    expect(paragraph.type).toBe("paragraph");
    if (paragraph.type === "paragraph") {
      expect(paragraph.runs).toEqual([{ text: "Inside" }]);
    }
  });

  it("parses tab stops from paragraph properties", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p>
            <w:pPr>
              <w:tabs>
                <w:tab w:pos="720" />
                <w:tab w:pos="1440" />
              </w:tabs>
            </w:pPr>
            <w:r><w:t>Tabbed</w:t></w:r>
          </w:p>
        </w:body>
      </w:document>`;

    const blocks = parseDocxDocumentXml(xml);
    expect(blocks).toHaveLength(1);
    const paragraph = blocks[0];
    expect(paragraph.type).toBe("paragraph");
    if (paragraph.type === "paragraph") {
      expect(paragraph.paragraphStyle).toEqual({
        tabStopsPt: [36, 72],
      });
    }
  });

  it("parses page size and margins from section properties", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>Cover</w:t></w:r></w:p>
          <w:sectPr>
            <w:pgSz w:w="12240" w:h="15840" />
            <w:pgMar w:top="1440" w:bottom="1440" w:left="1800" w:right="1800" w:header="720" w:footer="720" />
          </w:sectPr>
        </w:body>
      </w:document>`;

    const style = parseDocxPageStyle(xml);
    expect(style).toBeTruthy();
    if (!style) return;

    expect(style.widthMm).toBeCloseTo(215.9, 1);
    expect(style.heightMm).toBeCloseTo(279.4, 1);
    expect(style.marginTopMm).toBeCloseTo(25.4, 1);
    expect(style.marginBottomMm).toBeCloseTo(25.4, 1);
    expect(style.marginLeftMm).toBeCloseTo(31.75, 2);
    expect(style.marginRightMm).toBeCloseTo(31.75, 2);
    expect(style.headerMm).toBeCloseTo(12.7, 1);
    expect(style.footerMm).toBeCloseTo(12.7, 1);
  });

  it("parses hanging indents as negative first-line indents", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p>
            <w:pPr>
              <w:ind w:hanging="240" />
              <w:spacing w:line="400" w:lineRule="exact" />
            </w:pPr>
            <w:r><w:t>Hanging</w:t></w:r>
          </w:p>
        </w:body>
      </w:document>`;

    const blocks = parseDocxDocumentXml(xml);
    expect(blocks).toHaveLength(1);
    const paragraph = blocks[0];
    expect(paragraph.type).toBe("paragraph");
    if (paragraph.type === "paragraph") {
      expect(paragraph.paragraphStyle).toEqual({
        lineHeight: 20,
        lineHeightRule: "exact",
        indentFirstLinePt: -12,
      });
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

  it("parses image-only paragraphs into image blocks with extents", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
        xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
        <w:body>
          <w:p>
            <w:r>
              <w:drawing>
                <wp:inline>
                  <wp:extent cx="914400" cy="457200" />
                </wp:inline>
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
      expect(image.widthEmu).toBe(914400);
      expect(image.heightEmu).toBe(457200);
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
