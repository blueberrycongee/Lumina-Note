import { useEffect, useMemo, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { join, tempDir } from "@tauri-apps/api/path";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { useTypesettingDocStore } from "@/stores/useTypesettingDocStore";
import { useFileStore } from "@/stores/useFileStore";
import {
  getTypesettingExportPdfBase64,
  getTypesettingFixtureFontPath,
  getTypesettingLayoutText,
  getTypesettingPreviewPageMm,
  TypesettingPreviewBoxMm,
  TypesettingPreviewPageMm,
  TypesettingTextLine,
} from "@/lib/tauri";
import { decodeBase64ToBytes, encodeBytesToBase64 } from "@/typesetting/base64";
import { docxBlocksToHtml, docxHtmlToBlocks } from "@/typesetting/docxHtml";
import {
  docxBlocksToFontSizePx,
  docxBlocksToLineHeightPx,
  docxBlocksToLayoutTextOptions,
  docxBlocksToPlainText,
} from "@/typesetting/docxText";
import { docOpFromBeforeInput } from "@/typesetting/docOps";
import { sliceUtf8 } from "@/typesetting/utf8";
import type { TypesettingDoc } from "@/stores/useTypesettingDocStore";
import type { DocxBlock } from "@/typesetting/docxImport";

type TypesettingDocumentPaneProps = {
  path: string;
};

const DEFAULT_DPI = 96;
const DEFAULT_FONT_SIZE_PX = 16;
const DEFAULT_LINE_HEIGHT_PX = 20;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;

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
};

const mmToPx = (mm: number, dpi = DEFAULT_DPI) =>
  Math.round((Math.max(0, mm) * dpi) / 25.4);

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

const hasComplexLayoutBlocks = (blocks: DocxBlock[]): boolean =>
  blocks.some((block) => block.type === "image" || block.type === "table");

const defaultLineHeightForFont = (fontSizePx: number) =>
  Math.max(1, Math.round(fontSizePx * 1.2));

const buildRenderedLines = (
  text: string,
  lines: TypesettingTextLine[],
): RenderedLine[] => {
  if (!text || lines.length === 0) return [];
  return lines.map((line) => ({
    text: sliceUtf8(text, line.start_byte, line.end_byte),
    x: line.x_offset,
    y: line.y_offset,
    width: line.width,
  }));
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

export function TypesettingDocumentPane({ path }: TypesettingDocumentPaneProps) {
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
  const [isEditing, setIsEditing] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [headerLayout, setHeaderLayout] = useState<LayoutRender | null>(null);
  const [footerLayout, setFooterLayout] = useState<LayoutRender | null>(null);
  const editableRef = useRef<HTMLDivElement | null>(null);
  const layoutRunRef = useRef(0);

  useEffect(() => {
    if (doc) return;
    openDoc(path).catch((err) => setError(String(err)));
  }, [doc, openDoc, path]);

  useEffect(() => {
    let active = true;
    getTypesettingPreviewPageMm()
      .then((data) => {
        if (active) {
          setPageMm(data);
        }
      })
      .catch((err) => {
        if (active) {
          setError(String(err));
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!doc || !pageMm) {
      setHeaderLayout(null);
      setFooterLayout(null);
      return;
    }
    setLayoutError(null);

    const text = docxBlocksToPlainText(doc.blocks);
    const lineHeightPx = docxBlocksToLineHeightPx(
      doc.blocks,
      DEFAULT_LINE_HEIGHT_PX,
      DEFAULT_DPI,
    );
    const fontSizePx = docxBlocksToFontSizePx(
      doc.blocks,
      DEFAULT_FONT_SIZE_PX,
      DEFAULT_DPI,
    );
    const layoutOptions = docxBlocksToLayoutTextOptions(
      doc.blocks,
      DEFAULT_DPI,
    );
    const headerText = docxBlocksToPlainText(doc.headerBlocks);
    const footerText = docxBlocksToPlainText(doc.footerBlocks);
    const headerUsesEngine = headerText.trim().length > 0
      && !hasComplexLayoutBlocks(doc.headerBlocks);
    const footerUsesEngine = footerText.trim().length > 0
      && !hasComplexLayoutBlocks(doc.footerBlocks);

    if (!headerUsesEngine) {
      setHeaderLayout(null);
    }
    if (!footerUsesEngine) {
      setFooterLayout(null);
    }

    const runId = ++layoutRunRef.current;
    const handler = setTimeout(async () => {
      const fontPath = await getTypesettingFixtureFontPath();
      if (layoutRunRef.current !== runId) return;
      if (!fontPath) {
        setLayoutError("missing fixture font");
        updateLayoutSummary(path, "Layout unavailable");
        setHeaderLayout(null);
        setFooterLayout(null);
        return;
      }
      try {
        const buildHeaderFooterLayout = async (
          blocks: DocxBlock[],
          content: string,
          maxWidthMm: number,
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
          const layout = await getTypesettingLayoutText({
            text: content,
            fontPath,
            maxWidth: mmToPx(maxWidthMm),
            lineHeight,
            fontSize,
            align: options.align,
            firstLineIndent: options.firstLineIndentPx,
            spaceBefore: options.spaceBeforePx,
            spaceAfter: options.spaceAfterPx,
          });
          return {
            text: content,
            fontSizePx: fontSize,
            lineHeightPx: lineHeight,
            lines: layout.lines,
          };
        };

        const maxWidth = mmToPx(pageMm.body.width_mm);
        const layoutData = await getTypesettingLayoutText({
          text,
          fontPath,
          maxWidth,
          lineHeight: lineHeightPx,
          fontSize: fontSizePx,
          align: layoutOptions.align,
          firstLineIndent: layoutOptions.firstLineIndentPx,
          spaceBefore: layoutOptions.spaceBeforePx,
          spaceAfter: layoutOptions.spaceAfterPx,
        });
        if (layoutRunRef.current !== runId) return;
        const contentHeightPx = layoutData.lines.length > 0
          ? Math.max(
              0,
              layoutData.lines[layoutData.lines.length - 1].y_offset
                + lineHeightPx
                + layoutOptions.spaceAfterPx,
            )
          : 0;
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
        ): Promise<LayoutRender | null> => {
          if (!enabled) return null;
          try {
            return await buildHeaderFooterLayout(blocks, content, widthMm);
          } catch {
            return null;
          }
        };

        const [nextHeaderLayout, nextFooterLayout] = await Promise.all([
          safeLayout(doc.headerBlocks, headerText, pageMm.header.width_mm, headerUsesEngine),
          safeLayout(doc.footerBlocks, footerText, pageMm.footer.width_mm, footerUsesEngine),
        ]);
        if (layoutRunRef.current !== runId) return;
        setHeaderLayout(nextHeaderLayout);
        setFooterLayout(nextFooterLayout);
      } catch (err) {
        if (layoutRunRef.current !== runId) return;
        setLayoutError(String(err));
        updateLayoutSummary(path, "Layout unavailable");
        setHeaderLayout(null);
        setFooterLayout(null);
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

  const headerUsesEngine = headerLines.length > 0;
  const footerUsesEngine = footerLines.length > 0;

  useEffect(() => {
    if (!editableRef.current || isEditing) return;
    editableRef.current.innerHTML = html;
  }, [html, isEditing]);

  const pagePx = useMemo(() => {
    if (!pageMm) return null;
    const base = {
      page: boxToPx(pageMm.page),
      body: boxToPx(pageMm.body),
      header: boxToPx(pageMm.header),
      footer: boxToPx(pageMm.footer),
    };
    if (zoom === 1) return base;
    return {
      page: scaleBoxPx(base.page, zoom),
      body: scaleBoxPx(base.body, zoom),
      header: scaleBoxPx(base.header, zoom),
      footer: scaleBoxPx(base.footer, zoom),
    };
  }, [pageMm, zoom]);

  const layoutSummary = doc?.layoutSummary
    ?? (layoutError ? `Layout unavailable: ${layoutError}` : "Layout: idle");

  const totalPages = useMemo(() => {
    if (!pageMm) return 1;
    const bodyHeightPx = Math.max(1, mmToPx(pageMm.body.height_mm));
    const contentHeightPx = doc?.layoutCache?.contentHeightPx;
    if (Number.isFinite(contentHeightPx) && contentHeightPx > 0) {
      return Math.max(1, Math.ceil(contentHeightPx / bodyHeightPx));
    }
    const lineCount = doc?.layoutCache?.lineCount ?? 0;
    const linesPerPage = Math.max(
      1,
      Math.floor(bodyHeightPx / DEFAULT_LINE_HEIGHT_PX),
    );
    const safeLineCount = Math.max(1, lineCount);
    return Math.max(1, Math.ceil(safeLineCount / linesPerPage));
  }, [doc?.layoutCache?.contentHeightPx, doc?.layoutCache?.lineCount, pageMm]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(Math.max(1, prev), totalPages));
  }, [totalPages]);

  const handleInput = () => {
    if (!editableRef.current) return;
    const blocks = docxHtmlToBlocks(editableRef.current);
    updateDocBlocks(path, blocks);
    markTypesettingTabDirty(path, true);
  };

  const handleBeforeInput = (event: React.FormEvent<HTMLDivElement>) => {
    const inputEvent = event.nativeEvent as InputEvent;
    const op = docOpFromBeforeInput(inputEvent);
    if (op) {
      recordDocOp(path, op);
    }
  };

  const handleExport = async () => {
    setExportError(null);
    setExporting(true);
    try {
      const filePath = await save({
        defaultPath: "typesetting-export.pdf",
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!filePath) return;
      const payload = await getTypesettingExportPdfBase64();
      const bytes = decodeBase64ToBytes(payload);
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
      const payload = await getTypesettingExportPdfBase64();
      const bytes = decodeBase64ToBytes(payload);
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
              Page {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              className="rounded border border-border px-2 py-0.5 text-xs disabled:opacity-50"
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
              disabled={currentPage >= totalPages}
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
          <span className="text-xs text-muted-foreground">{layoutSummary}</span>
        </div>
      </div>
      <div className="flex min-h-full items-center justify-center px-6 py-10">
        {!pagePx ? (
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
            className="relative rounded-lg border border-border bg-white shadow-sm"
            style={{ width: pagePx.page.width, height: pagePx.page.height }}
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
              <div
                ref={editableRef}
                className="h-full w-full overflow-auto p-4 text-sm text-foreground outline-none"
                contentEditable
                suppressContentEditableWarning
                onBeforeInput={handleBeforeInput}
                onInput={handleInput}
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
        )}
      </div>
    </div>
  );
}
