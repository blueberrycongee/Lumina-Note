import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  getTypesettingLayoutText,
  getTypesettingPreviewPageMm,
} from "@/lib/tauri";

describe("typesetting tauri wrappers", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockClear();
  });

  it("wraps preview command errors with context", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("boom"));

    await expect(getTypesettingPreviewPageMm()).rejects.toThrow(
      "typesetting_preview_page_mm",
    );
  });

  it("passes layout params using snake_case keys", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ lines: [] });

    await getTypesettingLayoutText({
      text: "Hello",
      fontPath: "C:\\fonts\\demo.ttf",
      maxWidth: 640,
      lineHeight: 22,
    });

    expect(vi.mocked(invoke)).toHaveBeenCalledWith(
      "typesetting_layout_text",
      {
        text: "Hello",
        font_path: "C:\\fonts\\demo.ttf",
        max_width: 640,
        line_height: 22,
      },
    );
  });
});
