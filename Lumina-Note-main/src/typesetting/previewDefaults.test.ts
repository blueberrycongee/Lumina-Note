import { describe, expect, it } from "vitest";
import { buildPreviewPageMmFromDocx, getDefaultPreviewPageMm } from "./previewDefaults";
import type { DocxPageStyle } from "./docxImport";

describe("buildPreviewPageMmFromDocx", () => {
  it("maps margins and header/footer distances into page boxes", () => {
    const style: DocxPageStyle = {
      widthMm: 210,
      heightMm: 297,
      marginTopMm: 25,
      marginBottomMm: 25,
      marginLeftMm: 30,
      marginRightMm: 20,
      headerMm: 10,
      footerMm: 12,
    };

    const page = buildPreviewPageMmFromDocx(style);
    expect(page.page.width_mm).toBe(210);
    expect(page.page.height_mm).toBe(297);
    expect(page.body.x_mm).toBe(30);
    expect(page.body.y_mm).toBe(25);
    expect(page.body.width_mm).toBe(160);
    expect(page.body.height_mm).toBe(247);
    expect(page.header.y_mm).toBe(10);
    expect(page.header.height_mm).toBe(15);
    expect(page.footer.y_mm).toBe(285);
    expect(page.footer.height_mm).toBe(12);
  });

  it("falls back to defaults when values are missing", () => {
    const style: DocxPageStyle = {
      marginLeftMm: 22,
    };
    const fallback = getDefaultPreviewPageMm();
    const page = buildPreviewPageMmFromDocx(style, fallback);

    expect(page.page.width_mm).toBe(fallback.page.width_mm);
    expect(page.page.height_mm).toBe(fallback.page.height_mm);
    expect(page.body.x_mm).toBe(22);
    expect(page.body.height_mm).toBe(fallback.body.height_mm);
  });
});
