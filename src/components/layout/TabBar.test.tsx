import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TabBar } from "./TabBar";

const macTopChromeEnabled = vi.hoisted(() => ({ value: false }));
const leftSidebarOpenState = vi.hoisted(() => ({ value: true }));
const openNewTab = vi.hoisted(() => vi.fn());
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
      openNewTab,
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
      views: {
        newTab: "New Tab",
      },
      tabBar: {
        pin: "Pin",
        unpin: "Unpin",
        close: "Close",
        closeOthers: "Close Others",
        closeAll: "Close All",
        newTab: "New tab",
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
    openNewTab.mockClear();
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

    const { container } = render(<TabBar />);

    expect(container.firstElementChild).toHaveClass("h-11");
    expect(container.firstElementChild).not.toHaveClass("min-h-[32px]");
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

  it("renders a new-tab button immediately after the last tab inside the tab strip", () => {
    render(<TabBar />);

    const newTabButton = screen.getByTestId("mac-tabbar-new-tab");
    expect(newTabButton).toBeInTheDocument();
    expect(newTabButton).toHaveAttribute("aria-label", "New tab");
    expect(screen.getByTestId("mac-tabbar-tabstrip")).toContainElement(newTabButton);
  });

  it("keeps the new-tab button outside the shrinking tab list", () => {
    render(<TabBar />);

    expect(screen.getByTestId("mac-tabbar-tabs")).toHaveClass("flex-1", "overflow-hidden");
    expect(screen.getByTestId("mac-tabbar-new-tab")).toHaveClass("shrink-0");
  });

  it("freezes remaining tab widths during a close batch", () => {
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({
        width: 160,
        height: 38,
        x: 0,
        y: 0,
        top: 0,
        right: 160,
        bottom: 38,
        left: 0,
        toJSON: () => ({}),
      });
    fileStoreState.tabs = [
      { id: "tab-1", name: "Daily Note.md", type: "file", isPinned: false, isDirty: false },
      { id: "tab-2", name: "Project.md", type: "file", isPinned: false, isDirty: false },
    ];

    render(<TabBar />);

    fireEvent.click(screen.getAllByLabelText("Close")[0]);

    expect(screen.getByTestId("mac-tabbar-tab-tab-2")).toHaveStyle({
      flexBasis: "160px",
      minWidth: "160px",
      maxWidth: "160px",
    });

    rectSpy.mockRestore();
  });

  it("opens a real new tab when the new-tab button is clicked", () => {
    render(<TabBar />);

    fireEvent.click(screen.getByTestId("mac-tabbar-new-tab"));

    expect(openNewTab).toHaveBeenCalledTimes(1);
  });

  it("does not render a fake new-tab when there are no store tabs", () => {
    fileStoreState.tabs = [];

    render(<TabBar />);

    expect(screen.getByTestId("mac-tabbar-tabstrip")).toContainElement(screen.getByTestId("mac-tabbar-new-tab"));
    expect(screen.queryByText("New Tab")).not.toBeInTheDocument();
  });

  it("renders store-backed new tabs as closeable tab items", () => {
    fileStoreState.tabs = [
      { id: "new-tab-1", name: "New Tab", type: "new-tab", isPinned: false, isDirty: false },
    ];

    render(<TabBar />);

    expect(screen.getByText("New Tab")).toBeInTheDocument();
    expect(screen.getByLabelText("Close")).toBeInTheDocument();
  });
});
