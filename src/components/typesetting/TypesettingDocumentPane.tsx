import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTypesettingDocStore } from "@/stores/useTypesettingDocStore";
import { useFileStore } from "@/stores/useFileStore";
import {
  getTypesettingFixtureFontPath,
  getTypesettingLayoutText,
  isTauriAvailable,
  TypesettingPreviewPageMm,
  TypesettingTextLine,
} from "@/lib/tauri";
import { docxBlocksToHtml, docxHtmlToBlocks } from "@/typesetting/docxHtml";
import {
  docxBlocksToFontSizePx,
  docxBlocksToLineHeightPx,
  docxBlocksToLayoutTextOptions,
  docxBlocksToPlainText,
} from "@/typesetting/docxText";
import { getDefaultPreviewPageMm } from "@/typesetting/previewDefaults";
import { docOpFromBeforeInput } from "@/typesetting/docOps";
import type {
  DocxBlock,
  DocxPageStyle,
} from "@/typesetting/docxImport";
import {
  DEFAULT_DPI,
  DEFAULT_FONT_SIZE_PX,
  DEFAULT_LINE_HEIGHT_PX,
  type LayoutRender,
  mmToPx,
  pxToMm,
  boxToPx,
  scaleBoxPx,
  defaultLineHeightForFont,
  ensurePositivePx,
  buildRenderedLines,
  buildRenderedImages,
  resolveDocxImage,
  getUtf8ByteLength,
  expandTabs,
  firstRunFontFamilyFromBlocks,
  buildSegmentsFromBlocks,
} from "./typesettingUtils";
import { TypesettingToolbar } from "./TypesettingToolbar";
import { TypesettingPreviewPage } from "./TypesettingPreviewPage";
import { useTypesettingInit } from "./hooks/useTypesettingInit";
import { useTypesettingExport } from "./hooks/useTypesettingExport";

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
  const [zoom, setZoom] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
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
  const layoutRunRef = useRef(0);

  const { error, pageMm, findFallbackFontPath, resolveFontPath } = useTypesettingInit(
    path,
    doc,
    autoOpen,
    tauriAvailable,
    openDoc,
  );

  const handlePageRef = useCallback((node: HTMLDivElement | null) => {
    pageRef.current = node;
    setPageMounted(Boolean(node));
  }, []);

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

  const {
    exporting,
    exportError,
    exportingDocx,
    exportDocxError,
    printing,
    printError,
    openOfficePreview,
    openOfficePdf,
    openOfficeError,
    openOfficeLoading,
    openOfficeTotalPages,
    setOpenOfficeTotalPages,
    openOfficeStale,
    openOfficeAutoRefresh,
    setOpenOfficeAutoRefresh,
    docToolsInstalling,
    handleExport,
    handleExportDocx,
    handlePrint,
    handleToggleOpenOfficePreview,
    handleRefreshOpenOfficePreview,
    handleInstallDocTools,
  } = useTypesettingExport({
    path,
    doc,
    pageMm,
    bodyLayout,
    bodyLines,
    bodyLineStyles,
    headerLayout,
    headerLines,
    footerLayout,
    footerLines,
    bodyPageHeightPx,
    bodyUsesEngine,
    totalPages,
    isEditing,
    setIsEditing,
    currentPage,
    setCurrentPage,
    editableRef,
    pageRef,
    tauriAvailable,
    exportDocx,
    onExportReady,
    pageMounted,
  });

  const displayTotalPages = openOfficePreview && openOfficeTotalPages > 0
    ? openOfficeTotalPages
    : totalPages;

  useEffect(() => {
    setCurrentPage((prev) => Math.min(Math.max(1, prev), displayTotalPages));
  }, [displayTotalPages]);

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-sm text-destructive">Failed to open docx: {error}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-background">
      <TypesettingToolbar
        zoom={zoom}
        setZoom={setZoom}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        displayTotalPages={displayTotalPages}
        isDirty={doc?.isDirty ?? false}
        onSave={() => saveActiveFile()}
        exporting={exporting}
        exportError={exportError}
        onExport={handleExport}
        exportingDocx={exportingDocx}
        exportDocxError={exportDocxError}
        onExportDocx={handleExportDocx}
        printing={printing}
        printError={printError}
        onPrint={handlePrint}
        openOfficePreview={openOfficePreview}
        openOfficeLoading={openOfficeLoading}
        openOfficeError={openOfficeError}
        openOfficeStale={openOfficeStale}
        openOfficeAutoRefresh={openOfficeAutoRefresh}
        onToggleOpenOfficePreview={handleToggleOpenOfficePreview}
        onRefreshOpenOfficePreview={handleRefreshOpenOfficePreview}
        onToggleAutoRefresh={() => setOpenOfficeAutoRefresh((current) => !current)}
        docToolsInstalling={docToolsInstalling}
        onInstallDocTools={handleInstallDocTools}
        tauriAvailable={tauriAvailable}
        editableRef={editableRef}
        layoutSummary={layoutSummary}
      />
      <TypesettingPreviewPage
        openOfficePreview={openOfficePreview}
        openOfficePdf={openOfficePdf}
        openOfficeLoading={openOfficeLoading}
        openOfficeError={openOfficeError}
        docPath={doc?.path ?? "OpenOffice Preview"}
        currentPage={currentPage}
        zoom={zoom}
        setCurrentPage={setCurrentPage}
        setZoom={setZoom}
        setOpenOfficeTotalPages={setOpenOfficeTotalPages}
        pagePx={pagePx}
        pagePxScaled={pagePxScaled}
        handlePageRef={handlePageRef}
        bodyUsesEngine={bodyUsesEngine}
        bodyLayout={bodyLayout}
        pagedBodyLines={pagedBodyLines}
        pagedBodyImages={pagedBodyImages}
        startEditing={startEditing}
        editableRef={editableRef}
        html={html}
        handleBeforeInput={handleBeforeInput}
        handleInput={handleInput}
        handleEditableScroll={handleEditableScroll}
        setIsEditing={setIsEditing}
        headerUsesEngine={headerUsesEngine}
        headerLayout={headerLayout}
        headerLines={headerLines}
        headerImages={headerImages}
        headerHtml={headerHtml}
        footerUsesEngine={footerUsesEngine}
        footerLayout={footerLayout}
        footerLines={footerLines}
        footerImages={footerImages}
        footerHtml={footerHtml}
      />
    </div>
  );
}
