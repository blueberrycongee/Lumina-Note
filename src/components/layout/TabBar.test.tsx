import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TabBar, projectDraggedTabOrder } from "./TabBar";
import type { Tab } from "@/stores/useFileStore";

const tabBarSource = readFileSync(path.resolve(__dirname, "TabBar.tsx"), "utf8");

const macTopChromeEnabled = vi.hoisted(() => ({ value: false }));
const leftSidebarOpenState = vi.hoisted(() => ({ value: true }));
const rightSidebarOpenState = vi.hoisted(() => ({ value: true }));
const openNewTab = vi.hoisted(() => vi.fn());
const toggleLeftSidebar = vi.hoisted(() => vi.fn());
const toggleRightSidebar = vi.hoisted(() => vi.fn());
const switchTab = vi.hoisted(() => vi.fn());
const closeTab = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const closeOtherTabs = vi.hoisted(() => vi.fn());
const closeAllTabs = vi.hoisted(() => vi.fn());
const reorderTabs = vi.hoisted(() => vi.fn());
const togglePinTab = vi.hoisted(() => vi.fn());
const promotePreviewTab = vi.hoisted(() => vi.fn());
const activeTabIndexState = vi.hoisted(() => ({ value: 0 }));
const tab = vi.hoisted(() =>
  (overrides: Partial<Tab> & Pick<Tab, "id" | "name" | "type">): Tab => ({
    path: overrides.path ?? (overrides.type === "new-tab" ? "" : `/vault/${overrides.name}`),
    content: overrides.content ?? "",
    isDirty: overrides.isDirty ?? false,
    isPinned: overrides.isPinned,
    undoStack: overrides.undoStack ?? [],
    redoStack: overrides.redoStack ?? [],
    ...overrides,
  }),
);
const fileStoreState = vi.hoisted(() => ({
  tabs: [tab({ id: "tab-1", name: "Daily Note.md", type: "file", isPinned: false })],
}));

vi.mock("@/stores/useFileStore", () => ({
  useFileStore: (selector: (state: unknown) => unknown) =>
    selector({
      tabs: fileStoreState.tabs,
      activeTabIndex: activeTabIndexState.value,
      openNewTab,
      switchTab,
      closeTab,
      closeOtherTabs,
      closeAllTabs,
      reorderTabs,
      togglePinTab,
      promotePreviewTab,
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
      sidebar: {
        toggleSidebar: "Toggle left sidebar",
        toggleRightPanel: "Toggle right panel",
        collapseLeftSidebar: "Collapse left sidebar",
        expandLeftSidebar: "Expand left sidebar",
        collapseRightPanel: "Collapse right sidebar",
        expandRightPanel: "Expand right sidebar",
      },
    },
  }),
}));

vi.mock("@/stores/useUIStore", () => ({
  useUIStore: (selector: (state: unknown) => unknown) =>
    selector({
      leftSidebarOpen: leftSidebarOpenState.value,
      rightSidebarOpen: rightSidebarOpenState.value,
      toggleLeftSidebar,
      toggleRightSidebar,
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
    rightSidebarOpenState.value = true;
    activeTabIndexState.value = 0;
    fileStoreState.tabs = [tab({ id: "tab-1", name: "Daily Note.md", type: "file", isPinned: false })];
    openNewTab.mockClear();
    switchTab.mockClear();
    closeTab.mockClear();
    closeOtherTabs.mockClear();
    closeAllTabs.mockClear();
    reorderTabs.mockClear();
    togglePinTab.mockClear();
    promotePreviewTab.mockClear();
    toggleLeftSidebar.mockClear();
    toggleRightSidebar.mockClear();
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

  it("draws the tab bar bottom rule behind the tab shapes", () => {
    const { container } = render(<TabBar />);

    expect(container.firstElementChild).not.toHaveClass("border-b");
    expect(container.firstElementChild).not.toHaveClass("shadow-elev-1");
    expect(screen.getByTestId("mac-tabbar-bottom-rule")).toHaveClass(
      "absolute",
      "bottom-0",
      "z-0",
      "bg-border/60",
    );
    expect(screen.getByTestId("mac-tabbar-tabstrip")).toHaveClass(
      "relative",
      "z-10",
    );
  });

  it("shows the dedicated image manager tab icon", () => {
    fileStoreState.tabs = [
      tab({ id: "tab-2", name: "Image Manager", type: "image-manager", isPinned: false }),
    ];

    const { container } = render(<TabBar />);

    expect(container.querySelector("svg.lucide-images")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Image Manager" })).toHaveAttribute(
      "title",
      "Image Manager",
    );
  });

  it("uses the primary file icon color for the active file tab", () => {
    const { container } = render(<TabBar />);

    expect(container.querySelector("svg.lucide-file-text")?.getAttribute("class")).toContain("text-primary");
  });

  it("renders a centered new-tab button between the tab strip and right sidebar toggle", () => {
    render(<TabBar />);

    const newTabButton = screen.getByTestId("mac-tabbar-new-tab");
    expect(newTabButton).toBeInTheDocument();
    expect(newTabButton).toHaveAttribute("aria-label", "New tab");
    expect(screen.getByTestId("mac-tabbar-new-tab-slot")).toContainElement(
      newTabButton,
    );
  });

  it("reserves sidebar toggle slots at the far edges of the tab bar", () => {
    render(<TabBar />);

    expect(screen.getByTestId("mac-tabbar-left-sidebar-slot")).toContainElement(
      screen.getByTestId("mac-tabbar-toggle-left-sidebar"),
    );
    expect(screen.getByTestId("mac-tabbar-new-tab-slot")).toContainElement(
      screen.getByTestId("mac-tabbar-new-tab"),
    );
    expect(screen.getByTestId("mac-tabbar-right-sidebar-slot")).toContainElement(
      screen.getByTestId("mac-tabbar-toggle-right-sidebar"),
    );
  });

  it("keeps the new-tab button to the left of the right sidebar toggle", () => {
    render(<TabBar />);

    expect(
      screen
        .getByTestId("mac-tabbar-new-tab")
        .compareDocumentPosition(
          screen.getByTestId("mac-tabbar-toggle-right-sidebar"),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("toggles both sidebars from the tab bar edge controls", () => {
    render(<TabBar />);

    fireEvent.click(screen.getByTestId("mac-tabbar-toggle-left-sidebar"));
    fireEvent.click(screen.getByTestId("mac-tabbar-toggle-right-sidebar"));

    expect(toggleLeftSidebar).toHaveBeenCalledTimes(1);
    expect(toggleRightSidebar).toHaveBeenCalledTimes(1);
  });

  it("uses icon-only primary accent styling for open sidebar states", () => {
    render(<TabBar />);

    expect(screen.getByTestId("mac-tabbar-toggle-left-sidebar")).toHaveClass(
      "text-primary",
    );
    expect(screen.getByTestId("mac-tabbar-toggle-right-sidebar")).toHaveClass(
      "text-primary",
    );
    expect(screen.getByTestId("mac-tabbar-toggle-left-sidebar")).not.toHaveClass(
      "bg-primary/10",
    );
    expect(screen.getByTestId("mac-tabbar-toggle-right-sidebar")).not.toHaveClass(
      "bg-primary/10",
    );
    expect(screen.getByTestId("mac-tabbar-toggle-left-sidebar")).toHaveAttribute(
      "aria-label",
      "Collapse left sidebar",
    );
    expect(screen.getByTestId("mac-tabbar-toggle-right-sidebar")).toHaveAttribute(
      "aria-label",
      "Collapse right sidebar",
    );
  });

  it("renders window-style sidebar state icons", () => {
    render(<TabBar />);

    const leftIcon = screen
      .getByTestId("mac-tabbar-toggle-left-sidebar")
      .querySelector("svg");
    const rightIcon = screen
      .getByTestId("mac-tabbar-toggle-right-sidebar")
      .querySelector("svg");

    expect(leftIcon).toHaveAttribute("viewBox", "0 0 24 24");
    expect(rightIcon).toHaveAttribute("viewBox", "0 0 24 24");
    expect(leftIcon?.querySelector('rect[x="4"][y="4"][rx="5"]')).toBeTruthy();
    expect(rightIcon?.querySelector('rect[x="4"][y="4"][rx="5"]')).toBeTruthy();
    expect(leftIcon?.querySelector('rect[x="4"][width="8"]')).toBeTruthy();
    expect(rightIcon?.querySelector('rect[x="12"][width="8"]')).toBeTruthy();
    expect(leftIcon?.querySelector("line")).toBeTruthy();
    expect(rightIcon?.querySelector("line")).toBeTruthy();
  });

  it("uses muted styling for collapsed sidebar states", () => {
    leftSidebarOpenState.value = false;
    rightSidebarOpenState.value = false;

    render(<TabBar />);

    expect(screen.getByTestId("mac-tabbar-toggle-left-sidebar")).not.toHaveClass(
      "bg-primary/10",
    );
    expect(screen.getByTestId("mac-tabbar-toggle-right-sidebar")).not.toHaveClass(
      "bg-primary/10",
    );
    expect(screen.getByTestId("mac-tabbar-toggle-left-sidebar")).toHaveAttribute(
      "aria-label",
      "Expand left sidebar",
    );
    expect(screen.getByTestId("mac-tabbar-toggle-right-sidebar")).toHaveAttribute(
      "aria-label",
      "Expand right sidebar",
    );
  });

  it("keeps the new-tab button inside the scrollable tab track", () => {
    render(<TabBar />);

    expect(screen.getByTestId("mac-tabbar-tabs")).toHaveClass("flex-1", "overflow-x-auto");
    expect(screen.getByTestId("mac-tabbar-new-tab")).toHaveClass("shrink-0");
    expect(screen.getByTestId("mac-tabbar-tabs")).toContainElement(
      screen.getByTestId("mac-tabbar-new-tab"),
    );
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
      tab({ id: "tab-1", name: "Daily Note.md", type: "file", isPinned: false }),
      tab({ id: "tab-2", name: "Project.md", type: "file", isPinned: false }),
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

  it("does not close a permanent tab on double-click", () => {
    render(<TabBar />);

    fireEvent.doubleClick(screen.getByRole("tab"));

    expect(closeTab).not.toHaveBeenCalled();
    expect(promotePreviewTab).not.toHaveBeenCalled();
  });

  it("promotes a preview tab on double-click", () => {
    fileStoreState.tabs = [
      tab({ id: "tab-1", name: "Draft.md", type: "file", isPreview: true, isPinned: false }),
    ];

    render(<TabBar />);

    fireEvent.doubleClick(screen.getByRole("tab"));

    expect(promotePreviewTab).toHaveBeenCalledWith("tab-1");
    expect(closeTab).not.toHaveBeenCalled();
  });

  it("closes an unpinned tab with middle click", () => {
    render(<TabBar />);

    fireEvent(
      screen.getByRole("tab"),
      new MouseEvent("auxclick", { bubbles: true, button: 1 }),
    );

    expect(closeTab).toHaveBeenCalledWith(0);
  });

  it("uses the right-clicked tab id when the menu action runs after reordering", () => {
    fileStoreState.tabs = [
      tab({ id: "tab-1", name: "A.md", type: "file", isPinned: false }),
      tab({ id: "tab-2", name: "B.md", type: "file", isPinned: false }),
    ];
    const { rerender } = render(<TabBar />);

    fireEvent.contextMenu(screen.getByRole("tab", { name: "B.md" }));
    fileStoreState.tabs = [
      tab({ id: "tab-2", name: "B.md", type: "file", isPinned: false }),
      tab({ id: "tab-1", name: "A.md", type: "file", isPinned: false }),
    ];
    rerender(<TabBar />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Pin" }));

    expect(togglePinTab).toHaveBeenCalledWith(0);
  });

  it("does not render a fake new-tab when there are no store tabs", () => {
    fileStoreState.tabs = [];

    render(<TabBar />);

    expect(screen.getByTestId("mac-tabbar-new-tab-slot")).toContainElement(screen.getByTestId("mac-tabbar-new-tab"));
    expect(screen.queryByText("New Tab")).not.toBeInTheDocument();
  });

  it("renders store-backed new tabs as closeable tab items", () => {
    fileStoreState.tabs = [
      tab({ id: "new-tab-1", name: "New Tab", type: "new-tab", isPinned: false }),
    ];

    render(<TabBar />);

    expect(screen.getByText("New Tab")).toBeInTheDocument();
    expect(screen.getByLabelText("Close")).toBeInTheDocument();
  });

  it("keeps drag lift styling off the rectangular tab layout box and snaps back to layout", () => {
    fileStoreState.tabs = [
      tab({ id: "tab-1", name: "Daily Note.md", type: "file", isPinned: false }),
      tab({ id: "tab-2", name: "Project.md", type: "file", isPinned: false }),
    ];

    const { container } = render(<TabBar />);
    const tabBox = screen.getByTestId("mac-tabbar-tab-tab-1");

    expect(tabBox).not.toHaveStyle({ boxShadow: "0 8px 24px rgba(0,0,0,0.18)" });
    expect(container.querySelector("svg path[style*='drop-shadow']")).toBeNull();
    expect(tabBox).not.toHaveAttribute("draggable", "true");
  });

  it("does not vertically lift a tab while dragging", () => {
    expect(tabBarSource).toContain("y: 0");
    expect(tabBarSource).not.toContain("y: isDragging ? -");
  });

  it("projects tab order from drag position within the same pin group", () => {
    const tabs = [
      { id: "pinned", name: "Pinned.md", type: "file", isPinned: true, isDirty: false },
      { id: "tab-1", name: "Daily Note.md", type: "file", isPinned: false, isDirty: false },
      { id: "tab-2", name: "Project.md", type: "file", isPinned: false, isDirty: false },
      { id: "tab-3", name: "Archive.md", type: "file", isPinned: false, isDirty: false },
    ];
    const layouts = new Map([
      ["pinned", { x: 0, width: 120 }],
      ["tab-1", { x: 100, width: 120 }],
      ["tab-2", { x: 200, width: 120 }],
      ["tab-3", { x: 300, width: 120 }],
    ]);

    expect(projectDraggedTabOrder("tab-1", 240, tabs, layouts)).toEqual([
      "pinned",
      "tab-2",
      "tab-3",
      "tab-1",
    ]);
    expect(projectDraggedTabOrder("tab-1", -180, tabs, layouts)).toEqual([
      "pinned",
      "tab-1",
      "tab-2",
      "tab-3",
    ]);
  });

  it("projects to the nearest original slot instead of waiting for the dragged center to cross", () => {
    const tabs = [
      { id: "pinned", isPinned: true },
      { id: "tab-1", isPinned: false },
      { id: "tab-2", isPinned: false },
      { id: "tab-3", isPinned: false },
    ];
    const layouts = new Map([
      ["pinned", { x: 0, width: 120 }],
      ["tab-1", { x: 100, width: 120 }],
      ["tab-2", { x: 200, width: 120 }],
      ["tab-3", { x: 300, width: 120 }],
    ]);

    expect(projectDraggedTabOrder("tab-1", 40, tabs, layouts)).toEqual([
      "pinned",
      "tab-1",
      "tab-2",
      "tab-3",
    ]);
    expect(projectDraggedTabOrder("tab-1", 60, tabs, layouts)).toEqual([
      "pinned",
      "tab-2",
      "tab-1",
      "tab-3",
    ]);
  });
});
