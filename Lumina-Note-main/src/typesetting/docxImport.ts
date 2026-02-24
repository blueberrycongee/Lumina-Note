export type DocxRunStyle = {
  font?: string;
  sizePt?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
};

export type DocxParagraphStyle = {
  alignment?: "left" | "right" | "center" | "justify";
  lineHeight?: number;
  lineHeightRule?: "auto" | "exact" | "atLeast";
  spacingBeforePt?: number;
  spacingAfterPt?: number;
  indentFirstLinePt?: number;
  indentLeftPt?: number;
  indentRightPt?: number;
  tabStopsPt?: number[];
};

export type DocxPageStyle = {
  widthMm?: number;
  heightMm?: number;
  marginTopMm?: number;
  marginBottomMm?: number;
  marginLeftMm?: number;
  marginRightMm?: number;
  headerMm?: number;
  footerMm?: number;
};

export type DocxRun = {
  text: string;
  style?: DocxRunStyle;
};

export type DocxParagraphBlock = {
  type: "paragraph";
  runs: DocxRun[];
  paragraphStyle?: DocxParagraphStyle;
};

export type DocxHeadingBlock = {
  type: "heading";
  level: number;
  runs: DocxRun[];
  paragraphStyle?: DocxParagraphStyle;
};

export type DocxListItem = {
  runs: DocxRun[];
  paragraphStyle?: DocxParagraphStyle;
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
  widthEmu?: number;
  heightEmu?: number;
};

export type DocxBlock =
  | DocxParagraphBlock
  | DocxHeadingBlock
  | DocxListBlock
  | DocxTableBlock
  | DocxImageBlock;

export type DocxStyleDefinition = import("./docxStyles").DocxStyleDefinition;
export type DocxStyleMap = import("./docxStyles").DocxStyleMap;

export function parseDocxPageStyle(xml: string): DocxPageStyle | undefined {
  if (!xml.trim()) {
    return undefined;
  }

  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    return undefined;
  }

  const sectNodes = [
    ...Array.from(doc.getElementsByTagName("w:sectPr")),
    ...Array.from(doc.getElementsByTagName("sectPr")),
  ];
  if (sectNodes.length === 0) {
    return undefined;
  }

  const sect = sectNodes[sectNodes.length - 1];
  const pgSz =
    sect.getElementsByTagName("w:pgSz")[0] ??
    sect.getElementsByTagName("pgSz")[0];
  const pgMar =
    sect.getElementsByTagName("w:pgMar")[0] ??
    sect.getElementsByTagName("pgMar")[0];

  const style: DocxPageStyle = {};
  if (pgSz) {
    const widthPt = parseTwipAttribute(pgSz, "w");
    const heightPt = parseTwipAttribute(pgSz, "h");
    const orient = (pgSz.getAttribute("w:orient") ?? pgSz.getAttribute("orient"))?.toLowerCase();
    if (widthPt !== null) {
      style.widthMm = ptToMm(widthPt);
    }
    if (heightPt !== null) {
      style.heightMm = ptToMm(heightPt);
    }
    if (orient === "landscape" && style.widthMm && style.heightMm && style.widthMm < style.heightMm) {
      const temp = style.widthMm;
      style.widthMm = style.heightMm;
      style.heightMm = temp;
    }
  }

  if (pgMar) {
    const topPt = parseTwipAttribute(pgMar, "top");
    const bottomPt = parseTwipAttribute(pgMar, "bottom");
    const leftPt = parseTwipAttribute(pgMar, "left");
    const rightPt = parseTwipAttribute(pgMar, "right");
    const headerPt = parseTwipAttribute(pgMar, "header");
    const footerPt = parseTwipAttribute(pgMar, "footer");
    if (topPt !== null) style.marginTopMm = ptToMm(topPt);
    if (bottomPt !== null) style.marginBottomMm = ptToMm(bottomPt);
    if (leftPt !== null) style.marginLeftMm = ptToMm(leftPt);
    if (rightPt !== null) style.marginRightMm = ptToMm(rightPt);
    if (headerPt !== null) style.headerMm = ptToMm(headerPt);
    if (footerPt !== null) style.footerMm = ptToMm(footerPt);
  }

  return Object.keys(style).length > 0 ? style : undefined;
}

export function parseDocxDocumentXml(
  xml: string,
  styles?: DocxStyleMap,
): DocxBlock[] {
  return parseDocxXmlWithContainer(xml, ["w:body", "body"], styles);
}

export function parseDocxHeaderFooterXml(
  xml: string,
  styles?: DocxStyleMap,
): DocxBlock[] {
  return parseDocxXmlWithContainer(xml, ["w:hdr", "hdr", "w:ftr", "ftr"], styles);
}

type ParagraphContent = {
  runs: DocxRun[];
  headingLevel?: number;
  listKey?: string;
  images: DocxImageBlock[];
  paragraphStyle?: DocxParagraphStyle;
};

function parseDocxXmlWithContainer(
  xml: string,
  containerTags: string[],
  styles?: DocxStyleMap,
): DocxBlock[] {
  if (!xml.trim()) {
    return [];
  }

  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    return [];
  }

  let container: Element | undefined;
  for (const tag of containerTags) {
    const match = doc.getElementsByTagName(tag)[0];
    if (match) {
      container = match;
      break;
    }
  }

  const fallback = container ?? doc.documentElement;
  if (!fallback) {
    return [];
  }

  return parseBodyBlocks(fallback, styles);
}

function parseBodyBlocks(container: Element, styles?: DocxStyleMap): DocxBlock[] {
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
        const content = parseParagraphContent(element, { includeList: true }, styles);
        if (content.listKey) {
          if (!currentList || currentList.key !== content.listKey) {
            flushList();
            currentList = {
              key: content.listKey,
              block: { type: "list", ordered: false, items: [] },
            };
          }
          const listItem: DocxListItem = { runs: content.runs };
          if (content.paragraphStyle) {
            listItem.paragraphStyle = content.paragraphStyle;
          }
          currentList.block.items.push(listItem);
          break;
        }

        flushList();
        const paragraphBlocks = paragraphContentToBlocks(content);
        blocks.push(...paragraphBlocks);
        break;
      }
      case "w:sdt": {
        flushList();
        const content =
          element.getElementsByTagName("w:sdtContent")[0] ??
          element.getElementsByTagName("sdtContent")[0];
        if (content) {
          blocks.push(...parseBodyBlocks(content, styles));
        }
        break;
      }
      case "w:tbl": {
        flushList();
        blocks.push(parseTable(element, styles));
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

  const hasRuns = content.runs.length > 0;
  if (hasRuns || content.images.length === 0) {
    if (content.headingLevel !== undefined && hasRuns) {
      const heading: DocxHeadingBlock = {
        type: "heading",
        level: content.headingLevel,
        runs: content.runs,
      };
      if (content.paragraphStyle) {
        heading.paragraphStyle = content.paragraphStyle;
      }
      blocks.push(heading);
    } else {
      const paragraph: DocxParagraphBlock = {
        type: "paragraph",
        runs: content.runs,
      };
      if (content.paragraphStyle) {
        paragraph.paragraphStyle = content.paragraphStyle;
      }
      blocks.push(paragraph);
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
  styles?: DocxStyleMap,
): ParagraphContent {
  const { paragraphStyle, runDefaults } = resolveParagraphStyles(paragraph, styles);
  const runs = parseRuns(paragraph, runDefaults, styles);
  const headingLevel = parseHeadingLevel(paragraph);
  const listKey = options.includeList ? parseListKey(paragraph) : undefined;
  const images = extractParagraphImages(paragraph);
  return { runs, headingLevel, listKey, images, paragraphStyle };
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

function parseRuns(
  paragraph: Element,
  defaults: DocxRunStyle | undefined,
  styles?: DocxStyleMap,
): DocxRun[] {
  const runs = Array.from(paragraph.getElementsByTagName("w:r"));
  const result: DocxRun[] = [];

  for (const run of runs) {
    const text = extractRunText(run);
    if (!text) {
      continue;
    }

    const directStyle = parseRunStyle(run);
    const styleId = parseRunStyleId(run);
    const styleFromMap = styleId ? resolveCharacterStyle(styleId, styles) : undefined;
    const merged = mergeRunStyles(defaults, styleFromMap, directStyle);
    if (merged) {
      result.push({ text, style: merged });
    } else {
      result.push({ text });
    }
  }

  return result;
}

function parseParagraphStyle(paragraph: Element): DocxParagraphStyle | undefined {
  const pPr =
    paragraph.getElementsByTagName("w:pPr")[0] ??
    paragraph.getElementsByTagName("pPr")[0];
  if (!pPr) {
    return undefined;
  }

  const style: DocxParagraphStyle = {};

  const alignmentNode =
    pPr.getElementsByTagName("w:jc")[0] ??
    pPr.getElementsByTagName("jc")[0];
  const rawAlign =
    alignmentNode?.getAttribute("w:val") ??
    alignmentNode?.getAttribute("val");
  const alignment = parseAlignment(rawAlign);
  if (alignment) {
    style.alignment = alignment;
  }

  const spacingNode =
    pPr.getElementsByTagName("w:spacing")[0] ??
    pPr.getElementsByTagName("spacing")[0];
  if (spacingNode) {
    const before = parseTwipAttribute(spacingNode, "before");
    if (before !== null) {
      style.spacingBeforePt = before;
    }

    const after = parseTwipAttribute(spacingNode, "after");
    if (after !== null) {
      style.spacingAfterPt = after;
    }

    const lineRaw = spacingNode.getAttribute("w:line")
      ?? spacingNode.getAttribute("line");
    const line = lineRaw ? Number.parseFloat(lineRaw) : Number.NaN;
    if (Number.isFinite(line)) {
      const rawRule =
        spacingNode.getAttribute("w:lineRule") ??
        spacingNode.getAttribute("lineRule");
      const lineRule = normalizeLineRule(rawRule);
      if (lineRule === "auto") {
        style.lineHeightRule = "auto";
        style.lineHeight = line / 240;
      } else if (lineRule === "exact" || lineRule === "atLeast") {
        style.lineHeightRule = lineRule;
        style.lineHeight = line / 20;
      }
    }
  }

  const indentNode =
    pPr.getElementsByTagName("w:ind")[0] ??
    pPr.getElementsByTagName("ind")[0];
  if (indentNode) {
    const firstLine = parseTwipAttribute(indentNode, "firstLine");
    const hanging = parseTwipAttribute(indentNode, "hanging");
    if (firstLine !== null) {
      style.indentFirstLinePt = firstLine;
    } else if (hanging !== null) {
      style.indentFirstLinePt = -hanging;
    }

    const left = parseTwipAttribute(indentNode, "left");
    if (left !== null) {
      style.indentLeftPt = left;
    }

    const right = parseTwipAttribute(indentNode, "right");
    if (right !== null) {
      style.indentRightPt = right;
    }
  }

  const tabsNode =
    pPr.getElementsByTagName("w:tabs")[0] ??
    pPr.getElementsByTagName("tabs")[0];
  if (tabsNode) {
    const tabStops: number[] = [];
    const tabNodes = [
      ...Array.from(tabsNode.getElementsByTagName("w:tab")),
      ...Array.from(tabsNode.getElementsByTagName("tab")),
    ];
    for (const tab of tabNodes) {
      const posRaw = tab.getAttribute("w:pos") ?? tab.getAttribute("pos");
      const pos = posRaw ? Number.parseFloat(posRaw) : Number.NaN;
      if (Number.isFinite(pos) && pos > 0) {
        tabStops.push(pos / 20);
      }
    }
    if (tabStops.length > 0) {
      tabStops.sort((a, b) => a - b);
      style.tabStopsPt = tabStops;
    }
  }

  return Object.keys(style).length > 0 ? style : undefined;
}

function parseParagraphStyleId(paragraph: Element): string | undefined {
  const pPr =
    paragraph.getElementsByTagName("w:pPr")[0] ??
    paragraph.getElementsByTagName("pPr")[0];
  if (!pPr) return undefined;
  const pStyle =
    pPr.getElementsByTagName("w:pStyle")[0] ??
    pPr.getElementsByTagName("pStyle")[0];
  if (!pStyle) return undefined;
  return pStyle.getAttribute("w:val") ?? pStyle.getAttribute("val") ?? undefined;
}

function parseRunStyleId(run: Element): string | undefined {
  const rPr =
    run.getElementsByTagName("w:rPr")[0] ??
    run.getElementsByTagName("rPr")[0];
  if (!rPr) return undefined;
  const rStyle =
    rPr.getElementsByTagName("w:rStyle")[0] ??
    rPr.getElementsByTagName("rStyle")[0];
  if (!rStyle) return undefined;
  return rStyle.getAttribute("w:val") ?? rStyle.getAttribute("val") ?? undefined;
}

function parseAlignment(value?: string | null): DocxParagraphStyle["alignment"] {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  switch (normalized) {
    case "left":
    case "start":
      return "left";
    case "right":
    case "end":
      return "right";
    case "center":
      return "center";
    case "both":
    case "justify":
    case "distribute":
      return "justify";
    default:
      return undefined;
  }
}

function normalizeLineRule(value?: string | null): DocxParagraphStyle["lineHeightRule"] {
  if (!value) return "auto";
  const normalized = value.toLowerCase();
  if (normalized === "exact") {
    return "exact";
  }
  if (normalized === "atleast" || normalized === "at-least" || normalized === "at least") {
    return "atLeast";
  }
  return "auto";
}

function parseTwipAttribute(node: Element, name: string): number | null {
  const raw =
    node.getAttribute(`w:${name}`) ??
    node.getAttribute(name);
  if (!raw) return null;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return null;
  return value / 20;
}

function ptToMm(points: number): number {
  return (points * 25.4) / 72;
}

function extractParagraphImages(paragraph: Element): DocxImageBlock[] {
  const images: DocxImageBlock[] = [];
  const drawings = [
    ...Array.from(paragraph.getElementsByTagName("w:drawing")),
    ...Array.from(paragraph.getElementsByTagName("drawing")),
  ];

  for (const drawing of drawings) {
    const extent = parseDrawingExtent(drawing);
    const blips = [
      ...Array.from(drawing.getElementsByTagName("a:blip")),
      ...Array.from(drawing.getElementsByTagName("blip")),
    ];
    for (const blip of blips) {
      const embed = blip.getAttribute("r:embed") ?? blip.getAttribute("embed");
      if (embed) {
        images.push({
          type: "image",
          embedId: embed,
          widthEmu: extent?.widthEmu,
          heightEmu: extent?.heightEmu,
        });
      }
    }
  }

  return images;
}

function parseDrawingExtent(drawing: Element): { widthEmu: number; heightEmu: number } | null {
  const extent =
    drawing.getElementsByTagName("wp:extent")[0] ??
    drawing.getElementsByTagName("extent")[0] ??
    drawing.getElementsByTagName("a:ext")[0];
  if (!extent) {
    return null;
  }

  const widthEmu = parseExtentValue(extent.getAttribute("cx"));
  const heightEmu = parseExtentValue(extent.getAttribute("cy"));
  if (widthEmu === null || heightEmu === null) {
    return null;
  }

  return { widthEmu, heightEmu };
}

function parseExtentValue(raw: string | null): number | null {
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function parseTable(table: Element, styles?: DocxStyleMap): DocxTableBlock {
  const rows = Array.from(table.getElementsByTagName("w:tr")).map((row) => {
    const cells = Array.from(row.getElementsByTagName("w:tc")).map((cell) => {
      const paragraphs = Array.from(cell.getElementsByTagName("w:p"));
      const blocks: DocxBlock[] = [];
      for (const paragraph of paragraphs) {
        const content = parseParagraphContent(paragraph, { includeList: false }, styles);
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

  const strikeNode =
    rPr.getElementsByTagName("w:strike")[0] ??
    rPr.getElementsByTagName("w:dstrike")[0];
  if (strikeNode) {
    const raw = strikeNode.getAttribute("w:val") ?? strikeNode.getAttribute("val");
    if (!raw || raw === "1" || raw.toLowerCase() === "true") {
      style.strikethrough = true;
    }
  }

  return Object.keys(style).length > 0 ? style : undefined;
}

function resolveParagraphStyles(
  paragraph: Element,
  styles?: DocxStyleMap,
): { paragraphStyle?: DocxParagraphStyle; runDefaults?: DocxRunStyle } {
  if (!styles) {
    return {
      paragraphStyle: parseParagraphStyle(paragraph),
      runDefaults: undefined,
    };
  }

  const styleId = parseParagraphStyleId(paragraph);
  const baseParagraph = styles.defaults.paragraph;
  const baseRun = styles.defaults.run;
  const fromStyles = styleId ? resolveParagraphStyle(styleId, styles) : undefined;
  const directParagraph = parseParagraphStyle(paragraph);

  return {
    paragraphStyle: mergeParagraphStyles(baseParagraph, fromStyles?.paragraph, directParagraph),
    runDefaults: mergeRunStyles(baseRun, fromStyles?.run),
  };
}

function resolveParagraphStyle(
  styleId: string,
  styles: DocxStyleMap,
): { paragraph?: DocxParagraphStyle; run?: DocxRunStyle } | undefined {
  const visited = new Set<string>();
  let currentId: string | undefined = styleId;
  let paragraph: DocxParagraphStyle | undefined;
  let run: DocxRunStyle | undefined;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const style: DocxStyleDefinition | undefined = styles.paragraph[currentId];
    if (!style) {
      break;
    }
    paragraph = mergeParagraphStyles(style.paragraph, paragraph);
    run = mergeRunStyles(style.run, run);
    currentId = style.basedOn;
  }

  if (!paragraph && !run) {
    return undefined;
  }
  return { paragraph, run };
}

function resolveCharacterStyle(
  styleId: string,
  styles?: DocxStyleMap,
): DocxRunStyle | undefined {
  if (!styles) return undefined;
  const visited = new Set<string>();
  let currentId: string | undefined = styleId;
  let run: DocxRunStyle | undefined;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const style: DocxStyleDefinition | undefined = styles.character[currentId];
    if (!style) {
      break;
    }
    run = mergeRunStyles(style.run, run);
    currentId = style.basedOn;
  }

  return run;
}

function mergeParagraphStyles(
  ...styles: Array<DocxParagraphStyle | undefined>
): DocxParagraphStyle | undefined {
  const merged: DocxParagraphStyle = {};
  for (const style of styles) {
    if (!style) continue;
    if (style.alignment !== undefined) merged.alignment = style.alignment;
    if (style.lineHeight !== undefined) merged.lineHeight = style.lineHeight;
    if (style.lineHeightRule !== undefined) merged.lineHeightRule = style.lineHeightRule;
    if (style.spacingBeforePt !== undefined) merged.spacingBeforePt = style.spacingBeforePt;
    if (style.spacingAfterPt !== undefined) merged.spacingAfterPt = style.spacingAfterPt;
    if (style.indentFirstLinePt !== undefined) merged.indentFirstLinePt = style.indentFirstLinePt;
    if (style.indentLeftPt !== undefined) merged.indentLeftPt = style.indentLeftPt;
    if (style.indentRightPt !== undefined) merged.indentRightPt = style.indentRightPt;
    if (style.tabStopsPt !== undefined) merged.tabStopsPt = style.tabStopsPt;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function mergeRunStyles(
  ...styles: Array<DocxRunStyle | undefined>
): DocxRunStyle | undefined {
  const merged: DocxRunStyle = {};
  for (const style of styles) {
    if (!style) continue;
    if (style.font !== undefined) merged.font = style.font;
    if (style.sizePt !== undefined) merged.sizePt = style.sizePt;
    if (style.bold !== undefined) merged.bold = style.bold;
    if (style.italic !== undefined) merged.italic = style.italic;
    if (style.underline !== undefined) merged.underline = style.underline;
    if (style.strikethrough !== undefined) merged.strikethrough = style.strikethrough;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}
