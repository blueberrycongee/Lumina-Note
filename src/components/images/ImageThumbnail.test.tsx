import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ImageThumbnail } from "./ImageThumbnail";

const readBinaryFileBase64 = vi.hoisted(() => vi.fn(async (path: string) => `base64:${path}`));

vi.mock("@/lib/host", () => ({
  readBinaryFileBase64,
}));

class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 640;
  naturalHeight = 360;

  set src(_value: string) {
    queueMicrotask(() => {
      this.onload?.();
    });
  }
}

describe("ImageThumbnail", () => {
  beforeEach(() => {
    readBinaryFileBase64.mockClear();
    vi.stubGlobal("Image", MockImage);
  });

  it("updates the rendered image when the path changes on the same component instance", async () => {
    const firstPath = `/vault/assets/first-${Date.now()}.png`;
    const secondPath = `/vault/assets/second-${Date.now()}.png`;
    const { rerender } = render(<ImageThumbnail path={firstPath} alt="Preview" />);

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "Preview" })).toHaveAttribute(
        "src",
        `data:image/png;base64,base64:${firstPath}`,
      );
    });

    rerender(<ImageThumbnail path={secondPath} alt="Preview" />);

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "Preview" })).toHaveAttribute(
        "src",
        `data:image/png;base64,base64:${secondPath}`,
      );
    });
  });
});
