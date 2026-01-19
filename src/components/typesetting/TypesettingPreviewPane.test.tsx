import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { TypesettingPreviewPane } from "@/components/typesetting/TypesettingPreviewPane";

describe("TypesettingPreviewPane", () => {
  it("renders the preview page using the tauri metrics", async () => {
    const invokeMock = vi.mocked(invoke);

    render(<TypesettingPreviewPane />);

    const page = await screen.findByTestId("typesetting-preview-page");

    expect(page).toHaveStyle({ width: "794px", height: "1123px" });
    expect(invokeMock).toHaveBeenCalledWith("typesetting_preview_page_mm");
  });

  it("zooms the preview page when the zoom controls are used", async () => {
    render(<TypesettingPreviewPane />);

    const page = await screen.findByTestId("typesetting-preview-page");
    const zoomIn = screen.getByRole("button", { name: /zoom in/i });
    const zoomOut = screen.getByRole("button", { name: /zoom out/i });

    fireEvent.click(zoomIn);
    expect(page).toHaveStyle({ width: "873px", height: "1235px" });

    fireEvent.click(zoomOut);
    expect(page).toHaveStyle({ width: "794px", height: "1123px" });
  });
});
