import { PDFCanvas } from "@/components/pdf/PDFCanvas";
import type { LayoutRender, RenderedLine, RenderedImage } from "./typesettingUtils";

type BoxPx = { left: number; top: number; width: number; height: number };

interface TypesettingPreviewPageProps {
  // OpenOffice
  openOfficePreview: boolean;
  openOfficePdf: Uint8Array | null;
  openOfficeLoading: boolean;
  openOfficeError: string | null;
  docPath: string;
  // Navigation
  currentPage: number;
  zoom: number;
  setCurrentPage: (v: number | ((prev: number) => number)) => void;
  setZoom: (v: number | ((prev: number) => number)) => void;
  setOpenOfficeTotalPages: (pages: number) => void;
  // Page layout
  pagePx: { page: BoxPx; body: BoxPx; header: BoxPx; footer: BoxPx } | null;
  pagePxScaled: { page: BoxPx } | null;
  handlePageRef: (node: HTMLDivElement | null) => void;
  // Body
  bodyUsesEngine: boolean;
  bodyLayout: LayoutRender | null;
  pagedBodyLines: RenderedLine[];
  pagedBodyImages: RenderedImage[];
  startEditing: () => void;
  // Editable fallback
  editableRef: React.RefObject<HTMLDivElement | null>;
  html: string;
  handleBeforeInput: (event: React.FormEvent<HTMLDivElement>) => void;
  handleInput: () => void;
  handleEditableScroll: () => void;
  setIsEditing: (v: boolean) => void;
  // Header
  headerUsesEngine: boolean;
  headerLayout: LayoutRender | null;
  headerLines: RenderedLine[];
  headerImages: RenderedImage[];
  headerHtml: string;
  // Footer
  footerUsesEngine: boolean;
  footerLayout: LayoutRender | null;
  footerLines: RenderedLine[];
  footerImages: RenderedImage[];
  footerHtml: string;
}

export function TypesettingPreviewPage({
  openOfficePreview,
  openOfficePdf,
  openOfficeLoading,
  openOfficeError,
  docPath,
  currentPage,
  zoom,
  setCurrentPage,
  setZoom,
  setOpenOfficeTotalPages,
  pagePx,
  pagePxScaled,
  handlePageRef,
  bodyUsesEngine,
  bodyLayout,
  pagedBodyLines,
  pagedBodyImages,
  startEditing,
  editableRef,
  html,
  handleBeforeInput,
  handleInput,
  handleEditableScroll,
  setIsEditing,
  headerUsesEngine,
  headerLayout,
  headerLines,
  headerImages,
  headerHtml,
  footerUsesEngine,
  footerLayout,
  footerLines,
  footerImages,
  footerHtml,
}: TypesettingPreviewPageProps) {
  if (openOfficePreview) {
    return (
      <div className="flex min-h-full items-center justify-center px-6 py-10">
        <div className="w-full max-w-5xl">
          {openOfficePdf ? (
            <PDFCanvas
              pdfData={openOfficePdf}
              filePath={docPath}
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
      </div>
    );
  }

  if (!pagePx) {
    return (
      <div className="flex min-h-full items-center justify-center px-6 py-10">
        <div className="text-center space-y-2">
          <div className="text-lg font-semibold text-foreground">
            Typesetting Document
          </div>
          <p className="text-sm text-muted-foreground">
            Loading preview metrics...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-10">
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
                ref={editableRef as React.RefObject<HTMLDivElement>}
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
    </div>
  );
}
