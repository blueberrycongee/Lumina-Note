import type { DocxBlock, DocxRun, DocxRunStyle } from "./docxImport";

const WORD_NAMESPACE =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export function buildDocxDocumentXml(blocks: DocxBlock[]): string {
  const body = blocks
    .map((block) => {
      if (block.type === "paragraph") {
        return buildParagraph(block.runs, undefined);
      }
      if (block.type === "heading") {
        return buildParagraph(block.runs, block.level);
      }
      return "";
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<w:document xmlns:w="${WORD_NAMESPACE}">` +
    `<w:body>${body}</w:body>` +
    `</w:document>`;
}

function buildParagraph(runs: DocxRun[], headingLevel?: number): string {
  const pPr = headingLevel
    ? `<w:pPr><w:pStyle w:val="Heading${headingLevel}" /></w:pPr>`
    : "";
  const runXml = runs.map((run) => buildRun(run)).join("");
  return `<w:p>${pPr}${runXml}</w:p>`;
}

function buildRun(run: DocxRun): string {
  const rPr = buildRunStyle(run.style);
  const textXml = buildRunText(run.text);
  return `<w:r>${rPr}${textXml}</w:r>`;
}

function buildRunStyle(style?: DocxRunStyle): string {
  if (!style) {
    return "";
  }

  const parts: string[] = [];

  if (style.font) {
    parts.push(
      `<w:rFonts w:ascii="${escapeXmlAttribute(style.font)}" w:eastAsia="${escapeXmlAttribute(style.font)}" />`,
    );
  }

  if (typeof style.sizePt === "number" && Number.isFinite(style.sizePt)) {
    const halfPoints = Math.round(style.sizePt * 2);
    parts.push(`<w:sz w:val="${halfPoints}" />`);
  }

  if (style.bold) {
    parts.push("<w:b />");
  }

  if (style.italic) {
    parts.push("<w:i />");
  }

  if (style.underline) {
    parts.push('<w:u w:val="single" />');
  }

  if (parts.length === 0) {
    return "";
  }

  return `<w:rPr>${parts.join("")}</w:rPr>`;
}

function buildRunText(text: string): string {
  if (!text) {
    return `<w:t xml:space="preserve"></w:t>`;
  }

  let result = "";
  let buffer = "";

  const flushBuffer = () => {
    if (buffer.length > 0) {
      result += `<w:t xml:space="preserve">${escapeXmlText(buffer)}</w:t>`;
      buffer = "";
    }
  };

  for (const ch of text) {
    if (ch === "\t") {
      flushBuffer();
      result += "<w:tab />";
    } else if (ch === "\n") {
      flushBuffer();
      result += "<w:br />";
    } else {
      buffer += ch;
    }
  }

  flushBuffer();
  return result;
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value).replace(/"/g, "&quot;");
}
