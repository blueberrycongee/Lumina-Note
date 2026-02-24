import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { invoke, type InvokeArgs } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { TypesettingPreviewPane } from "@/components/typesetting/TypesettingPreviewPane";

describe("TypesettingPreviewPane", () => {
  it("renders the preview page using the tauri metrics", async () => {
    const invokeMock = vi.mocked(invoke);

    render(<TypesettingPreviewPane />);

    const page = await screen.findByTestId("typesetting-preview-page");

    expect(page).toHaveStyle({ width: "794px", height: "1123px" });
    expect(invokeMock).toHaveBeenCalledWith("typesetting_preview_page_mm", undefined);
  });

  it("renders a layout summary when sample layout data is available", async () => {
    render(<TypesettingPreviewPane />);

    const summary = await screen.findByTestId("typesetting-layout-summary");

    await waitFor(() => {
      expect(summary).toHaveTextContent("Layout: 2 lines");
    });
  });

  it("shows layout unavailable when fixture font is missing", async () => {
    const invokeMock = vi.mocked(invoke);
    const baseImpl = invokeMock.getMockImplementation();

    invokeMock.mockImplementation((cmd: string, args?: InvokeArgs) => {
      if (cmd === "typesetting_fixture_font_path") {
        return Promise.resolve(null);
      }
      return baseImpl ? baseImpl(cmd, args) : Promise.resolve(null);
    });

    render(<TypesettingPreviewPane />);

    const summary = await screen.findByTestId("typesetting-layout-summary");

    await waitFor(() => {
      expect(summary).toHaveTextContent("Layout unavailable");
    });

    invokeMock.mockImplementation(baseImpl ?? (() => Promise.resolve(null)));
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

  it("exports a placeholder PDF via the typesetting pipeline", async () => {
    const invokeMock = vi.mocked(invoke);
    const saveMock = vi.mocked(save);
    const writeFileMock = vi.mocked(writeFile);

    saveMock.mockResolvedValue("C:\\temp\\typesetting-preview.pdf");

    render(<TypesettingPreviewPane />);

    await screen.findByTestId("typesetting-preview-page");
    fireEvent.click(screen.getByRole("button", { name: /export pdf/i }));

    await waitFor(() => {
      expect(writeFileMock).toHaveBeenCalled();
    });

    expect(invokeMock).toHaveBeenCalledWith("typesetting_export_pdf_base64", undefined);

    const [path, data] = writeFileMock.mock.calls[0] ?? [];
    expect(path).toBe("C:\\temp\\typesetting-preview.pdf");

    const bytes = data as Uint8Array;
    const text = Buffer.from(bytes).toString("utf8");
    expect(text.startsWith("%PDF-1.7")).toBe(true);
  });
});
