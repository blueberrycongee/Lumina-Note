import type { TypesettingPreviewPageMm } from "@/lib/tauri";
import type { DocxPageStyle } from "@/typesetting/docxImport";

export function getDefaultPreviewPageMm(): TypesettingPreviewPageMm {
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 25;
  const headerHeight = 12;
  const footerHeight = 12;
  const bodyWidth = pageWidth - margin * 2;
  const bodyHeight = pageHeight - margin * 2 - headerHeight - footerHeight;

  return {
    page: {
      x_mm: 0,
      y_mm: 0,
      width_mm: pageWidth,
      height_mm: pageHeight,
    },
    body: {
      x_mm: margin,
      y_mm: margin + headerHeight,
      width_mm: bodyWidth,
      height_mm: bodyHeight,
    },
    header: {
      x_mm: margin,
      y_mm: margin,
      width_mm: bodyWidth,
      height_mm: headerHeight,
    },
    footer: {
      x_mm: margin,
      y_mm: margin + headerHeight + bodyHeight,
      width_mm: bodyWidth,
      height_mm: footerHeight,
    },
  };
}

const coalesceMm = (value: number | undefined, fallback: number) => {
  if (!Number.isFinite(value ?? Number.NaN)) return fallback;
  if (value === undefined) return fallback;
  return Math.max(0, value);
};

export function buildPreviewPageMmFromDocx(
  pageStyle: DocxPageStyle,
  fallback: TypesettingPreviewPageMm = getDefaultPreviewPageMm(),
): TypesettingPreviewPageMm {
  const pageWidth = coalesceMm(pageStyle.widthMm, fallback.page.width_mm);
  const pageHeight = coalesceMm(pageStyle.heightMm, fallback.page.height_mm);

  const fallbackMarginTop = fallback.body.y_mm;
  const fallbackMarginLeft = fallback.body.x_mm;
  const fallbackMarginBottom =
    fallback.page.height_mm - (fallback.body.y_mm + fallback.body.height_mm);
  const fallbackMarginRight =
    fallback.page.width_mm - (fallback.body.x_mm + fallback.body.width_mm);
  const fallbackHeaderDistance = fallback.header.y_mm;
  const fallbackFooterDistance =
    fallback.page.height_mm - (fallback.footer.y_mm + fallback.footer.height_mm);

  const marginTop = coalesceMm(pageStyle.marginTopMm, fallbackMarginTop);
  const marginBottom = coalesceMm(pageStyle.marginBottomMm, fallbackMarginBottom);
  const marginLeft = coalesceMm(pageStyle.marginLeftMm, fallbackMarginLeft);
  const marginRight = coalesceMm(pageStyle.marginRightMm, fallbackMarginRight);
  const headerDistance = coalesceMm(pageStyle.headerMm, fallbackHeaderDistance);
  const footerDistance = coalesceMm(pageStyle.footerMm, fallbackFooterDistance);

  const bodyWidth = Math.max(0, pageWidth - marginLeft - marginRight);
  const bodyHeight = Math.max(0, pageHeight - marginTop - marginBottom);
  const headerHeight = Math.max(0, marginTop - headerDistance);
  const footerHeight = Math.max(0, footerDistance);

  return {
    page: {
      x_mm: 0,
      y_mm: 0,
      width_mm: pageWidth,
      height_mm: pageHeight,
    },
    body: {
      x_mm: marginLeft,
      y_mm: marginTop,
      width_mm: bodyWidth,
      height_mm: bodyHeight,
    },
    header: {
      x_mm: marginLeft,
      y_mm: headerDistance,
      width_mm: bodyWidth,
      height_mm: headerHeight,
    },
    footer: {
      x_mm: marginLeft,
      y_mm: Math.max(0, pageHeight - footerDistance),
      width_mm: bodyWidth,
      height_mm: footerHeight,
    },
  };
}
