// @vitest-environment node
import { describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import { buildDocxPackage, parseDocxPackage } from "./docxPackage";

const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Hello</w:t></w:r></w:p>
  </w:body>
</w:document>`;

const HEADER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:r><w:t>Header</w:t></w:r></w:p>
</w:hdr>`;

const FOOTER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:r><w:t>Footer</w:t></w:r></w:p>
</w:ftr>`;

describe("docxPackage", () => {
  const normalizeKey = (value: string) =>
    value
      .replace(/\\/g, "/")
      .replace(/^\.\//, "")
      .replace(/^[\\/]+/, "")
      .replace(/\0/g, "")
      .trim()
      .toLowerCase();

  const hasEntry = (entries: Record<string, Uint8Array>, name: string) => {
    const target = normalizeKey(name);
    return Object.keys(entries).some((key) => normalizeKey(key) === target);
  };

  it("parses a minimal docx package", () => {
    const zipBytes = zipSync({
      "[Content_Types].xml": strToU8("content"),
      "_rels/.rels": strToU8("rels"),
      "word/document.xml": strToU8(DOCUMENT_XML),
      "word/header1.xml": strToU8(HEADER_XML),
      "word/footer1.xml": strToU8(FOOTER_XML),
    });

    const pkg = parseDocxPackage(zipBytes);
    expect(pkg.documentXml).toContain("<w:document");
    expect(pkg.headers).toHaveLength(1);
    expect(pkg.headers[0]).toContain("<w:hdr");
    expect(pkg.footers).toHaveLength(1);
    expect(pkg.footers[0]).toContain("<w:ftr");
  });

  it("throws when the package has no document.xml", () => {
    const zipBytes = zipSync({
      "[Content_Types].xml": strToU8("content"),
      "_rels/.rels": strToU8("rels"),
    });

    expect(() => parseDocxPackage(zipBytes)).toThrow(/document\.xml/);
  });

  it("builds a docx package with expected parts", () => {
    const bytes = buildDocxPackage({
      documentXml: DOCUMENT_XML,
      headers: [HEADER_XML],
      footers: [FOOTER_XML],
    });

    const entries = unzipSync(bytes);
    expect(hasEntry(entries, "[Content_Types].xml")).toBe(true);
    expect(hasEntry(entries, "_rels/.rels")).toBe(true);
    expect(hasEntry(entries, "word/document.xml")).toBe(true);
    expect(hasEntry(entries, "word/header1.xml")).toBe(true);
    expect(hasEntry(entries, "word/footer1.xml")).toBe(true);
  });
});
