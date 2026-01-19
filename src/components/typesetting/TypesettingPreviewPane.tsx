import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type PreviewBoxMm = {
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
};

type TypesettingPreviewPageMm = {
  page: PreviewBoxMm;
  body: PreviewBoxMm;
  header: PreviewBoxMm;
  footer: PreviewBoxMm;
};

const DEFAULT_DPI = 96;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;

const mmToPx = (mm: number, dpi = DEFAULT_DPI) =>
  Math.round((Math.max(0, mm) * dpi) / 25.4);

const boxToPx = (box: PreviewBoxMm) => ({
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

export function TypesettingPreviewPane() {
  const [pageMm, setPageMm] = useState<TypesettingPreviewPageMm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let active = true;

    invoke<TypesettingPreviewPageMm>("typesetting_preview_page_mm")
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

  const zoomLabel = `${Math.round(zoom * 100)}%`;
  const zoomOutDisabled = zoom <= MIN_ZOOM;
  const zoomInDisabled = zoom >= MAX_ZOOM;

  return (
    <div className="flex-1 overflow-auto bg-background">
      <div className="sticky top-0 z-10 flex items-center justify-center bg-background/80 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground shadow-sm">
          <button
            type="button"
            className="rounded border border-border px-2 py-0.5 text-sm disabled:opacity-50"
            aria-label="Zoom out"
            onClick={() =>
              setZoom((current) => clampZoom(roundZoom(current - ZOOM_STEP)))
            }
            disabled={zoomOutDisabled}
          >
            -
          </button>
          <span data-testid="typesetting-zoom-label" className="min-w-[3rem] text-center">
            {zoomLabel}
          </span>
          <button
            type="button"
            className="rounded border border-border px-2 py-0.5 text-sm disabled:opacity-50"
            aria-label="Zoom in"
            onClick={() =>
              setZoom((current) => clampZoom(roundZoom(current + ZOOM_STEP)))
            }
            disabled={zoomInDisabled}
          >
            +
          </button>
        </div>
      </div>
      <div className="flex min-h-full items-center justify-center px-6 py-10">
        {!pagePx ? (
          <div className="text-center space-y-2">
            <div className="text-lg font-semibold text-foreground">
              Typesetting Preview
            </div>
            <p className="text-sm text-muted-foreground">
              {error ? `Unable to load preview metrics: ${error}` : "Loading preview metrics..."}
            </p>
          </div>
        ) : (
          <div
            className="relative rounded-lg border border-border bg-white shadow-sm"
            data-testid="typesetting-preview-page"
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
            />
            <div
              className="absolute border border-dotted border-muted-foreground/30"
              style={{
                left: pagePx.header.left,
                top: pagePx.header.top,
                width: pagePx.header.width,
                height: pagePx.header.height,
              }}
            />
            <div
              className="absolute border border-dotted border-muted-foreground/30"
              style={{
                left: pagePx.footer.left,
                top: pagePx.footer.top,
                width: pagePx.footer.width,
                height: pagePx.footer.height,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
