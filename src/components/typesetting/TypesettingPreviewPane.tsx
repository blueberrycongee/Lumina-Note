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

const mmToPx = (mm: number, dpi = DEFAULT_DPI) =>
  Math.round((Math.max(0, mm) * dpi) / 25.4);

const boxToPx = (box: PreviewBoxMm) => ({
  left: mmToPx(box.x_mm),
  top: mmToPx(box.y_mm),
  width: mmToPx(box.width_mm),
  height: mmToPx(box.height_mm),
});

export function TypesettingPreviewPane() {
  const [pageMm, setPageMm] = useState<TypesettingPreviewPageMm | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    return {
      page: boxToPx(pageMm.page),
      body: boxToPx(pageMm.body),
      header: boxToPx(pageMm.header),
      footer: boxToPx(pageMm.footer),
    };
  }, [pageMm]);

  return (
    <div className="flex-1 overflow-auto bg-background">
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
