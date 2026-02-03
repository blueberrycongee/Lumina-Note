import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { exists, writeFile } from "@tauri-apps/plugin-fs";
import { homeDir, join, tempDir } from "@tauri-apps/api/path";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { platform } from "@tauri-apps/plugin-os";
import { useTypesettingDocStore } from "@/stores/useTypesettingDocStore";
import { useFileStore } from "@/stores/useFileStore";
import {
  getTypesettingExportPdfBase64,
  getTypesettingFixtureFontPath,
  getTypesettingLayoutText,
  getTypesettingPreviewPageMm,
  getTypesettingRenderDocxPdfBase64,
  isTauriAvailable,
  TypesettingPreviewBoxMm,
  TypesettingPreviewPageMm,
  TypesettingTextLine,
} from "@/lib/tauri";
import { PDFCanvas } from "@/components/pdf/PDFCanvas";
import { decodeBase64ToBytes, encodeBytesToBase64 } from "@/typesetting/base64";
import { docxBlocksToHtml, docxHtmlToBlocks } from "@/typesetting/docxHtml";
import {
  docxBlocksToFontSizePx,
  docxBlocksToLineHeightPx,
  docxBlocksToLayoutTextOptions,
  docxBlocksToPlainText,
  DOCX_IMAGE_PLACEHOLDER,
} from "@/typesetting/docxText";
import { buildPreviewPageMmFromDocx, getDefaultPreviewPageMm } from "@/typesetting/previewDefaults";
import { docOpFromBeforeInput } from "@/typesetting/docOps";
import { sliceUtf8 } from "@/typesetting/utf8";
import {
  buildFallbackFontCandidates,
  buildFamilyFontCandidates,
  normalizeFontFamily,
  osKindFromPlatform,
  OsKind,
} from "@/typesetting/fontPaths";
import type { TypesettingDoc } from "@/stores/useTypesettingDocStore";
import type {
  DocxBlock,
  DocxImageBlock,
  DocxListBlock,
  DocxPageStyle,
  DocxParagraphStyle,
  DocxRun,
  DocxTableBlock,
} from "@/typesetting/docxImport";

declare global {
  interface Window {
    __luminaTypesettingFont?: {
      name: string;
      fileName: string;
      data: string;
    };
    __luminaTypesettingLayout?: {
      docPath: string;
      updatedAt: string;
      totalPages?: number;
      pageMm?: TypesettingPreviewPageMm | null;
      pageStyle?: DocxPageStyle;
      contentHeightPx?: number;
      lineCount?: number;
      body?: {
        text: string;
        fontSizePx: number;
        lineHeightPx: number;
        lines: TypesettingTextLine[];
        lineStyles: Array<{ fontSizePx: number; lineHeightPx: number; underline: boolean }>;
        linePages?: number[];
      } | null;
      header?: {
        text: string;
        fontSizePx: number;
        lineHeightPx: number;
        lines: TypesettingTextLine[];
      } | null;
      footer?: {
        text: string;
        fontSizePx: number;
        lineHeightPx: number;
        lines: TypesettingTextLine[];
      } | null;
    };
  }
}

type TypesettingDocumentPaneProps = {
  path: string;
  onExportReady?: ((exporter: (() => Promise<Uint8Array>) | null) => void) | null;
  autoOpen?: boolean;
};

const DEFAULT_DPI = 96;
const DEFAULT_FONT_SIZE_PX = 16;
const DEFAULT_LINE_HEIGHT_PX = 20;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;
const EMU_PER_INCH = 914400;

type LayoutRender = {
  text: string;
  fontSizePx: number;
  lineHeightPx: number;
  lines: TypesettingTextLine[];
};

type RenderedLine = {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSizePx?: number;
  lineHeightPx?: number;
  underline?: boolean;
};

type RenderedImage = {
  src: string;
  alt: string;
  x: number;
  y: number;
  width: number;
  height: number;
  embedId: string;
};

const mmToPx = (mm: number, dpi = DEFAULT_DPI) =>
  Math.round((Math.max(0, mm) * dpi) / 25.4);

const pxToMm = (px: number, dpi = DEFAULT_DPI) =>
  (px * 25.4) / dpi;

const pxToPt = (px: number, dpi = DEFAULT_DPI) =>
  (px * 72) / dpi;

const boxToPx = (box: TypesettingPreviewBoxMm) => ({
  left: mmToPx(box.x_mm),
  top: mmToPx(box.y_mm),
  width: mmToPx(box.width_mm),
  height: mmToPx(box.height_mm),
});

const clampZoom = (value: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

const roundZoom = (value: number) => Math.round(value * 100) / 100;

const scalePx = (value: number, zoom: number) => Math.round(value * zoom);

const scaleBoxPx = (
  box: ReturnType<typeof boxToPx>,
  zoom: number,
) => ({
  left: scalePx(box.left, zoom),
  top: scalePx(box.top, zoom),
  width: scalePx(box.width, zoom),
  height: scalePx(box.height, zoom),
});

const defaultLineHeightForFont = (fontSizePx: number) =>
  Math.max(1, Math.round(fontSizePx * 1.3));

const ensurePositivePx = (value: number, fallback: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return Math.max(1, Math.round(fallback));
  }
  return Math.max(1, Math.round(value));
};

const stripImagePlaceholder = (value: string) =>
  value.split(DOCX_IMAGE_PLACEHOLDER).join("");

const buildRenderedLines = (
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

const collectImageBlocks = (blocks: DocxBlock[]): DocxImageBlock[] => {
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

const emuToPx = (emu: number, dpi = DEFAULT_DPI): number => {
  if (!Number.isFinite(emu) || emu <= 0) return 0;
  const px = (emu / EMU_PER_INCH) * dpi;
  return Math.max(1, Math.round(px));
};

const imageBlockSizePx = (
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

const buildRenderedImages = (
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

const imageMimeType = (path: string): string | null => {
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

const findFirstExistingFontPath = async (
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

const resolveDocxImage = (
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

const getUtf8ByteLength = (value: string): number =>
  new TextEncoder().encode(value).length;

type ParagraphSegment = {
  text: string;
  options: ReturnType<typeof docxBlocksToLayoutTextOptions>;
  lineHeightPx: number;
  fontSizePx: number;
  fontFamily?: string;
  underline: boolean;
};

const joinRunsText = (runs: DocxRun[]) => runs.map((run) => run.text).join("");

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

const expandTabs = (
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

const firstRunFontFamilyFromRuns = (runs: DocxRun[]): string | undefined =>
  runs.find((run) => run.style?.font)?.style?.font;

const firstRunFontFamilyFromBlocks = (blocks: DocxBlock[]): string | undefined => {
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

const buildParagraphSegment = (
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

const buildSegmentsFromList = (
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

const buildSegmentsFromTable = (
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

const buildSegmentsFromBlocks = (
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

export function TypesettingDocumentPane({ path, onExportReady, autoOpen = true }: TypesettingDocumentPaneProps) {
  const tauriAvailable = isTauriAvailable();
  const { save: saveActiveFile, markTypesettingTabDirty } = useFileStore();
  const {
    docs,
    openDoc,
    updateDocBlocks,
    updateLayoutSummary,
    updateLayoutCache,
    recordDocOp,
    exportDocx,
  } = useTypesettingDocStore();
  const doc = docs[path];
  const [error, setError] = useState<string | null>(null);
  const [pageMm, setPageMm] = useState<TypesettingPreviewPageMm | null>(null);
  const [zoom, setZoom] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [exportDocxError, setExportDocxError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [openOfficePreview, setOpenOfficePreview] = useState(false);
  const [openOfficePdf, setOpenOfficePdf] = useState<Uint8Array | null>(null);
  const [openOfficeError, setOpenOfficeError] = useState<string | null>(null);
  const [openOfficeLoading, setOpenOfficeLoading] = useState(false);
  const [openOfficeTotalPages, setOpenOfficeTotalPages] = useState(0);
  const [openOfficeStale, setOpenOfficeStale] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [bodyLayout, setBodyLayout] = useState<LayoutRender | null>(null);
  const [headerLayout, setHeaderLayout] = useState<LayoutRender | null>(null);
  const [footerLayout, setFooterLayout] = useState<LayoutRender | null>(null);
  const [bodyLineStyles, setBodyLineStyles] = useState<Array<{
    fontSizePx: number;
    lineHeightPx: number;
    underline: boolean;
  }>>([]);
  const [fallbackContentHeightPx, setFallbackContentHeightPx] = useState<number | null>(null);
  const [pageMounted, setPageMounted] = useState(false);
  const editableRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const fontPathCache = useRef(new Map<string, string>());
  const layoutRunRef = useRef(0);
  const osContextRef = useRef<Promise<{ os: OsKind; homeDir?: string }> | null>(null);
  const exportReady = Boolean(pageMm && pageMounted);

  const handlePageRef = useCallback((node: HTMLDivElement | null) => {
    pageRef.current = node;
    setPageMounted(Boolean(node));
  }, []);

  useEffect(() => {
    if (!autoOpen) return;
    if (doc) return;
    openDoc(path).catch((err) => setError(String(err)));
  }, [autoOpen, doc, openDoc, path]);

  useEffect(() => {
    if (doc && error) {
      setError(null);
    }
  }, [doc, error]);

  useEffect(() => {
    let active = true;
    if (doc?.pageStyle) {
      setPageMm(buildPreviewPageMmFromDocx(doc.pageStyle));
      return () => {
        active = false;
      };
    }
    getTypesettingPreviewPageMm()
      .then((data) => {
        if (active) {
          setPageMm(data);
        }
      })
      .catch((err) => {
        if (active) {
          console.warn("Typesetting preview fallback:", err);
          setPageMm(getDefaultPreviewPageMm());
        }
      });
    return () => {
      active = false;
    };
  }, [doc?.pageStyle]);

  const getOsContext = async (): Promise<{ os: OsKind; homeDir?: string }> => {
    if (!osContextRef.current) {
      osContextRef.current = (async () => {
        let os: OsKind = "unknown";
        try {
          os = osKindFromPlatform(await platform());
        } catch {
          // Ignore platform detection errors.
        }
        if (os === "unknown" && typeof navigator !== "undefined") {
          const ua = navigator.userAgent.toLowerCase();
          if (ua.includes("mac")) os = "macos";
          else if (ua.includes("win")) os = "windows";
          else if (ua.includes("linux")) os = "linux";
        }

        let resolvedHome: string | undefined;
        if (tauriAvailable) {
          try {
            resolvedHome = await homeDir();
          } catch {
            // Ignore home dir errors; fallback paths will skip HOME entries.
          }
        }
        return { os, homeDir: resolvedHome };
      })();
    }
    return osContextRef.current;
  };

  const findFallbackFontPath = async (): Promise<string | null> => {
    const { os, homeDir } = await getOsContext();
    const candidates = buildFallbackFontCandidates(os, homeDir);
    return findFirstExistingFontPath(candidates);
  };

  const resolveFontPath = async (
    family: string | undefined,
    fallbackPath: string,
  ): Promise<string> => {
    if (!tauriAvailable) return fallbackPath;
    if (!family) return fallbackPath;
    const normalized = normalizeFontFamily(family);
    const cached = fontPathCache.current.get(normalized);
    if (cached) {
      return cached;
    }
    const { os, homeDir } = await getOsContext();
    const candidates = buildFamilyFontCandidates(family, os, homeDir);
    const resolved = (await findFirstExistingFontPath(candidates)) ?? fallbackPath;
    fontPathCache.current.set(normalized, resolved);
    return resolved;
  };

  useEffect(() => {
    if (!doc || !pageMm) {
      setBodyLayout(null);
      setHeaderLayout(null);
      setFooterLayout(null);
      setBodyLineStyles([]);
      return;
    }
    setLayoutError(null);

    const segments = buildSegmentsFromBlocks(
      doc.blocks,
      DEFAULT_FONT_SIZE_PX,
      DEFAULT_LINE_HEIGHT_PX,
      DEFAULT_DPI,
    );
    const headerText = docxBlocksToPlainText(doc.headerBlocks);
    const footerText = docxBlocksToPlainText(doc.footerBlocks);
    const headerUsesEngine = headerText.trim().length > 0;
    const footerUsesEngine = footerText.trim().length > 0;

    if (!headerUsesEngine) {
      setHeaderLayout(null);
    }
    if (!footerUsesEngine) {
      setFooterLayout(null);
    }

    const runId = ++layoutRunRef.current;
    const handler = setTimeout(async () => {
    let fontPath: string | null = null;
    const fallbackPage = getDefaultPreviewPageMm();
    const baseBodyWidthPx = ensurePositivePx(
      mmToPx(pageMm.body.width_mm),
      mmToPx(fallbackPage.body.width_mm),
    );
    const baseHeaderWidthPx = ensurePositivePx(
      mmToPx(pageMm.header.width_mm),
      mmToPx(fallbackPage.header.width_mm),
    );
    const baseFooterWidthPx = ensurePositivePx(
      mmToPx(pageMm.footer.width_mm),
      mmToPx(fallbackPage.footer.width_mm),
    );
    if (tauriAvailable) {
      try {
        fontPath = await getTypesettingFixtureFontPath();
      } catch (err) {
        const reason = String(err);
        setLayoutError(reason);
        updateLayoutSummary(path, `Layout unavailable: ${reason}`);
        setBodyLayout(null);
        setHeaderLayout(null);
        setFooterLayout(null);
        setBodyLineStyles([]);
        return;
      }
      if (layoutRunRef.current !== runId) return;
      if (!fontPath) {
        fontPath = await findFallbackFontPath();
        if (layoutRunRef.current !== runId) return;
        if (!fontPath) {
          const reason = "missing fixture font and no system fallback found";
          setLayoutError(reason);
          updateLayoutSummary(path, `Layout unavailable: ${reason}`);
          setBodyLayout(null);
          setHeaderLayout(null);
          setFooterLayout(null);
          setBodyLineStyles([]);
          return;
        }
      }
    }
    try {
      const headerFontFamily = firstRunFontFamilyFromBlocks(doc.headerBlocks);
      const footerFontFamily = firstRunFontFamilyFromBlocks(doc.footerBlocks);
      const resolvedHeaderFontPath = await resolveFontPath(headerFontFamily, fontPath ?? "");
      const resolvedFooterFontPath = await resolveFontPath(footerFontFamily, fontPath ?? "");

        const buildHeaderFooterLayout = async (
          blocks: DocxBlock[],
          content: string,
          maxWidthMm: number,
          fontPathOverride: string,
          fontFamilyOverride?: string,
        ): Promise<LayoutRender> => {
          const fontSize = docxBlocksToFontSizePx(
            blocks,
            DEFAULT_FONT_SIZE_PX,
            DEFAULT_DPI,
          );
          const lineHeight = docxBlocksToLineHeightPx(
            blocks,
            defaultLineHeightForFont(fontSize),
            DEFAULT_DPI,
          );
          const options = docxBlocksToLayoutTextOptions(blocks, DEFAULT_DPI);
          const expandedText = expandTabs(
            content,
            options,
            fontSize,
            fontFamilyOverride,
          );
          const maxWidthPx = Math.max(
            1,
            ensurePositivePx(
              mmToPx(maxWidthMm),
              baseBodyWidthPx,
            ) - options.leftIndentPx - options.rightIndentPx,
          );
          const layout = await getTypesettingLayoutText({
            text: expandedText,
            fontPath: fontPathOverride,
            fontFamily: fontFamilyOverride,
            maxWidth: maxWidthPx,
            lineHeight,
            fontSize,
            align: options.align,
            firstLineIndent: options.firstLineIndentPx,
            spaceBefore: options.spaceBeforePx,
            spaceAfter: options.spaceAfterPx,
            tabStops: options.tabStopsPx,
            defaultTabStop: options.defaultTabStopPx,
          });
          const shiftedLines = layout.lines.map((line) => ({
            ...line,
            x_offset: line.x_offset + options.leftIndentPx,
          }));
          return {
            text: expandedText,
            fontSizePx: fontSize,
            lineHeightPx: lineHeight,
            lines: shiftedLines,
          };
        };

        const maxWidth = baseBodyWidthPx;
        const combinedLines: TypesettingTextLine[] = [];
        const lineStyles: Array<{ fontSizePx: number; lineHeightPx: number; underline: boolean }> = [];
        const textParts: string[] = [];
        let yOffset = 0;
        let byteOffset = 0;

        for (const segment of segments) {
          const segmentFontPath = await resolveFontPath(segment.fontFamily, fontPath ?? "");
          const expandedText = expandTabs(
            segment.text,
            segment.options,
            segment.fontSizePx,
            segment.fontFamily,
          );
          const segmentMaxWidth = Math.max(
            1,
            maxWidth - segment.options.leftIndentPx - segment.options.rightIndentPx,
          );
          const layoutData = await getTypesettingLayoutText({
            text: expandedText,
            fontPath: segmentFontPath,
            fontFamily: segment.fontFamily,
            maxWidth: segmentMaxWidth,
            lineHeight: segment.lineHeightPx,
            fontSize: segment.fontSizePx,
            align: segment.options.align,
            firstLineIndent: segment.options.firstLineIndentPx,
            spaceBefore: segment.options.spaceBeforePx,
            spaceAfter: segment.options.spaceAfterPx,
            tabStops: segment.options.tabStopsPx,
            defaultTabStop: segment.options.defaultTabStopPx,
          });
          if (layoutRunRef.current !== runId) return;

          for (const line of layoutData.lines) {
            combinedLines.push({
              ...line,
              x_offset: line.x_offset + segment.options.leftIndentPx,
              y_offset: line.y_offset + yOffset,
              start_byte: line.start_byte + byteOffset,
              end_byte: line.end_byte + byteOffset,
            });
            lineStyles.push({
              fontSizePx: segment.fontSizePx,
              lineHeightPx: segment.lineHeightPx,
              underline: segment.underline,
            });
          }

          const paragraphHeight = layoutData.lines.length > 0
            ? layoutData.lines[layoutData.lines.length - 1].y_offset
              + segment.lineHeightPx
              + segment.options.spaceAfterPx
            : segment.options.spaceBeforePx
              + segment.lineHeightPx
              + segment.options.spaceAfterPx;
          yOffset += paragraphHeight;

          textParts.push(expandedText);
          textParts.push("\n");
          byteOffset += getUtf8ByteLength(expandedText) + getUtf8ByteLength("\n");
        }

        const text = textParts.join("");
        const layoutData = { lines: combinedLines };
        const defaultFontSize = segments[0]?.fontSizePx ?? DEFAULT_FONT_SIZE_PX;
        const defaultLineHeight = segments[0]?.lineHeightPx ?? DEFAULT_LINE_HEIGHT_PX;
        if (layoutRunRef.current !== runId) return;
        setBodyLayout({
          text,
          fontSizePx: defaultFontSize,
          lineHeightPx: defaultLineHeight,
          lines: layoutData.lines,
        });
        setBodyLineStyles(lineStyles);
        const contentHeightPx = Math.max(0, yOffset);
        updateLayoutSummary(path, `Layout: ${layoutData.lines.length} lines`);
        updateLayoutCache(path, {
          lineCount: layoutData.lines.length,
          contentHeightPx,
          updatedAt: new Date().toISOString(),
        });

        const safeLayout = async (
          blocks: DocxBlock[],
          content: string,
          widthMm: number,
          enabled: boolean,
          fontPathOverride: string,
          fontFamilyOverride?: string,
        ): Promise<LayoutRender | null> => {
          if (!enabled) return null;
          try {
            return await buildHeaderFooterLayout(
              blocks,
              content,
              widthMm,
              fontPathOverride,
              fontFamilyOverride,
            );
          } catch {
            return null;
          }
        };

          const [nextHeaderLayout, nextFooterLayout] = await Promise.all([
            safeLayout(
              doc.headerBlocks,
              headerText,
              baseHeaderWidthPx ? pxToMm(baseHeaderWidthPx) : pageMm.header.width_mm,
              headerUsesEngine,
              resolvedHeaderFontPath,
              headerFontFamily,
            ),
            safeLayout(
              doc.footerBlocks,
              footerText,
              baseFooterWidthPx ? pxToMm(baseFooterWidthPx) : pageMm.footer.width_mm,
              footerUsesEngine,
              resolvedFooterFontPath,
              footerFontFamily,
            ),
          ]);
        if (layoutRunRef.current !== runId) return;
        setHeaderLayout(nextHeaderLayout);
        setFooterLayout(nextFooterLayout);
      } catch (err) {
        if (layoutRunRef.current !== runId) return;
        const reason = String(err);
        setLayoutError(reason);
        updateLayoutSummary(path, `Layout unavailable: ${reason}`);
        setBodyLayout(null);
        setHeaderLayout(null);
        setFooterLayout(null);
        setBodyLineStyles([]);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [doc, pageMm, path, updateLayoutSummary, updateLayoutCache]);

  const imageResolver = useMemo(() => {
    if (!doc) return undefined;
    return (embedId: string) => resolveDocxImage(doc, embedId);
  }, [doc]);

  const html = useMemo(() => {
    if (!doc) return "";
    return docxBlocksToHtml(doc.blocks, { imageResolver });
  }, [doc, imageResolver]);

  const headerHtml = useMemo(() => {
    if (!doc) return "";
    return docxBlocksToHtml(doc.headerBlocks, { imageResolver });
  }, [doc, imageResolver]);

  const footerHtml = useMemo(() => {
    if (!doc) return "";
    return docxBlocksToHtml(doc.footerBlocks, { imageResolver });
  }, [doc, imageResolver]);

  const headerLines = useMemo(() => {
    if (!headerLayout) return [];
    return buildRenderedLines(headerLayout.text, headerLayout.lines);
  }, [headerLayout]);

  const footerLines = useMemo(() => {
    if (!footerLayout) return [];
    return buildRenderedLines(footerLayout.text, footerLayout.lines);
  }, [footerLayout]);

  const bodyLines = useMemo(() => {
    if (!bodyLayout) return [];
    return buildRenderedLines(bodyLayout.text, bodyLayout.lines, bodyLineStyles);
  }, [bodyLayout, bodyLineStyles]);

  const bodyPageHeightPx = useMemo(() => {
    if (!pageMm) return null;
    return mmToPx(pageMm.body.height_mm);
  }, [pageMm]);

  const pagedBodyLines = useMemo(() => {
    if (!bodyLayout || !bodyPageHeightPx) return bodyLines;
    const pageStart = (currentPage - 1) * bodyPageHeightPx;
    const pageEnd = pageStart + bodyPageHeightPx;
    return bodyLines
      .filter(
        (line) => {
          const lineHeight = line.lineHeightPx ?? bodyLayout.lineHeightPx;
          return line.y + lineHeight > pageStart && line.y < pageEnd;
        },
      )
      .map((line) => ({
        ...line,
        y: line.y - pageStart,
      }));
  }, [bodyLines, bodyLayout, bodyPageHeightPx, currentPage]);

  const bodyImages = useMemo(() => {
    if (!doc) return [];
    return buildRenderedImages(bodyLayout, doc.blocks, imageResolver);
  }, [bodyLayout, doc, imageResolver]);

  const pagedBodyImages = useMemo(() => {
    if (!bodyPageHeightPx) return bodyImages;
    const pageStart = (currentPage - 1) * bodyPageHeightPx;
    const pageEnd = pageStart + bodyPageHeightPx;
    return bodyImages
      .filter(
        (image) =>
          image.y + image.height > pageStart && image.y < pageEnd,
      )
      .map((image) => ({
        ...image,
        y: image.y - pageStart,
      }));
  }, [bodyImages, bodyPageHeightPx, currentPage]);

  const headerImages = useMemo(() => {
    if (!doc) return [];
    return buildRenderedImages(headerLayout, doc.headerBlocks, imageResolver);
  }, [doc, headerLayout, imageResolver]);

  const footerImages = useMemo(() => {
    if (!doc) return [];
    return buildRenderedImages(footerLayout, doc.footerBlocks, imageResolver);
  }, [doc, footerLayout, imageResolver]);

  const bodyUsesEngine = !!doc
    && !isEditing
    && (bodyLines.length > 0 || bodyImages.length > 0);

  const headerUsesEngine = headerLines.length > 0 || headerImages.length > 0;
  const footerUsesEngine = footerLines.length > 0 || footerImages.length > 0;

  useEffect(() => {
    if (bodyUsesEngine) return;
    if (!editableRef.current || !bodyPageHeightPx) return;
    editableRef.current.scrollTop = (currentPage - 1) * bodyPageHeightPx;
  }, [bodyUsesEngine, bodyPageHeightPx, currentPage]);

  const measureFallbackHeight = () => {
    const el = editableRef.current;
    if (!el) return;
    const height = el.scrollHeight;
    if (Number.isFinite(height) && height > 0) {
      setFallbackContentHeightPx(height);
    }
  };

  useEffect(() => {
    if (!editableRef.current || isEditing) return;
    editableRef.current.innerHTML = html;
    requestAnimationFrame(() => measureFallbackHeight());
  }, [html, isEditing]);

  useEffect(() => {
    const el = editableRef.current;
    if (!el) return;
    const measure = () => {
      const height = el.scrollHeight;
      if (Number.isFinite(height) && height > 0) {
        setFallbackContentHeightPx(height);
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    return () => observer.disconnect();
  }, [html, isEditing]);

  const pagePx = useMemo(() => {
    if (!pageMm) return null;
    return {
      page: boxToPx(pageMm.page),
      body: boxToPx(pageMm.body),
      header: boxToPx(pageMm.header),
      footer: boxToPx(pageMm.footer),
    };
  }, [pageMm]);

  const pagePxScaled = useMemo(() => {
    if (!pagePx) return null;
    return {
      page: scaleBoxPx(pagePx.page, zoom),
      body: scaleBoxPx(pagePx.body, zoom),
      header: scaleBoxPx(pagePx.header, zoom),
      footer: scaleBoxPx(pagePx.footer, zoom),
    };
  }, [pagePx, zoom]);

  const layoutSummary = doc?.layoutSummary
    ?? (layoutError ? `Layout unavailable: ${layoutError}` : "Layout: idle");

  const totalPages = useMemo(() => {
    if (!pageMm) return 1;
    const bodyHeightPx = Math.max(1, mmToPx(pageMm.body.height_mm));
    if (!bodyUsesEngine) {
      if (Number.isFinite(fallbackContentHeightPx) && fallbackContentHeightPx && fallbackContentHeightPx > 0) {
        return Math.max(1, Math.ceil(fallbackContentHeightPx / bodyHeightPx));
      }
      return 1;
    }
    const contentHeightPx = doc?.layoutCache?.contentHeightPx;
    if (Number.isFinite(contentHeightPx) && contentHeightPx && contentHeightPx > 0) {
      return Math.max(1, Math.ceil(contentHeightPx / bodyHeightPx));
    }
    const lineCount = doc?.layoutCache?.lineCount ?? 0;
    const linesPerPage = Math.max(
      1,
      Math.floor(bodyHeightPx / DEFAULT_LINE_HEIGHT_PX),
    );
    const safeLineCount = Math.max(1, lineCount);
    return Math.max(1, Math.ceil(safeLineCount / linesPerPage));
  }, [
    bodyUsesEngine,
    doc?.layoutCache?.contentHeightPx,
    doc?.layoutCache?.lineCount,
    fallbackContentHeightPx,
    pageMm,
  ]);

  const displayTotalPages = openOfficePreview && openOfficeTotalPages > 0
    ? openOfficeTotalPages
    : totalPages;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.__luminaTypesettingHarness) return;
    if (!doc) return;

    const bodyPageHeightPx = pageMm ? mmToPx(pageMm.body.height_mm) : null;
    const bodyLinePages = bodyLayout && bodyPageHeightPx
      ? bodyLayout.lines.map((line) => Math.max(1, Math.floor(line.y_offset / bodyPageHeightPx) + 1))
      : undefined;

    window.__luminaTypesettingLayout = {
      docPath: path,
      updatedAt: new Date().toISOString(),
      totalPages,
      pageMm,
      pageStyle: doc.pageStyle,
      contentHeightPx: doc.layoutCache?.contentHeightPx,
      lineCount: doc.layoutCache?.lineCount,
      body: bodyLayout
        ? {
          text: bodyLayout.text,
          fontSizePx: bodyLayout.fontSizePx,
          lineHeightPx: bodyLayout.lineHeightPx,
          lines: bodyLayout.lines,
          lineStyles: bodyLineStyles,
          linePages: bodyLinePages,
        }
        : null,
      header: headerLayout
        ? {
          text: headerLayout.text,
          fontSizePx: headerLayout.fontSizePx,
          lineHeightPx: headerLayout.lineHeightPx,
          lines: headerLayout.lines,
        }
        : null,
      footer: footerLayout
        ? {
          text: footerLayout.text,
          fontSizePx: footerLayout.fontSizePx,
          lineHeightPx: footerLayout.lineHeightPx,
          lines: footerLayout.lines,
        }
        : null,
    };

    return () => {
      if (window.__luminaTypesettingLayout?.docPath === path) {
        delete window.__luminaTypesettingLayout;
      }
    };
  }, [bodyLayout, bodyLineStyles, doc, footerLayout, headerLayout, pageMm, path, totalPages]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(Math.max(1, prev), displayTotalPages));
  }, [displayTotalPages]);

  useEffect(() => {
    if (!openOfficePreview) return;
    if (doc?.isDirty) {
      setOpenOfficeStale(true);
    }
  }, [doc?.isDirty, openOfficePreview]);

  const handleInput = () => {
    if (!editableRef.current) return;
    const blocks = docxHtmlToBlocks(editableRef.current);
    updateDocBlocks(path, blocks);
    markTypesettingTabDirty(path, true);
    measureFallbackHeight();
  };

  const startEditing = () => {
    setIsEditing(true);
    setTimeout(() => editableRef.current?.focus(), 0);
  };

  const handleBeforeInput = (event: React.FormEvent<HTMLDivElement>) => {
    const inputEvent = event.nativeEvent as InputEvent;
    const op = docOpFromBeforeInput(inputEvent);
    if (op) {
      recordDocOp(path, op);
    }
  };

  const handleEditableScroll = () => {
    if (bodyUsesEngine || !editableRef.current || !bodyPageHeightPx) return;
    const top = editableRef.current.scrollTop;
    const page = Math.max(1, Math.floor(top / bodyPageHeightPx) + 1);
    setCurrentPage((prev) => (prev === page ? prev : page));
    measureFallbackHeight();
  };

  const waitForNextPaint = () =>
    new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );

  const renderPagesToPdfBytes = useCallback(async (): Promise<Uint8Array | null> => {
    if (!pageMm) return null;
    if (isEditing) {
      editableRef.current?.blur();
      setIsEditing(false);
      await waitForNextPaint();
    }
    const [{ default: jsPDF }, html2canvasModule] = await Promise.all([
      import("jspdf"),
      bodyUsesEngine ? Promise.resolve(null) : import("html2canvas"),
    ]);
    const pageWidthMm = pageMm.page.width_mm;
    const pageHeightMm = pageMm.page.height_mm;
    const orientation = pageWidthMm > pageHeightMm ? "landscape" : "portrait";
    const pdf = new jsPDF({
      orientation,
      unit: "mm",
      format: [pageWidthMm, pageHeightMm],
      compress: true,
    });
    const fontAsset = typeof window !== "undefined" ? window.__luminaTypesettingFont : undefined;
    if (fontAsset?.data) {
      try {
        pdf.addFileToVFS(fontAsset.fileName, fontAsset.data);
        pdf.addFont(fontAsset.fileName, fontAsset.name, "normal");
        pdf.setFont(fontAsset.name, "normal");
      } catch {
        // Keep default font if custom font fails to load.
      }
    }
    const bodyHeightPx = bodyPageHeightPx ?? mmToPx(pageMm.body.height_mm);

    const drawLines = (
      lines: RenderedLine[],
      offsetMm: TypesettingPreviewBoxMm,
      fallbackFontSizePx: number,
    ) => {
      for (const line of lines) {
        const fontSizePx = line.fontSizePx ?? fallbackFontSizePx;
        const xMm = offsetMm.x_mm + pxToMm(line.x);
        const yMm = offsetMm.y_mm + pxToMm(line.y);
        pdf.setFontSize(pxToPt(fontSizePx));
        pdf.text(line.text, xMm, yMm, { baseline: "top" });
        if (line.underline) {
          const underlineY = yMm + pxToMm(fontSizePx * 0.9);
          const underlineWidth = pxToMm(line.width);
          pdf.setLineWidth(0.2);
          pdf.line(xMm, underlineY, xMm + underlineWidth, underlineY);
        }
      }
    };

    if (bodyUsesEngine) {
      const fallbackFontSizePx = bodyLayout?.fontSizePx ?? DEFAULT_FONT_SIZE_PX;
      const headerFontSizePx = headerLayout?.fontSizePx ?? DEFAULT_FONT_SIZE_PX;
      const footerFontSizePx = footerLayout?.fontSizePx ?? DEFAULT_FONT_SIZE_PX;
      for (let page = 1; page <= totalPages; page += 1) {
        if (page > 1) {
          pdf.addPage();
        }
        const pageStart = (page - 1) * bodyHeightPx;
        const pageEnd = pageStart + bodyHeightPx;
        const pageBodyLines = bodyLines
          .filter((line) => {
            const lineHeight = line.lineHeightPx ?? bodyLayout?.lineHeightPx ?? DEFAULT_LINE_HEIGHT_PX;
            return line.y + lineHeight > pageStart && line.y < pageEnd;
          })
          .map((line) => ({
            ...line,
            y: line.y - pageStart,
          }));
        drawLines(pageBodyLines, pageMm.body, fallbackFontSizePx);
        if (headerLines.length > 0) {
          drawLines(headerLines, pageMm.header, headerFontSizePx);
        }
        if (footerLines.length > 0) {
          drawLines(footerLines, pageMm.footer, footerFontSizePx);
        }
      }
      return new Uint8Array(pdf.output("arraybuffer"));
    }

    if (!pageRef.current || !html2canvasModule) return null;
    const html2canvas = html2canvasModule.default;
    const originalPage = currentPage;
    const originalScrollTop = editableRef.current?.scrollTop ?? 0;
    for (let page = 1; page <= totalPages; page += 1) {
      if (!pageRef.current) break;
      if (page !== currentPage) {
        setCurrentPage(page);
        await waitForNextPaint();
      }
      if (!bodyUsesEngine && editableRef.current && bodyHeightPx > 0) {
        editableRef.current.scrollTop = (page - 1) * bodyHeightPx;
        await waitForNextPaint();
      }
      const canvas = await html2canvas(pageRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });
      if (page > 1) {
        pdf.addPage();
      }
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      pdf.addImage(imgData, "JPEG", 0, 0, pageWidthMm, pageHeightMm);
    }
    if (!bodyUsesEngine && editableRef.current) {
      editableRef.current.scrollTop = originalScrollTop;
      await waitForNextPaint();
    }
    if (originalPage !== currentPage) {
      setCurrentPage(originalPage);
      await waitForNextPaint();
    }
    return new Uint8Array(pdf.output("arraybuffer"));
  }, [
    bodyLayout,
    bodyLines,
    bodyPageHeightPx,
    bodyUsesEngine,
    currentPage,
    footerLayout,
    footerLines,
    headerLayout,
    headerLines,
    isEditing,
    pageMm,
    totalPages,
  ]);

  const renderOpenOfficePdfBytes = useCallback(async (): Promise<Uint8Array | null> => {
    if (!tauriAvailable) {
      setOpenOfficeError("OpenOffice preview requires desktop app.");
      return null;
    }
    if (!doc) {
      setOpenOfficeError("OpenOffice preview requires a document.");
      return null;
    }
    setOpenOfficeError(null);
    setOpenOfficeLoading(true);
    try {
      const tempRoot = await tempDir();
      const docxPath = await join(
        tempRoot,
        `lumina-openoffice-${Date.now()}.docx`,
      );
      await exportDocx(path, docxPath);
      const payload = await getTypesettingRenderDocxPdfBase64(docxPath);
      const bytes = decodeBase64ToBytes(payload);
      setOpenOfficePdf(bytes);
      setOpenOfficeStale(false);
      return bytes;
    } catch (err) {
      const reason = String(err);
      setOpenOfficeError(reason);
      return null;
    } finally {
      setOpenOfficeLoading(false);
    }
  }, [doc, exportDocx, path, tauriAvailable]);

  const getExportPdfBytes = useCallback(async (): Promise<Uint8Array> => {
    if (openOfficePreview) {
      const openOffice = openOfficePdf ?? await renderOpenOfficePdfBytes();
      if (openOffice) {
        return openOffice;
      }
    }
    const rendered = await renderPagesToPdfBytes();
    if (rendered) return rendered;
    const payload = await getTypesettingExportPdfBase64();
    return decodeBase64ToBytes(payload);
  }, [openOfficePdf, openOfficePreview, renderOpenOfficePdfBytes, renderPagesToPdfBytes]);

  const handleToggleOpenOfficePreview = async () => {
    if (openOfficePreview) {
      setOpenOfficePreview(false);
      setOpenOfficeTotalPages(0);
      return;
    }
    setOpenOfficePreview(true);
    if (!openOfficePdf || openOfficeStale) {
      await renderOpenOfficePdfBytes();
    }
  };

  const handleRefreshOpenOfficePreview = async () => {
    setOpenOfficePreview(true);
    await renderOpenOfficePdfBytes();
  };

  useEffect(() => {
    if (!onExportReady) return;
    if (!exportReady) {
      onExportReady(null);
      return;
    }
    onExportReady(getExportPdfBytes);
    return () => {
      onExportReady(null);
    };
  }, [exportReady, getExportPdfBytes, onExportReady]);

  const handleExport = async () => {
    setExportError(null);
    setExporting(true);
    try {
      const filePath = await save({
        defaultPath: "typesetting-export.pdf",
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!filePath) return;
      const bytes = await getExportPdfBytes();
      await writeFile(filePath, bytes);
    } catch (err) {
      console.error("Typesetting PDF export failed:", err);
      setExportError("Export failed.");
    } finally {
      setExporting(false);
    }
  };

  const handleExportDocx = async () => {
    setExportDocxError(null);
    setExportingDocx(true);
    try {
      const defaultPath = doc?.path
        ? doc.path.replace(/\.docx$/i, "-export.docx")
        : "typesetting-export.docx";
      const filePath = await save({
        defaultPath,
        filters: [{ name: "Word Document", extensions: ["docx"] }],
      });
      if (!filePath) return;
      await exportDocx(path, filePath);
    } catch (err) {
      console.error("Typesetting DOCX export failed:", err);
      setExportDocxError("Export failed.");
    } finally {
      setExportingDocx(false);
    }
  };

  const handlePrint = async () => {
    setPrintError(null);
    setPrinting(true);
    try {
      const tempRoot = await tempDir();
      const filePath = await join(
        tempRoot,
        `lumina-typesetting-print-${Date.now()}.pdf`,
      );
      const bytes = await getExportPdfBytes();
      await writeFile(filePath, bytes);
      await openExternal(filePath);
    } catch (err) {
      console.error("Typesetting print failed:", err);
      setPrintError("Print failed.");
    } finally {
      setPrinting(false);
    }
  };

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-sm text-destructive">Failed to open docx: {error}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-background">
      <div className="sticky top-0 z-10 flex items-center justify-center bg-background/80 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground shadow-sm">
            <button
              type="button"
              className="rounded border border-border px-2 py-0.5 text-sm disabled:opacity-50"
              aria-label="Zoom out"
              onClick={() =>
                setZoom((current) => clampZoom(roundZoom(current - ZOOM_STEP)))
              }
              disabled={zoom <= MIN_ZOOM}
            >
              -
            </button>
            <span className="min-w-[3rem] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              className="rounded border border-border px-2 py-0.5 text-sm disabled:opacity-50"
              aria-label="Zoom in"
              onClick={() =>
                setZoom((current) => clampZoom(roundZoom(current + ZOOM_STEP)))
              }
              disabled={zoom >= MAX_ZOOM}
            >
              +
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground shadow-sm">
            <button
              type="button"
              className="rounded border border-border px-2 py-0.5 text-xs disabled:opacity-50"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage <= 1}
              aria-label="Previous page"
            >
              Prev
            </button>
            <span className="min-w-[5rem] text-center">
              Page {currentPage} / {displayTotalPages}
            </span>
            <button
              type="button"
              className="rounded border border-border px-2 py-0.5 text-xs disabled:opacity-50"
              onClick={() =>
                setCurrentPage((prev) => Math.min(displayTotalPages, prev + 1))
              }
              disabled={currentPage >= displayTotalPages}
              aria-label="Next page"
            >
              Next
            </button>
          </div>
          <button
            type="button"
            className="rounded-md border border-border bg-card px-3 py-1 text-sm text-foreground shadow-sm disabled:opacity-50"
            onClick={() => saveActiveFile()}
            disabled={!doc?.isDirty}
          >
            Save
          </button>
          <button
            type="button"
            className="rounded-md border border-border bg-card px-3 py-1 text-sm text-foreground shadow-sm disabled:opacity-50"
            onClick={handleToggleOpenOfficePreview}
            disabled={openOfficeLoading || !tauriAvailable}
          >
            {openOfficePreview ? "Close OpenOffice" : "OpenOffice Preview"}
          </button>
          {openOfficePreview ? (
            <button
              type="button"
              className="rounded-md border border-border bg-card px-3 py-1 text-sm text-foreground shadow-sm disabled:opacity-50"
              onClick={handleRefreshOpenOfficePreview}
              disabled={openOfficeLoading || !tauriAvailable}
            >
              {openOfficeLoading ? "Rendering..." : "Refresh OpenOffice"}
            </button>
          ) : null}
          <div className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground shadow-sm">
            <button
              type="button"
              className="rounded border border-border px-2 py-0.5 text-xs"
              onClick={() => {
                editableRef.current?.focus();
                document.execCommand("bold");
              }}
              aria-label="Bold"
            >
              B
            </button>
            <button
              type="button"
              className="rounded border border-border px-2 py-0.5 text-xs"
              onClick={() => {
                editableRef.current?.focus();
                document.execCommand("italic");
              }}
              aria-label="Italic"
            >
              I
            </button>
            <button
              type="button"
              className="rounded border border-border px-2 py-0.5 text-xs"
              onClick={() => {
                editableRef.current?.focus();
                document.execCommand("underline");
              }}
              aria-label="Underline"
            >
              U
            </button>
            <button
              type="button"
              className="rounded border border-border px-2 py-0.5 text-xs"
              onClick={() => {
                editableRef.current?.focus();
                document.execCommand("insertUnorderedList");
              }}
              aria-label="Bulleted list"
            >
              •
            </button>
            <button
              type="button"
              className="rounded border border-border px-2 py-0.5 text-xs"
              onClick={() => {
                editableRef.current?.focus();
                document.execCommand("insertOrderedList");
              }}
              aria-label="Numbered list"
            >
              1.
            </button>
          </div>
          <button
            type="button"
            className="rounded-md border border-border bg-card px-3 py-1 text-sm text-foreground shadow-sm disabled:opacity-50"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? "Exporting..." : "Export PDF"}
          </button>
          <button
            type="button"
            className="rounded-md border border-border bg-card px-3 py-1 text-sm text-foreground shadow-sm disabled:opacity-50"
            onClick={handlePrint}
            disabled={printing}
          >
            {printing ? "Printing..." : "Print"}
          </button>
          <button
            type="button"
            className="rounded-md border border-border bg-card px-3 py-1 text-sm text-foreground shadow-sm disabled:opacity-50"
            onClick={handleExportDocx}
            disabled={exportingDocx}
          >
            {exportingDocx ? "Exporting DOCX..." : "Export DOCX"}
          </button>
          {exportError ? (
            <span className="text-xs text-destructive">{exportError}</span>
          ) : null}
          {printError ? (
            <span className="text-xs text-destructive">{printError}</span>
          ) : null}
          {exportDocxError ? (
            <span className="text-xs text-destructive">{exportDocxError}</span>
          ) : null}
          {openOfficeError ? (
            <span className="text-xs text-destructive">OpenOffice: {openOfficeError}</span>
          ) : null}
          {openOfficePreview && openOfficeStale ? (
            <span className="text-xs text-amber-600">OpenOffice preview stale</span>
          ) : null}
          <span className="text-xs text-muted-foreground">{layoutSummary}</span>
        </div>
      </div>
      <div className="flex min-h-full items-center justify-center px-6 py-10">
        {openOfficePreview ? (
          <div className="w-full max-w-5xl">
            {openOfficePdf ? (
              <PDFCanvas
                pdfData={openOfficePdf}
                filePath={doc?.path ?? "OpenOffice Preview"}
                currentPage={currentPage}
                scale={zoom}
                onDocumentLoad={(pages) => setOpenOfficeTotalPages(pages)}
                onPageChange={setCurrentPage}
                onScaleChange={setZoom}
                enableAnnotations={false}
              />
            ) : (
              <div className="text-center space-y-2">
                <div className="text-lg font-semibold text-foreground">
                  OpenOffice Preview
                </div>
                <p className="text-sm text-muted-foreground">
                  {openOfficeLoading
                    ? "Rendering OpenOffice output..."
                    : openOfficeError
                      ? `Failed to render: ${openOfficeError}`
                      : "Click Refresh OpenOffice to render."}
                </p>
              </div>
            )}
          </div>
        ) : !pagePx ? (
          <div className="text-center space-y-2">
            <div className="text-lg font-semibold text-foreground">
              Typesetting Document
            </div>
            <p className="text-sm text-muted-foreground">
              Loading preview metrics...
            </p>
          </div>
        ) : (
          <div
            className="relative"
            style={{
              width: pagePxScaled?.page.width ?? pagePx.page.width,
              height: pagePxScaled?.page.height ?? pagePx.page.height,
            }}
          >
            <div
              ref={handlePageRef}
              className="relative rounded-lg border border-border bg-white shadow-sm"
              style={{
                width: pagePx.page.width,
                height: pagePx.page.height,
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
                position: "absolute",
                left: 0,
                top: 0,
              }}
            >
              <div
                className="absolute border border-dashed border-muted-foreground/40"
                style={{
                  left: pagePx.body.left,
                  top: pagePx.body.top,
                  width: pagePx.body.width,
                  height: pagePx.body.height,
                }}
              >
                {bodyUsesEngine && bodyLayout ? (
                  <div
                    className="relative h-full w-full overflow-hidden px-4 py-2 text-foreground"
                    style={{
                      fontSize: bodyLayout.fontSizePx,
                      lineHeight: `${bodyLayout.lineHeightPx}px`,
                    }}
                    data-testid="typesetting-body-engine"
                    onClick={startEditing}
                  >
                    {pagedBodyLines.map((line, index) => (
                      <div
                        key={`${index}-${line.x}-${line.y}`}
                        style={{
                          position: "absolute",
                          left: line.x,
                          top: line.y,
                          width: line.width,
                          whiteSpace: "pre",
                          fontSize: line.fontSizePx ?? bodyLayout.fontSizePx,
                          lineHeight: `${line.lineHeightPx ?? bodyLayout.lineHeightPx}px`,
                          textDecoration: line.underline ? "underline" : undefined,
                        }}
                      >
                        {line.text}
                      </div>
                    ))}
                    {pagedBodyImages.map((image) => (
                      <img
                        key={`body-${image.embedId}-${image.x}-${image.y}`}
                        src={image.src}
                        alt={image.alt}
                        data-embed-id={image.embedId}
                        data-testid="typesetting-body-image"
                        style={{
                          position: "absolute",
                          left: image.x,
                          top: image.y,
                          width: image.width,
                          height: image.height,
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div
                    ref={editableRef}
                    className="h-full w-full overflow-auto p-4 text-sm text-foreground outline-none"
                    contentEditable
                    suppressContentEditableWarning
                    onBeforeInput={handleBeforeInput}
                    onInput={handleInput}
                    onScroll={handleEditableScroll}
                    onFocus={() => setIsEditing(true)}
                    onBlur={() => {
                      setIsEditing(false);
                      handleInput();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Tab") {
                        event.preventDefault();
                        document.execCommand("insertText", false, "\t");
                      }
                    }}
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                )}
              </div>
              <div
                className="absolute border border-dotted border-muted-foreground/30"
                style={{
                  left: pagePx.header.left,
                  top: pagePx.header.top,
                  width: pagePx.header.width,
                  height: pagePx.header.height,
                }}
              >
                {headerUsesEngine && headerLayout ? (
                  <div
                    className="relative h-full w-full overflow-hidden px-4 py-1 text-foreground"
                    style={{
                      fontSize: headerLayout.fontSizePx,
                      lineHeight: `${headerLayout.lineHeightPx}px`,
                    }}
                    data-testid="typesetting-header"
                  >
                    {headerLines.map((line, index) => (
                      <div
                        key={`${index}-${line.x}-${line.y}`}
                        style={{
                          position: "absolute",
                          left: line.x,
                          top: line.y,
                          width: line.width,
                          whiteSpace: "pre",
                        }}
                      >
                        {line.text}
                      </div>
                    ))}
                    {headerImages.map((image) => (
                      <img
                        key={`header-${image.embedId}-${image.x}-${image.y}`}
                        src={image.src}
                        alt={image.alt}
                        data-embed-id={image.embedId}
                        data-testid="typesetting-header-image"
                        style={{
                          position: "absolute",
                          left: image.x,
                          top: image.y,
                          width: image.width,
                          height: image.height,
                        }}
                      />
                    ))}
                  </div>
                ) : headerHtml ? (
                  <div
                    className="h-full w-full overflow-hidden px-4 py-1 text-[10px] leading-tight text-foreground"
                    data-testid="typesetting-header"
                    dangerouslySetInnerHTML={{ __html: headerHtml }}
                  />
                ) : null}
              </div>
              <div
                className="absolute border border-dotted border-muted-foreground/30"
                style={{
                  left: pagePx.footer.left,
                  top: pagePx.footer.top,
                  width: pagePx.footer.width,
                  height: pagePx.footer.height,
                }}
              >
                {footerUsesEngine && footerLayout ? (
                  <div
                    className="relative h-full w-full overflow-hidden px-4 py-1 text-foreground"
                    style={{
                      fontSize: footerLayout.fontSizePx,
                      lineHeight: `${footerLayout.lineHeightPx}px`,
                    }}
                    data-testid="typesetting-footer"
                  >
                    {footerLines.map((line, index) => (
                      <div
                        key={`${index}-${line.x}-${line.y}`}
                        style={{
                          position: "absolute",
                          left: line.x,
                          top: line.y,
                          width: line.width,
                          whiteSpace: "pre",
                        }}
                      >
                        {line.text}
                      </div>
                    ))}
                    {footerImages.map((image) => (
                      <img
                        key={`footer-${image.embedId}-${image.x}-${image.y}`}
                        src={image.src}
                        alt={image.alt}
                        data-embed-id={image.embedId}
                        data-testid="typesetting-footer-image"
                        style={{
                          position: "absolute",
                          left: image.x,
                          top: image.y,
                          width: image.width,
                          height: image.height,
                        }}
                      />
                    ))}
                  </div>
                ) : footerHtml ? (
                  <div
                    className="h-full w-full overflow-hidden px-4 py-1 text-[10px] leading-tight text-foreground"
                    data-testid="typesetting-footer"
                    dangerouslySetInnerHTML={{ __html: footerHtml }}
                  />
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
