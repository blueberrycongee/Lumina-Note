import { exists } from "@tauri-apps/plugin-fs";
import {
  TypesettingPreviewBoxMm,
  TypesettingTextLine,
} from "@/lib/tauri";
import { encodeBytesToBase64 } from "@/typesetting/base64";
import {
  docxBlocksToFontSizePx,
  docxBlocksToLineHeightPx,
  docxBlocksToLayoutTextOptions,
  docxBlocksToPlainText,
  DOCX_IMAGE_PLACEHOLDER,
} from "@/typesetting/docxText";
import { sliceUtf8 } from "@/typesetting/utf8";
import type { TypesettingDoc } from "@/stores/useTypesettingDocStore";
import type {
  DocxBlock,
  DocxImageBlock,
  DocxListBlock,
  DocxParagraphStyle,
  DocxRun,
  DocxTableBlock,
} from "@/typesetting/docxImport";

// ─── Constants ───────────────────────────────────────────────────────────

export const DEFAULT_DPI = 96;
export const DEFAULT_FONT_SIZE_PX = 16;
export const DEFAULT_LINE_HEIGHT_PX = 20;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2;
export const ZOOM_STEP = 0.1;
export const EMU_PER_INCH = 914400;

// ─── Types ───────────────────────────────────────────────────────────────

export type LayoutRender = {
  text: string;
  fontSizePx: number;
  lineHeightPx: number;
  lines: TypesettingTextLine[];
};

export type RenderedLine = {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSizePx?: number;
  lineHeightPx?: number;
  underline?: boolean;
};

export type RenderedImage = {
  src: string;
  alt: string;
  x: number;
  y: number;
  width: number;
  height: number;
  embedId: string;
};

export type ParagraphSegment = {
  text: string;
  options: ReturnType<typeof docxBlocksToLayoutTextOptions>;
  lineHeightPx: number;
  fontSizePx: number;
  fontFamily?: string;
  underline: boolean;
};

// ─── Unit conversions ────────────────────────────────────────────────────

export const mmToPx = (mm: number, dpi = DEFAULT_DPI) =>
  Math.round((Math.max(0, mm) * dpi) / 25.4);

export const pxToMm = (px: number, dpi = DEFAULT_DPI) =>
  (px * 25.4) / dpi;

export const pxToPt = (px: number, dpi = DEFAULT_DPI) =>
  (px * 72) / dpi;

export const boxToPx = (box: TypesettingPreviewBoxMm) => ({
  left: mmToPx(box.x_mm),
  top: mmToPx(box.y_mm),
  width: mmToPx(box.width_mm),
  height: mmToPx(box.height_mm),
});

// ─── Zoom helpers ────────────────────────────────────────────────────────

export const clampZoom = (value: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

export const roundZoom = (value: number) => Math.round(value * 100) / 100;

export const scalePx = (value: number, zoom: number) => Math.round(value * zoom);

export const scaleBoxPx = (
  box: ReturnType<typeof boxToPx>,
  zoom: number,
) => ({
  left: scalePx(box.left, zoom),
  top: scalePx(box.top, zoom),
  width: scalePx(box.width, zoom),
  height: scalePx(box.height, zoom),
});

// ─── Font / line helpers ─────────────────────────────────────────────────

export const defaultLineHeightForFont = (fontSizePx: number) =>
  Math.max(1, Math.round(fontSizePx * 1.3));

export const ensurePositivePx = (value: number, fallback: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return Math.max(1, Math.round(fallback));
  }
  return Math.max(1, Math.round(value));
};

export const stripImagePlaceholder = (value: string) =>
  value.split(DOCX_IMAGE_PLACEHOLDER).join("");

// ─── Line rendering ─────────────────────────────────────────────────────

export const buildRenderedLines = (
  text: string,
  lines: TypesettingTextLine[],
  lineStyles?: Array<{ fontSizePx: number; lineHeightPx: number; underline: boolean }>,
): RenderedLine[] => {
  if (!text || lines.length === 0) return [];
  const rendered: RenderedLine[] = [];
  for (const [index, line] of lines.entries()) {
    const raw = sliceUtf8(text, line.start_byte, line.end_byte);
    if (!raw) continue;
    const cleaned = stripImagePlaceholder(raw);
    if (!cleaned && raw.includes(DOCX_IMAGE_PLACEHOLDER)) {
      continue;
    }
    const style = lineStyles?.[index];
    rendered.push({
      text: cleaned,
      x: line.x_offset,
      y: line.y_offset,
      width: line.width,
      fontSizePx: style?.fontSizePx,
      lineHeightPx: style?.lineHeightPx,
      underline: style?.underline,
    });
  }
  return rendered;
};

// ─── Image helpers ───────────────────────────────────────────────────────

export const collectImageBlocks = (blocks: DocxBlock[]): DocxImageBlock[] => {
  const images: DocxImageBlock[] = [];
  for (const block of blocks) {
    if (block.type === "image") {
      images.push(block);
      continue;
    }
    if (block.type === "table") {
      for (const row of block.rows) {
        for (const cell of row.cells) {
          images.push(...collectImageBlocks(cell.blocks));
        }
      }
    }
  }
  return images;
};

export const emuToPx = (emu: number, dpi = DEFAULT_DPI): number => {
  if (!Number.isFinite(emu) || emu <= 0) return 0;
  const px = (emu / EMU_PER_INCH) * dpi;
  return Math.max(1, Math.round(px));
};

export const imageBlockSizePx = (
  block: DocxImageBlock,
  fallbackPx: number,
): { width: number; height: number } => {
  const width = block.widthEmu ? emuToPx(block.widthEmu) : 0;
  const height = block.heightEmu ? emuToPx(block.heightEmu) : 0;
  return {
    width: width > 0 ? width : Math.max(1, fallbackPx),
    height: height > 0 ? height : Math.max(1, fallbackPx),
  };
};

export const buildRenderedImages = (
  layout: LayoutRender | null,
  blocks: DocxBlock[],
  resolveImage?: (embedId: string) => { src: string; alt?: string } | null,
): RenderedImage[] => {
  if (!layout || !resolveImage) return [];
  const images = collectImageBlocks(blocks);
  if (images.length === 0) return [];
  let imageIndex = 0;
  const rendered: RenderedImage[] = [];
  for (const line of layout.lines) {
    if (imageIndex >= images.length) break;
    const lineText = sliceUtf8(layout.text, line.start_byte, line.end_byte);
    if (!lineText.includes(DOCX_IMAGE_PLACEHOLDER)) {
      continue;
    }
    const image = images[imageIndex];
    imageIndex += 1;
    const resolved = resolveImage(image.embedId);
    if (!resolved?.src) {
      continue;
    }
    const size = imageBlockSizePx(image, layout.lineHeightPx);
    rendered.push({
      src: resolved.src,
      alt: resolved.alt ?? image.description ?? image.embedId,
      x: line.x_offset,
      y: line.y_offset,
      width: size.width,
      height: size.height,
      embedId: image.embedId,
    });
  }
  return rendered;
};

export const imageMimeType = (path: string): string | null => {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    default:
      return null;
  }
};

export const findFirstExistingFontPath = async (
  candidates: string[],
): Promise<string | null> => {
  for (const candidatePath of candidates) {
    try {
      if (await exists(candidatePath)) {
        return candidatePath;
      }
    } catch {
      // If scope blocks exists(), still try the candidate as a fallback.
      return candidatePath;
    }
  }
  return null;
};

export const resolveDocxImage = (
  doc: TypesettingDoc,
  embedId: string,
): { src: string; alt?: string } | null => {
  const target = doc.relationships[embedId];
  if (!target) return null;
  const normalized = target
    .replace(/^[\\/]+/, "")
    .replace(/^(\.\.\/)+/, "");
  const mediaPath = normalized.startsWith("word/")
    ? normalized
    : `word/${normalized}`;
  const bytes = doc.media[mediaPath];
  if (!bytes) return null;
  const mime = imageMimeType(mediaPath);
  if (!mime) return null;
  const base64 = encodeBytesToBase64(bytes);
  return { src: `data:${mime};base64,${base64}`, alt: embedId };
};

export const getUtf8ByteLength = (value: string): number =>
  new TextEncoder().encode(value).length;

// ─── Text / tab expansion ────────────────────────────────────────────────

export const joinRunsText = (runs: DocxRun[]) => runs.map((run) => run.text).join("");

let tabMeasureCanvas: HTMLCanvasElement | null = null;

const getTabMeasureContext = (): CanvasRenderingContext2D | null => {
  if (typeof document === "undefined") return null;
  if (!tabMeasureCanvas) {
    tabMeasureCanvas = document.createElement("canvas");
  }
  try {
    return tabMeasureCanvas.getContext("2d");
  } catch {
    return null;
  }
};

export const expandTabs = (
  text: string,
  options: ReturnType<typeof docxBlocksToLayoutTextOptions>,
  fontSizePx: number,
  fontFamily?: string,
): string => {
  if (!text.includes("\t")) return text;
  const ctx = getTabMeasureContext();
  if (!ctx) return text.replace(/\t/g, "    ");

  ctx.font = `${fontSizePx}px ${fontFamily ?? "sans-serif"}`;
  const spaceWidth = Math.max(1, ctx.measureText(" ").width || fontSizePx * 0.5);
  const tabStops = options.tabStopsPx ?? [];
  const defaultTabStop = options.defaultTabStopPx > 0
    ? options.defaultTabStopPx
    : Math.max(1, Math.round(fontSizePx * 4));

  let lineIndex = 0;
  let lineWidth = 0;
  let output = "";

  for (const ch of text) {
    if (ch === "\n") {
      output += ch;
      lineIndex += 1;
      lineWidth = 0;
      continue;
    }

    if (ch === "\t") {
      const indent = options.leftIndentPx
        + (lineIndex === 0 ? options.firstLineIndentPx : 0);
      const absoluteWidth = indent + lineWidth;
      let targetAbs: number | undefined;
      for (const stop of tabStops) {
        if (stop > absoluteWidth) {
          targetAbs = stop;
          break;
        }
      }
      if (targetAbs === undefined) {
        targetAbs = Math.ceil(absoluteWidth / defaultTabStop) * defaultTabStop;
      }
      const targetRel = Math.max(0, targetAbs - indent);
      const delta = Math.max(0, targetRel - lineWidth);
      const spaces = Math.max(1, Math.round(delta / spaceWidth));
      output += " ".repeat(spaces);
      lineWidth = targetRel;
      continue;
    }

    output += ch;
    lineWidth += ctx.measureText(ch).width;
  }

  return output;
};

// ─── Font family extraction ──────────────────────────────────────────────

export const firstRunFontFamilyFromRuns = (runs: DocxRun[]): string | undefined =>
  runs.find((run) => run.style?.font)?.style?.font;

export const firstRunFontFamilyFromBlocks = (blocks: DocxBlock[]): string | undefined => {
  for (const block of blocks) {
    switch (block.type) {
      case "paragraph":
      case "heading": {
        const font = firstRunFontFamilyFromRuns(block.runs);
        if (font) return font;
        break;
      }
      case "list": {
        for (const item of block.items) {
          const font = firstRunFontFamilyFromRuns(item.runs);
          if (font) return font;
        }
        break;
      }
      case "table":
        for (const row of block.rows) {
          for (const cell of row.cells) {
            const font = firstRunFontFamilyFromBlocks(cell.blocks);
            if (font) return font;
          }
        }
        break;
      default:
        break;
    }
  }
  return undefined;
};

// ─── Segment builders ────────────────────────────────────────────────────

export const buildParagraphSegment = (
  runs: DocxRun[],
  paragraphStyle: DocxParagraphStyle | undefined,
  defaultFontSizePx: number,
  _defaultLineHeightPx: number,
  dpi: number,
): ParagraphSegment => {
  const block: DocxBlock = {
    type: "paragraph",
    runs,
    paragraphStyle,
  };
  const text = joinRunsText(runs) || " ";
  const underline = runs.some((run) => run.style?.underline);
  const fontSizePx = docxBlocksToFontSizePx([block], defaultFontSizePx, dpi);
  const lineHeightPx = docxBlocksToLineHeightPx(
    [block],
    defaultLineHeightForFont(fontSizePx),
    dpi,
  );
  return {
    text,
    options: docxBlocksToLayoutTextOptions([block], dpi),
    lineHeightPx,
    fontSizePx,
    fontFamily: firstRunFontFamilyFromRuns(runs),
    underline,
  };
};

export const buildSegmentsFromList = (
  block: DocxListBlock,
  defaultFontSizePx: number,
  _defaultLineHeightPx: number,
  dpi: number,
): ParagraphSegment[] =>
  block.items.map((item) =>
    buildParagraphSegment(
      item.runs,
      item.paragraphStyle,
      defaultFontSizePx,
      _defaultLineHeightPx,
      dpi,
    ),
  );

export const buildSegmentsFromTable = (
  block: DocxTableBlock,
  defaultFontSizePx: number,
  _defaultLineHeightPx: number,
  dpi: number,
): ParagraphSegment[] => {
  const styleBlock: DocxBlock = block;
  const options = docxBlocksToLayoutTextOptions([styleBlock], dpi);
  const fontSizePx = docxBlocksToFontSizePx([styleBlock], defaultFontSizePx, dpi);
  const lineHeightPx = docxBlocksToLineHeightPx(
    [styleBlock],
    defaultLineHeightForFont(fontSizePx),
    dpi,
  );
  const fontFamily = firstRunFontFamilyFromBlocks([block]);
  return block.rows.map((row) => {
    const rowText = row.cells
      .map((cell) => docxBlocksToPlainText(cell.blocks).replace(/\n+/g, " ").trim())
      .join("\t");
    return {
      text: rowText || " ",
      options,
      lineHeightPx,
      fontSizePx,
      fontFamily,
      underline: false,
    };
  });
};

export const buildSegmentsFromBlocks = (
  blocks: DocxBlock[],
  defaultFontSizePx: number,
  defaultLineHeightPx: number,
  dpi: number,
): ParagraphSegment[] => {
  const segments: ParagraphSegment[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "paragraph":
      case "heading":
        segments.push(
          buildParagraphSegment(
            block.runs,
            block.paragraphStyle,
            defaultFontSizePx,
            defaultLineHeightPx,
            dpi,
          ),
        );
        break;
      case "list":
        segments.push(
          ...buildSegmentsFromList(
            block,
            defaultFontSizePx,
            defaultLineHeightPx,
            dpi,
          ),
        );
        break;
      case "table":
        segments.push(
          ...buildSegmentsFromTable(
            block,
            defaultFontSizePx,
            defaultLineHeightPx,
            dpi,
          ),
        );
        break;
      case "image": {
        const size = imageBlockSizePx(block, defaultLineHeightPx);
        segments.push({
          text: DOCX_IMAGE_PLACEHOLDER,
          options: docxBlocksToLayoutTextOptions([block], dpi),
          lineHeightPx: Math.max(defaultLineHeightPx, size.height),
          fontSizePx: defaultFontSizePx,
          underline: false,
        });
        break;
      }
      default:
        break;
    }
  }
  return segments;
};
