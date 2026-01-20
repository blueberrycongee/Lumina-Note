import { typesettingAiSchema, TypesettingAiInstruction } from "./aiSchema";

export const defaultAiInstruction: TypesettingAiInstruction = {
  page: {
    size: "A4",
    margin: "25mm",
    headerHeight: "12mm",
    footerHeight: "12mm",
  },
  typography: {
    zh: { font: "SimSun", size: "12pt" },
    en: { font: "Times New Roman", size: "12pt" },
  },
  paragraph: {
    lineHeight: 1.5,
    indent: "2em",
    align: "justify",
  },
};

const lengthUnits = ["mm", "cm", "in", "pt", "px", "em", "rem"] as const;
type LengthUnit = (typeof lengthUnits)[number];

function cloneDefaults(): TypesettingAiInstruction {
  return {
    page: { ...defaultAiInstruction.page },
    typography: {
      zh: { ...defaultAiInstruction.typography.zh },
      en: { ...defaultAiInstruction.typography.en },
    },
    paragraph: { ...defaultAiInstruction.paragraph },
  };
}

function parseLengthAfter(prompt: string, keyword: string): string | undefined {
  const pattern = new RegExp(
    `${keyword}\\s+(\\d+(?:\\.\\d+)?)(mm|cm|in|pt|px|em|rem)`,
    "i",
  );
  const match = prompt.match(pattern);
  if (!match) {
    return undefined;
  }
  return `${match[1]}${match[2]}`;
}

function parseLineHeight(prompt: string): number | undefined {
  const match = prompt.match(/line[-\s]*height\s+(\d+(?:\.\d+)?)/i);
  if (!match) {
    return undefined;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function normalizeFontName(name: string): string {
  return name.replace(/\\s+/g, " ").replace(/["']/g, "").trim();
}

function parseFontSpec(
  prompt: string,
  label: "Chinese" | "English",
): { font: string; size: string } | undefined {
  const pattern = new RegExp(
    `${label}\\s+(?:font\\s+)?(.+?)\\s+(\\d+(?:\\.\\d+)?)pt`,
    "i",
  );
  const match = prompt.match(pattern);
  if (!match) {
    return undefined;
  }
  return {
    font: normalizeFontName(match[1]),
    size: `${match[2]}pt`,
  };
}

function parseIndent(prompt: string): string | undefined {
  const match = prompt.match(
    /first[-\s]?line\s+indent\s+(\d+(?:\.\d+)?)(?:\s*(characters?|chars?|em|mm|cm|in|pt|px|rem))?/i,
  );
  if (!match) {
    return undefined;
  }
  const value = match[1];
  const rawUnit = (match[2] || "em").toLowerCase();
  if (rawUnit.startsWith("char")) {
    return `${value}em`;
  }
  if ((lengthUnits as readonly string[]).includes(rawUnit)) {
    return `${value}${rawUnit as LengthUnit}`;
  }
  return `${value}em`;
}

function parseAlign(prompt: string): TypesettingAiInstruction["paragraph"]["align"] | undefined {
  const lower = prompt.toLowerCase();
  if (lower.includes("justify")) {
    return "justify";
  }
  if (lower.includes("center")) {
    return "center";
  }
  if (lower.includes("left")) {
    return "left";
  }
  if (lower.includes("right")) {
    return "right";
  }
  return undefined;
}

function parsePageSize(prompt: string): TypesettingAiInstruction["page"]["size"] | undefined {
  if (/\bA4\b/i.test(prompt)) {
    return "A4";
  }
  if (/\bLetter\b/i.test(prompt)) {
    return "Letter";
  }
  if (/\bCustom\b/i.test(prompt)) {
    return "Custom";
  }
  return undefined;
}

export function parseAiPromptToSchema(prompt: string): TypesettingAiInstruction {
  const text = prompt ?? "";
  const result = cloneDefaults();

  const size = parsePageSize(text);
  if (size) {
    result.page.size = size;
  }

  const margin = parseLengthAfter(text, "margin") ?? parseLengthAfter(text, "margins");
  if (margin) {
    result.page.margin = margin;
  }

  const header = parseLengthAfter(text, "header");
  if (header) {
    result.page.headerHeight = header;
  }

  const footer = parseLengthAfter(text, "footer");
  if (footer) {
    result.page.footerHeight = footer;
  }

  const zhFont = parseFontSpec(text, "Chinese");
  if (zhFont) {
    result.typography.zh = zhFont;
  }

  const enFont = parseFontSpec(text, "English");
  if (enFont) {
    result.typography.en = enFont;
  }

  const lineHeight = parseLineHeight(text);
  if (lineHeight !== undefined) {
    result.paragraph.lineHeight = lineHeight;
  }

  const indent = parseIndent(text);
  if (indent) {
    result.paragraph.indent = indent;
  }

  const align = parseAlign(text);
  if (align) {
    result.paragraph.align = align;
  }

  return typesettingAiSchema.parse(result);
}
