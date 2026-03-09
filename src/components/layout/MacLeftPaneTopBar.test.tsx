import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MacLeftPaneTopBar } from "./MacLeftPaneTopBar";

const openAIMainTab = vi.fn();
const setRightPanelTab = vi.fn();
const toggleLeftSidebar = vi.fn();

vi.mock("@/stores/useFileStore", () => ({
  useFileStore: (selector: (state: unknown) => unknown) =>
    selector({
      openAIMainTab,
    }),
}));

vi.mock("@/stores/useUIStore", () => ({
  useUIStore: (selector: (state: unknown) => unknown) =>
    selector({
      setRightPanelTab,
      toggleLeftSidebar,
    }),
}));

vi.mock("@/stores/useLocaleStore", () => ({
  useLocaleStore: () => ({
    t: {
      welcome: {
        openFolder: "Open Folder",
      },
      globalSearch: {
        title: "Global Search",
      },
      ribbon: {
        aiChatMain: "AI Chat",
      },
      sidebar: {
        files: "Files",
      },
    },
  }),
}));

describe("MacLeftPaneTopBar", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    openAIMainTab.mockReset();
    setRightPanelTab.mockReset();
    toggleLeftSidebar.mockReset();
  });

  it("reserves a dedicated traffic-light safe area and keeps controls interactive", () => {
    const dispatchEventSpy = vi.spyOn(window, "dispatchEvent");

    render(<MacLeftPaneTopBar />);

    expect(screen.getByTestId("mac-left-pane-traffic-lights-safe-area")).toHaveAttribute(
      "data-tauri-drag-region",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Folder" }));
    fireEvent.click(screen.getByRole("button", { name: "Global Search" }));
    fireEvent.click(screen.getByRole("button", { name: "AI Chat" }));
    fireEvent.click(screen.getByRole("button", { name: "Files" }));

    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "open-vault" }));
    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "open-global-search" }));
    expect(openAIMainTab).toHaveBeenCalledTimes(1);
    expect(setRightPanelTab).toHaveBeenCalledWith("outline");
    expect(toggleLeftSidebar).toHaveBeenCalledTimes(1);

    dispatchEventSpy.mockRestore();
  });
});
