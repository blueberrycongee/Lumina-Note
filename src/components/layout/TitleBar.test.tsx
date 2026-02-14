import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TitleBar } from "./TitleBar";

const tauriMocks = vi.hoisted(() => {
  const appWindow = {
    isMaximized: vi.fn(async () => false),
    onResized: vi.fn(async () => () => {}),
    startDragging: vi.fn(async () => {}),
    minimize: vi.fn(async () => {}),
    toggleMaximize: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  return {
    appWindow,
    isTauri: vi.fn(() => false),
    getCurrentWindow: vi.fn(() => appWindow),
    platform: vi.fn(() => "linux"),
  };
});

vi.mock("@tauri-apps/api/core", async () => {
  const actual = await vi.importActual<typeof import("@tauri-apps/api/core")>(
    "@tauri-apps/api/core",
  );
  return {
    ...actual,
    isTauri: tauriMocks.isTauri,
  };
});

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: tauriMocks.getCurrentWindow,
}));

vi.mock("@tauri-apps/plugin-os", () => ({
  platform: tauriMocks.platform,
}));

describe("TitleBar", () => {
  beforeEach(() => {
    tauriMocks.isTauri.mockReset();
    tauriMocks.isTauri.mockReturnValue(false);
    tauriMocks.getCurrentWindow.mockClear();
    tauriMocks.platform.mockReset();
    tauriMocks.platform.mockReturnValue("linux");

    tauriMocks.appWindow.isMaximized.mockClear();
    tauriMocks.appWindow.onResized.mockClear();
    tauriMocks.appWindow.startDragging.mockClear();
    tauriMocks.appWindow.minimize.mockClear();
    tauriMocks.appWindow.toggleMaximize.mockClear();
    tauriMocks.appWindow.close.mockClear();
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
});

