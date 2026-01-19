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

export type DocxListItem = {
  runs: DocxRun[];
};

export type DocxListBlock = {
  type: "list";
  ordered: boolean;
  items: DocxListItem[];
};

export type DocxTableCell = {
  blocks: DocxBlock[];
};

export type DocxTableRow = {
  cells: DocxTableCell[];
};

export type DocxTableBlock = {
  type: "table";
  rows: DocxTableRow[];
};

export type DocxImageBlock = {
  type: "image";
  embedId: string;
  description?: string;
};

export type DocxBlock =
  | DocxParagraphBlock
  | DocxHeadingBlock
  | DocxListBlock
  | DocxTableBlock
  | DocxImageBlock;

export function parseDocxDocumentXml(xml: string): DocxBlock[] {
  if (!xml.trim()) {
    return [];
  }

  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    return [];
  }

  const body = doc.getElementsByTagName("w:body")[0];
  const container = body ?? doc.documentElement;
  if (!container) {
    return [];
  }

  return parseBodyBlocks(container);
}

type ParagraphContent = {
  runs: DocxRun[];
  headingLevel?: number;
  listKey?: string;
  images: DocxImageBlock[];
};

function parseBodyBlocks(container: Element): DocxBlock[] {
  const blocks: DocxBlock[] = [];
  let currentList: { key: string; block: DocxListBlock } | null = null;

  const flushList = () => {
    if (currentList) {
      blocks.push(currentList.block);
      currentList = null;
    }
  };

  for (const node of Array.from(container.childNodes)) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    const element = node as Element;
    switch (element.tagName) {
      case "w:p": {
        const content = parseParagraphContent(element, { includeList: true });
        if (content.listKey) {
          if (!currentList || currentList.key !== content.listKey) {
            flushList();
            currentList = {
              key: content.listKey,
              block: { type: "list", ordered: false, items: [] },
            };
          }
          currentList.block.items.push({ runs: content.runs });
          break;
        }

        flushList();
        const paragraphBlocks = paragraphContentToBlocks(content);
        blocks.push(...paragraphBlocks);
        break;
      }
      case "w:tbl": {
        flushList();
        blocks.push(parseTable(element));
        break;
      }
      default:
        break;
    }
  }

  flushList();
  return blocks;
}

function paragraphContentToBlocks(content: ParagraphContent): DocxBlock[] {
  const blocks: DocxBlock[] = [];

  if (content.runs.length > 0) {
    if (content.headingLevel !== undefined) {
      blocks.push({
        type: "heading",
        level: content.headingLevel,
        runs: content.runs,
      });
    } else {
      blocks.push({ type: "paragraph", runs: content.runs });
    }
  }

  if (content.images.length > 0) {
    blocks.push(...content.images);
  }

  return blocks;
}

function parseParagraphContent(
  paragraph: Element,
  options: { includeList: boolean },
): ParagraphContent {
  const runs = parseRuns(paragraph);
  const headingLevel = parseHeadingLevel(paragraph);
  const listKey = options.includeList ? parseListKey(paragraph) : undefined;
  const images = extractParagraphImages(paragraph);
  return { runs, headingLevel, listKey, images };
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

function parseListKey(paragraph: Element): string | undefined {
  const pPr = paragraph.getElementsByTagName("w:pPr")[0];
  if (!pPr) {
    return undefined;
  }

  const numPr = pPr.getElementsByTagName("w:numPr")[0];
  if (!numPr) {
    return undefined;
  }

  const numIdNode = numPr.getElementsByTagName("w:numId")[0];
  const ilvlNode = numPr.getElementsByTagName("w:ilvl")[0];
  const numId =
    numIdNode?.getAttribute("w:val") ?? numIdNode?.getAttribute("val");
  const level =
    ilvlNode?.getAttribute("w:val") ?? ilvlNode?.getAttribute("val") ?? "0";

  if (!numId) {
    return `unknown:${level}`;
  }

  return `${numId}:${level}`;
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

function extractParagraphImages(paragraph: Element): DocxImageBlock[] {
  const images: DocxImageBlock[] = [];
  const drawings = [
    ...Array.from(paragraph.getElementsByTagName("w:drawing")),
    ...Array.from(paragraph.getElementsByTagName("drawing")),
  ];

  for (const drawing of drawings) {
    const blips = [
      ...Array.from(drawing.getElementsByTagName("a:blip")),
      ...Array.from(drawing.getElementsByTagName("blip")),
    ];
    for (const blip of blips) {
      const embed = blip.getAttribute("r:embed") ?? blip.getAttribute("embed");
      if (embed) {
        images.push({ type: "image", embedId: embed });
      }
    }
  }

  return images;
}

function parseTable(table: Element): DocxTableBlock {
  const rows = Array.from(table.getElementsByTagName("w:tr")).map((row) => {
    const cells = Array.from(row.getElementsByTagName("w:tc")).map((cell) => {
      const paragraphs = Array.from(cell.getElementsByTagName("w:p"));
      const blocks: DocxBlock[] = [];
      for (const paragraph of paragraphs) {
        const content = parseParagraphContent(paragraph, { includeList: false });
        blocks.push(...paragraphContentToBlocks(content));
      }
      return { blocks };
    });
    return { cells };
  });

  return { type: "table", rows };
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
