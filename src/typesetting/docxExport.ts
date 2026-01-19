import type {
  DocxBlock,
  DocxImageBlock,
  DocxListBlock,
  DocxRun,
  DocxRunStyle,
  DocxTableBlock,
} from "./docxImport";

const WORD_NAMESPACE =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL_NAMESPACE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const DRAWING_NAMESPACE =
  "http://schemas.openxmlformats.org/drawingml/2006/main";

export function buildDocxDocumentXml(blocks: DocxBlock[]): string {
  const body = blocks.map((block) => buildBlockXml(block)).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<w:document xmlns:w="${WORD_NAMESPACE}" xmlns:r="${REL_NAMESPACE}" xmlns:a="${DRAWING_NAMESPACE}">` +
    `<w:body>${body}</w:body>` +
    `</w:document>`;
}

type ListMeta = {
  numId: string;
  level: number;
};

function buildBlockXml(block: DocxBlock): string {
  switch (block.type) {
    case "paragraph":
      return buildParagraph(block.runs, {});
    case "heading":
      return buildParagraph(block.runs, { headingLevel: block.level });
    case "list":
      return buildListBlock(block);
    case "table":
      return buildTableBlock(block);
    case "image":
      return buildImageParagraph(block);
    default:
      return "";
  }
}

function buildParagraph(
  runs: DocxRun[],
  options: { headingLevel?: number; listMeta?: ListMeta },
): string {
  const pPrParts: string[] = [];
  if (options.headingLevel) {
    pPrParts.push(`<w:pStyle w:val="Heading${options.headingLevel}" />`);
  }
  if (options.listMeta) {
    pPrParts.push(
      `<w:numPr><w:ilvl w:val="${options.listMeta.level}" /><w:numId w:val="${options.listMeta.numId}" /></w:numPr>`,
    );
  }
  const pPr = pPrParts.length > 0 ? `<w:pPr>${pPrParts.join("")}</w:pPr>` : "";
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

function buildListBlock(list: DocxListBlock): string {
  const numId = list.ordered ? "1" : "2";
  return list.items
    .map((item) =>
      buildParagraph(item.runs, { listMeta: { numId, level: 0 } }),
    )
    .join("");
}

function buildTableBlock(table: DocxTableBlock): string {
  const rowsXml = table.rows
    .map((row) => {
      const cellsXml = row.cells
        .map((cell) => {
          const cellContent = cell.blocks.map((block) => buildBlockXml(block)).join("");
          return `<w:tc>${cellContent || "<w:p />"}</w:tc>`;
        })
        .join("");
      return `<w:tr>${cellsXml}</w:tr>`;
    })
    .join("");

  return `<w:tbl>${rowsXml}</w:tbl>`;
}

function buildImageParagraph(image: DocxImageBlock): string {
  const blip = `<a:blip r:embed="${escapeXmlAttribute(image.embedId)}" />`;
  return `<w:p><w:r><w:drawing>${blip}</w:drawing></w:r></w:p>`;
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
