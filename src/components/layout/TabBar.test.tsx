import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TabBar } from "./TabBar";

const macTopChromeEnabled = vi.hoisted(() => ({ value: false }));
const leftSidebarOpenState = vi.hoisted(() => ({ value: true }));
const switchTab = () => undefined;
const closeTab = async () => undefined;
const closeOtherTabs = () => undefined;
const closeAllTabs = () => undefined;
const reorderTabs = () => undefined;
const togglePinTab = () => undefined;
const fileStoreState = vi.hoisted(() => ({
  tabs: [{ id: "tab-1", name: "Daily Note.md", type: "file", isPinned: false, isDirty: false }],
}));

vi.mock("@/stores/useFileStore", () => ({
  useFileStore: (selector: (state: unknown) => unknown) =>
    selector({
      tabs: fileStoreState.tabs,
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
    },
  }),
}));

vi.mock("@/stores/useUIStore", () => ({
  useUIStore: (selector: (state: unknown) => unknown) =>
    selector({
      leftSidebarOpen: leftSidebarOpenState.value,
    }),
}));

vi.mock("@/lib/reportError", () => ({
  reportOperationError: () => undefined,
}));

vi.mock("./MacTopChrome", () => ({
  useMacTopChromeEnabled: () => macTopChromeEnabled.value,
}));

describe("TabBar", () => {
  beforeEach(() => {
    macTopChromeEnabled.value = false;
    leftSidebarOpenState.value = true;
    fileStoreState.tabs = [{ id: "tab-1", name: "Daily Note.md", type: "file", isPinned: false, isDirty: false }];
  });

  it("does not render macOS top actions outside macOS overlay mode", () => {
    render(<TabBar />);

    expect(screen.queryByTestId("mac-tabbar-top-actions")).not.toBeInTheDocument();
  });

  it("uses the existing tab strip whitespace as the macOS drag region", () => {
    macTopChromeEnabled.value = true;

    render(<TabBar />);

    expect(screen.getByTestId("mac-tabbar-tabstrip")).toHaveAttribute("data-tauri-drag-region", "true");
    expect(screen.queryByTestId("mac-tabbar-top-actions")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mac-tabbar-drag-strip")).not.toBeInTheDocument();
  });

  it("adds a left traffic-light spacer when the file tree is collapsed on macOS", () => {
    macTopChromeEnabled.value = true;
    leftSidebarOpenState.value = false;

    render(<TabBar />);

    expect(screen.getByTestId("mac-tabbar-traffic-light-spacer")).toHaveStyle({ width: "0px" });
  });

  it("does not add the traffic-light spacer while the file tree is open", () => {
    macTopChromeEnabled.value = true;
    leftSidebarOpenState.value = true;

    render(<TabBar />);

    expect(screen.queryByTestId("mac-tabbar-traffic-light-spacer")).not.toBeInTheDocument();
  });

  it("matches the macOS left top bar height at 44px", () => {
    macTopChromeEnabled.value = true;

    render(<TabBar />);

    const tabsRow = screen.getByTestId("mac-tabbar-tabstrip").parentElement;
    expect(tabsRow).toHaveClass("h-11");
    expect(tabsRow).not.toHaveClass("min-h-[32px]");
  });

  it("shows the dedicated image manager tab icon", () => {
    fileStoreState.tabs = [
      { id: "tab-2", name: "Image Manager", type: "image-manager", isPinned: false, isDirty: false },
    ];

    const { container } = render(<TabBar />);

    expect(container.querySelector("svg.lucide-images")).toBeTruthy();
    expect(screen.getByText("Image Manager")).toBeInTheDocument();
  });

  it("uses the primary file icon color for the active file tab", () => {
    const { container } = render(<TabBar />);

    expect(container.querySelector("svg.lucide-file-text")?.getAttribute("class")).toContain("text-primary");
  });
});
