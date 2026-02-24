import { act, render, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CodexEmbeddedWebview } from "./CodexEmbeddedWebview";

describe("CodexEmbeddedWebview", () => {
  const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("updates bounds when webview already exists", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "codex_webview_exists") return Promise.resolve(true);
      return Promise.resolve(null);
    });

    const rect = {
      left: 10,
      top: 20,
      width: 300,
      height: 400,
      right: 310,
      bottom: 420,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    } as unknown as DOMRect;

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => rect);

    const { rerender } = render(
      <CodexEmbeddedWebview url="http://127.0.0.1:1/view" visible closeOnUnmount={false} />,
    );

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("navigate_codex_webview", { url: "http://127.0.0.1:1/view" });
    });

    rerender(<CodexEmbeddedWebview url="http://127.0.0.1:1/view" visible={false} closeOnUnmount={false} />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("set_codex_webview_visible", { visible: false });
    });
  });

  it("hides the native webview on unmount when closeOnUnmount is false", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "codex_webview_exists") return Promise.resolve(true);
      return Promise.resolve(null);
    });

    const rect = {
      left: 10,
      top: 20,
      width: 300,
      height: 400,
      right: 310,
      bottom: 420,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    } as unknown as DOMRect;

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => rect);

    const { unmount } = render(<CodexEmbeddedWebview url="http://127.0.0.1:1/view" visible closeOnUnmount={false} />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("navigate_codex_webview", { url: "http://127.0.0.1:1/view" });
    });

    unmount();

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("set_codex_webview_visible", { visible: false });
    });
  });

  it("resyncs bounds after toggling visibility back on", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "codex_webview_exists") return Promise.resolve(true);
      return Promise.resolve(null);
    });

    const rect = {
      left: 10,
      top: 20,
      width: 300,
      height: 400,
      right: 310,
      bottom: 420,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    } as unknown as DOMRect;

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => rect);

    const { rerender } = render(
      <CodexEmbeddedWebview url="http://127.0.0.1:1/view" visible closeOnUnmount={false} />,
    );

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("update_codex_webview_bounds", {
        x: 10,
        y: 20,
        width: 300,
        height: 400,
      });
    });

    const initialUpdateCount = invokeMock.mock.calls.filter((call) => call[0] === "update_codex_webview_bounds").length;

    rerender(<CodexEmbeddedWebview url="http://127.0.0.1:1/view" visible={false} closeOnUnmount={false} />);
    rerender(<CodexEmbeddedWebview url="http://127.0.0.1:1/view" visible closeOnUnmount={false} />);

    await waitFor(() => {
      const nextCount = invokeMock.mock.calls.filter((call) => call[0] === "update_codex_webview_bounds").length;
      expect(nextCount).toBeGreaterThan(initialUpdateCount);
    });
  });

  it("marks the native webview visible when showing", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "codex_webview_exists") return Promise.resolve(true);
      return Promise.resolve(null);
    });

    const rect = {
      left: 10,
      top: 20,
      width: 300,
      height: 400,
      right: 310,
      bottom: 420,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    } as unknown as DOMRect;

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => rect);

    const { rerender } = render(
      <CodexEmbeddedWebview url="http://127.0.0.1:1/view" visible closeOnUnmount={false} />,
    );

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("set_codex_webview_visible", { visible: true });
    });

    rerender(<CodexEmbeddedWebview url="http://127.0.0.1:2/view" visible closeOnUnmount={false} />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("navigate_codex_webview", { url: "http://127.0.0.1:2/view" });
    });
  });

  it("does not show the native webview when hidden", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "codex_webview_exists") return Promise.resolve(true);
      return Promise.resolve(null);
    });

    const rect = {
      left: 10,
      top: 20,
      width: 300,
      height: 400,
      right: 310,
      bottom: 420,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    } as unknown as DOMRect;

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => rect);

    render(<CodexEmbeddedWebview url="http://127.0.0.1:1/view" visible={false} closeOnUnmount={false} />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("set_codex_webview_visible", { visible: false });
    });

    expect(invokeMock).not.toHaveBeenCalledWith("set_codex_webview_visible", { visible: true });
  });

  it("retries creation when initial bounds are zero", async () => {
    vi.useFakeTimers();
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "codex_webview_exists") return Promise.resolve(false);
      return Promise.resolve(null);
    });

    const zeroRect = {
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as unknown as DOMRect;

    const rect = {
      left: 10,
      top: 20,
      width: 300,
      height: 400,
      right: 310,
      bottom: 420,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    } as unknown as DOMRect;

    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementationOnce(() => zeroRect)
      .mockImplementation(() => rect);

    render(<CodexEmbeddedWebview url="http://127.0.0.1:1/view" visible closeOnUnmount={false} />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(invokeMock).toHaveBeenCalledWith("create_codex_webview", {
      url: "http://127.0.0.1:1/view",
      x: 10,
      y: 20,
      width: 300,
      height: 400,
    });

    rectSpy.mockRestore();
    vi.useRealTimers();
  });

  it("retries bounds updates when existing webview has zero size", async () => {
    vi.useFakeTimers();
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "codex_webview_exists") return Promise.resolve(true);
      return Promise.resolve(null);
    });

    const zeroRect = {
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as unknown as DOMRect;

    const rect = {
      left: 12,
      top: 24,
      width: 360,
      height: 480,
      right: 372,
      bottom: 504,
      x: 12,
      y: 24,
      toJSON: () => ({}),
    } as unknown as DOMRect;

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementationOnce(() => zeroRect)
      .mockImplementation(() => rect);

    render(<CodexEmbeddedWebview url="http://127.0.0.1:1/view" visible closeOnUnmount={false} />);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(invokeMock).toHaveBeenCalledWith("update_codex_webview_bounds", {
      x: 12,
      y: 24,
      width: 360,
      height: 480,
    });

    vi.useRealTimers();
  });
});
