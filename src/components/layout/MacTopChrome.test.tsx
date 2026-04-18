import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MacTopChrome } from "./MacTopChrome";

const tauriMocks = vi.hoisted(() => ({
  isTauri: vi.fn(() => false),
  platform: vi.fn(() => "linux"),
}));

vi.mock("@/lib/host", async () => {
  const actual = await vi.importActual<typeof import("@/lib/host")>("@/lib/host");
  return {
    ...actual,
    isTauri: tauriMocks.isTauri,
    platform: tauriMocks.platform,
  };
});

describe("MacTopChrome", () => {
  beforeEach(() => {
    tauriMocks.isTauri.mockReset();
    tauriMocks.isTauri.mockReturnValue(false);
    tauriMocks.platform.mockReset();
    tauriMocks.platform.mockReturnValue("linux");
  });

  it("renders nothing outside macOS tauri", async () => {
    const { container } = render(<MacTopChrome title="Lumina Note" />);

    await waitFor(() => {
      expect(tauriMocks.platform).not.toHaveBeenCalled();
    });

    expect(container.firstChild).toBeNull();
  });

  it("does not render standalone chrome on macOS tauri", async () => {
    tauriMocks.isTauri.mockReturnValue(true);
    tauriMocks.platform.mockReturnValue("macos");

    const { container } = render(
      <MacTopChrome
        title="Current Thread"
        subtitle="Should stay hidden"
        actions={<button type="button">Open</button>}
      />,
    );

    expect(container.firstChild).toBeNull();
  });
});
