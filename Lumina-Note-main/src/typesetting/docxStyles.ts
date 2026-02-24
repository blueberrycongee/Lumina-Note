import type { DocxParagraphStyle, DocxRunStyle } from "./docxImport";

export type DocxStyleDefinition = {
  id: string;
  type: "paragraph" | "character";
  basedOn?: string;
  paragraph?: DocxParagraphStyle;
  run?: DocxRunStyle;
};

export type DocxStyleMap = {
  paragraph: Record<string, DocxStyleDefinition>;
  character: Record<string, DocxStyleDefinition>;
  defaults: {
    paragraph?: DocxParagraphStyle;
    run?: DocxRunStyle;
  };
};

export function parseDocxStylesXml(xml?: string | null): DocxStyleMap {
  const empty: DocxStyleMap = {
    paragraph: {},
    character: {},
    defaults: {},
  };
  if (!xml || !xml.trim()) {
    return empty;
  }
  if (typeof DOMParser === "undefined") {
    return empty;
  }

  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    return empty;
  }

  const defaults = parseDocDefaults(doc);
  const styleNodes = [
    ...Array.from(doc.getElementsByTagName("w:style")),
    ...Array.from(doc.getElementsByTagName("style")),
  ];

  const paragraph: Record<string, DocxStyleDefinition> = {};
  const character: Record<string, DocxStyleDefinition> = {};

  for (const node of styleNodes) {
    const type =
      node.getAttribute("w:type") ?? node.getAttribute("type") ?? "";
    const styleId =
      node.getAttribute("w:styleId") ?? node.getAttribute("styleId") ?? "";
    if (!styleId) {
      continue;
    }
    if (type !== "paragraph" && type !== "character") {
      continue;
    }

    const basedOn = extractVal(node, "w:basedOn", "basedOn");
    const paragraphStyle = parseParagraphStyleElement(
      findFirst(node, ["w:pPr", "pPr"]),
    );
    const runStyle = parseRunStyleElement(
      findFirst(node, ["w:rPr", "rPr"]),
    );

    const entry: DocxStyleDefinition = {
      id: styleId,
      type,
      basedOn: basedOn ?? undefined,
      paragraph: paragraphStyle,
      run: runStyle,
    };

    if (type === "paragraph") {
      paragraph[styleId] = entry;
    } else if (type === "character") {
      character[styleId] = entry;
    }
  }

  return {
    paragraph,
    character,
    defaults,
  };
}

function parseDocDefaults(doc: Document): DocxStyleMap["defaults"] {
  const defaults: DocxStyleMap["defaults"] = {};
  const docDefaults = findFirst(doc, ["w:docDefaults", "docDefaults"]);
  if (!docDefaults) {
    return defaults;
  }

  const rPrDefault = findFirst(docDefaults, ["w:rPrDefault", "rPrDefault"]);
  const rPr = rPrDefault
    ? findFirst(rPrDefault, ["w:rPr", "rPr"])
    : null;
  const pPrDefault = findFirst(docDefaults, ["w:pPrDefault", "pPrDefault"]);
  const pPr = pPrDefault
    ? findFirst(pPrDefault, ["w:pPr", "pPr"])
    : null;

  defaults.run = parseRunStyleElement(rPr);
  defaults.paragraph = parseParagraphStyleElement(pPr);
  return defaults;
}

function findFirst(
  root: ParentNode,
  tags: string[],
): Element | null {
  for (const tag of tags) {
    const match = (root as Document).getElementsByTagName
      ? (root as Document).getElementsByTagName(tag)[0]
      : (root as Element).getElementsByTagName(tag)[0];
    if (match) {
      return match;
    }
  }
  return null;
}

function extractVal(root: ParentNode, ...tags: string[]): string | null {
  const node = findFirst(root, tags);
  if (!node) return null;
  return node.getAttribute("w:val") ?? node.getAttribute("val");
}

function parseParagraphStyleElement(
  element: Element | null,
): DocxParagraphStyle | undefined {
  if (!element) return undefined;
  const style: DocxParagraphStyle = {};

  const alignmentNode = findFirst(element, ["w:jc", "jc"]);
  const rawAlign =
    alignmentNode?.getAttribute("w:val") ??
    alignmentNode?.getAttribute("val");
  const alignment = parseAlignment(rawAlign);
  if (alignment) {
    style.alignment = alignment;
  }

  const spacingNode = findFirst(element, ["w:spacing", "spacing"]);
  if (spacingNode) {
    const before = parseTwipAttribute(spacingNode, "before");
    if (before !== null) {
      style.spacingBeforePt = before;
    }

    const after = parseTwipAttribute(spacingNode, "after");
    if (after !== null) {
      style.spacingAfterPt = after;
    }

    const lineRaw =
      spacingNode.getAttribute("w:line") ??
      spacingNode.getAttribute("line");
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

  const indentNode = findFirst(element, ["w:ind", "ind"]);
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

  const tabsNode = findFirst(element, ["w:tabs", "tabs"]);
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

function parseRunStyleElement(element: Element | null): DocxRunStyle | undefined {
  if (!element) return undefined;
  const style: DocxRunStyle = {};

  const rFonts = findFirst(element, ["w:rFonts", "rFonts"]);
  if (rFonts) {
    const ascii = rFonts.getAttribute("w:ascii") ?? rFonts.getAttribute("ascii");
    const eastAsia =
      rFonts.getAttribute("w:eastAsia") ?? rFonts.getAttribute("eastAsia");
    const font = ascii || eastAsia;
    if (font) {
      style.font = font;
    }
  }

  const sizeNode = findFirst(element, ["w:sz", "sz"]);
  if (sizeNode) {
    const raw = sizeNode.getAttribute("w:val") ?? sizeNode.getAttribute("val");
    const sizeHalfPoints = raw ? Number.parseFloat(raw) : Number.NaN;
    if (Number.isFinite(sizeHalfPoints)) {
      style.sizePt = sizeHalfPoints / 2;
    }
  }

  const boldNode = findFirst(element, ["w:b", "b"]);
  if (boldNode) {
    const raw = boldNode.getAttribute("w:val") ?? boldNode.getAttribute("val");
    if (!raw || raw === "1" || raw.toLowerCase() === "true") {
      style.bold = true;
    }
  }

  const italicNode = findFirst(element, ["w:i", "i"]);
  if (italicNode) {
    const raw = italicNode.getAttribute("w:val") ?? italicNode.getAttribute("val");
    if (!raw || raw === "1" || raw.toLowerCase() === "true") {
      style.italic = true;
    }
  }

  const underlineNode = findFirst(element, ["w:u", "u"]);
  if (underlineNode) {
    const raw = underlineNode.getAttribute("w:val") ?? underlineNode.getAttribute("val");
    if (raw && raw.toLowerCase() !== "none") {
      style.underline = true;
    }
  }

  const strikeNode =
    findFirst(element, ["w:strike", "strike"]) ??
    findFirst(element, ["w:dstrike", "dstrike"]);
  if (strikeNode) {
    const raw = strikeNode.getAttribute("w:val") ?? strikeNode.getAttribute("val");
    if (!raw || raw === "1" || raw.toLowerCase() === "true") {
      style.strikethrough = true;
    }
  }

  return Object.keys(style).length > 0 ? style : undefined;
}

function parseAlignment(
  value?: string | null,
): DocxParagraphStyle["alignment"] {
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
  const raw = node.getAttribute(`w:${name}`) ?? node.getAttribute(name);
  if (!raw) return null;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return null;
  return value / 20;
}
