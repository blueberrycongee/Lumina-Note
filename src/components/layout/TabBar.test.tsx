import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TabBar } from "./TabBar";

const macTopChromeEnabled = vi.hoisted(() => ({ value: false }));
const switchTab = vi.fn();
const closeTab = vi.fn(async () => {});
const closeOtherTabs = vi.fn();
const closeAllTabs = vi.fn();
const reorderTabs = vi.fn();
const togglePinTab = vi.fn();

vi.mock("@/stores/useFileStore", () => ({
  useFileStore: (selector: (state: unknown) => unknown) =>
    selector({
      tabs: [{ id: "tab-1", name: "Daily Note.md", type: "file", isPinned: false, isDirty: false }],
      activeTabIndex: 0,
      switchTab,
      closeTab,
      closeOtherTabs,
      closeAllTabs,
      reorderTabs,
      togglePinTab,
    }),
}));

vi.mock("@/stores/useLocaleStore", () => ({
  useLocaleStore: () => ({
    t: {
      common: {
        aiChatTab: "AI Chat",
      },
      graph: {
        title: "Graph",
      },
      tabBar: {
        pin: "Pin",
        unpin: "Unpin",
        close: "Close",
        closeOthers: "Close Others",
        closeAll: "Close All",
      },
      overview: {
        commandPalette: "Command Palette",
      },
      globalSearch: {
        title: "Global Search",
      },
      welcome: {
        openFolder: "Open Folder",
      },
    },
  }),
}));

vi.mock("@/lib/reportError", () => ({
  reportOperationError: vi.fn(),
}));

vi.mock("./MacTopChrome", () => ({
  useMacTopChromeEnabled: () => macTopChromeEnabled.value,
}));

describe("TabBar", () => {
  beforeEach(() => {
    macTopChromeEnabled.value = false;
  });

  it("does not render macOS top actions outside macOS overlay mode", () => {
    render(<TabBar />);

    expect(screen.queryByRole("button", { name: "Command Palette" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Global Search" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Folder" })).not.toBeInTheDocument();
  });

  it("renders macOS top actions inside the tab strip and dispatches entry events", () => {
    macTopChromeEnabled.value = true;
    const dispatchEventSpy = vi.spyOn(window, "dispatchEvent");

    render(<TabBar />);

    fireEvent.click(screen.getByRole("button", { name: "Command Palette" }));
    fireEvent.click(screen.getByRole("button", { name: "Global Search" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Folder" }));

    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "open-command-palette" }));
    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "open-global-search" }));
    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "open-vault" }));

    dispatchEventSpy.mockRestore();
  });
});
