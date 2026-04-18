import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TitleBar } from "./TitleBar";

const tauriMocks = vi.hoisted(() => {
  const appWindow = {
    isMaximized: vi.fn(async () => false),
    onResized: vi.fn(async () => () => {}),
    startDragging: async () => undefined,
    minimize: async () => undefined,
    toggleMaximize: async () => undefined,
    close: async () => undefined,
  };
  return {
    appWindow,
    isTauri: vi.fn(() => false),
    getCurrentWindow: vi.fn(() => appWindow),
    platform: vi.fn(() => "linux"),
  };
});

vi.mock("@/lib/host", async () => {
  const actual = await vi.importActual<typeof import("@/lib/host")>("@/lib/host");
  return {
    ...actual,
    isTauri: tauriMocks.isTauri,
    getCurrentWindow: tauriMocks.getCurrentWindow,
    platform: tauriMocks.platform,
  };
});

describe("TitleBar", () => {
  beforeEach(() => {
    tauriMocks.isTauri.mockReset();
    tauriMocks.isTauri.mockReturnValue(false);
    tauriMocks.getCurrentWindow.mockClear();
    tauriMocks.platform.mockReset();
    tauriMocks.platform.mockReturnValue("linux");

    tauriMocks.appWindow.isMaximized.mockClear();
    tauriMocks.appWindow.onResized.mockClear();
  });

  it("does not touch tauri window APIs when tauri runtime is unavailable", async () => {
    render(<TitleBar />);

    expect(screen.getByText("Lumina Note")).toBeInTheDocument();
    await waitFor(() => {
      expect(tauriMocks.getCurrentWindow).not.toHaveBeenCalled();
      expect(tauriMocks.platform).not.toHaveBeenCalled();
    });
  });

  it("initializes window listeners when tauri runtime is available", async () => {
    tauriMocks.isTauri.mockReturnValue(true);

    render(<TitleBar />);

    await waitFor(() => {
      expect(tauriMocks.platform).toHaveBeenCalled();
      expect(tauriMocks.getCurrentWindow).toHaveBeenCalled();
      expect(tauriMocks.appWindow.onResized).toHaveBeenCalled();
    });
  });

  it("renders no web title bar chrome on macOS tauri windows", async () => {
    tauriMocks.isTauri.mockReturnValue(true);
    tauriMocks.platform.mockReturnValue("darwin");

    const { container } = render(<TitleBar />);

    await waitFor(() => {
      expect(tauriMocks.platform).toHaveBeenCalled();
    });

    expect(screen.queryByText("Lumina Note")).not.toBeInTheDocument();
    expect(screen.queryByTestId("macos-titlebar-spacer")).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });
});
