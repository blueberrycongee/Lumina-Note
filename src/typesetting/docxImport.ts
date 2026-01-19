export type DocxRunStyle = {
  font?: string;
  sizePt?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

export type DocxRun = {
  text: string;
  style?: DocxRunStyle;
};

export type DocxParagraphBlock = {
  type: "paragraph";
  runs: DocxRun[];
};

export type DocxHeadingBlock = {
  type: "heading";
  level: number;
  runs: DocxRun[];
};

export type DocxBlock = DocxParagraphBlock | DocxHeadingBlock;

export function parseDocxDocumentXml(xml: string): DocxBlock[] {
  if (!xml.trim()) {
    return [];
  }

  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    return [];
  }

  const body = doc.getElementsByTagName("w:body")[0];
  const paragraphs = body
    ? Array.from(body.getElementsByTagName("w:p"))
    : Array.from(doc.getElementsByTagName("w:p"));

  return paragraphs.map((paragraph) => {
    const runs = parseRuns(paragraph);
    const headingLevel = parseHeadingLevel(paragraph);
    if (headingLevel !== undefined) {
      return { type: "heading", level: headingLevel, runs };
    }
    return { type: "paragraph", runs };
  });
}

function parseHeadingLevel(paragraph: Element): number | undefined {
  const pStyle = paragraph.getElementsByTagName("w:pStyle")[0];
  if (!pStyle) {
    return undefined;
  }

  const raw = pStyle.getAttribute("w:val") ?? pStyle.getAttribute("val");
  if (!raw) {
    return undefined;
  }

  const match = raw.match(/heading\s*(\d+)/i);
  if (!match) {
    return undefined;
  }

  const level = Number.parseInt(match[1], 10);
  if (!Number.isFinite(level) || level < 1 || level > 6) {
    return undefined;
  }

  return level;
}

function parseRuns(paragraph: Element): DocxRun[] {
  const runs = Array.from(paragraph.getElementsByTagName("w:r"));
  const result: DocxRun[] = [];

  for (const run of runs) {
    const text = extractRunText(run);
    if (!text) {
      continue;
    }

    const style = parseRunStyle(run);
    if (style) {
      result.push({ text, style });
    } else {
      result.push({ text });
    }
  }

  return result;
}

function extractRunText(run: Element): string {
  let text = "";
  for (const node of Array.from(run.childNodes)) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    const element = node as Element;
    switch (element.tagName) {
      case "w:t":
        text += element.textContent ?? "";
        break;
      case "w:tab":
        text += "\t";
        break;
      case "w:br":
        text += "\n";
        break;
      default:
        break;
    }
  }

  return text;
}

function parseRunStyle(run: Element): DocxRunStyle | undefined {
  const rPr = run.getElementsByTagName("w:rPr")[0];
  if (!rPr) {
    return undefined;
  }

  const style: DocxRunStyle = {};

  const rFonts = rPr.getElementsByTagName("w:rFonts")[0];
  if (rFonts) {
    const ascii = rFonts.getAttribute("w:ascii") ?? rFonts.getAttribute("ascii");
    const eastAsia =
      rFonts.getAttribute("w:eastAsia") ?? rFonts.getAttribute("eastAsia");
    const font = ascii || eastAsia;
    if (font) {
      style.font = font;
    }
  }

  const sizeNode = rPr.getElementsByTagName("w:sz")[0];
  if (sizeNode) {
    const raw = sizeNode.getAttribute("w:val") ?? sizeNode.getAttribute("val");
    const sizeHalfPoints = raw ? Number.parseFloat(raw) : Number.NaN;
    if (Number.isFinite(sizeHalfPoints)) {
      style.sizePt = sizeHalfPoints / 2;
    }
  }

  const boldNode = rPr.getElementsByTagName("w:b")[0];
  if (boldNode) {
    const raw = boldNode.getAttribute("w:val") ?? boldNode.getAttribute("val");
    if (!raw || raw === "1" || raw.toLowerCase() === "true") {
      style.bold = true;
    }
  }

  const italicNode = rPr.getElementsByTagName("w:i")[0];
  if (italicNode) {
    const raw = italicNode.getAttribute("w:val") ?? italicNode.getAttribute("val");
    if (!raw || raw === "1" || raw.toLowerCase() === "true") {
      style.italic = true;
    }
  }

  const underlineNode = rPr.getElementsByTagName("w:u")[0];
  if (underlineNode) {
    const raw = underlineNode.getAttribute("w:val") ?? underlineNode.getAttribute("val");
    if (raw && raw.toLowerCase() !== "none") {
      style.underline = true;
    }
  }

  return Object.keys(style).length > 0 ? style : undefined;
}
