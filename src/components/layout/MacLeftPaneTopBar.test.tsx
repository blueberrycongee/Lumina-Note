import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MacLeftPaneTopBar } from "./MacLeftPaneTopBar";

const toggleLeftSidebar = vi.fn();

vi.mock("@/stores/useUIStore", () => ({
  useUIStore: (selector: (state: unknown) => unknown) =>
    selector({
      toggleLeftSidebar,
    }),
}));

vi.mock("@/stores/useFileStore", () => ({
  useFileStore: (selector: (state: unknown) => unknown) =>
    selector({
      isLoadingTree: false,
      refreshFileTree: vi.fn(),
    }),
}));

vi.mock("@/stores/useLocaleStore", () => ({
  useLocaleStore: () => ({
    t: {
      sidebar: {
        files: "Files",
        newNote: "New Note",
        newDiagram: "New Diagram",
        newFolder: "New Folder",
        refresh: "Refresh",
      },
      file: {
        openFolder: "Open Folder",
        newWindow: "New Window",
      },
    },
  }),
}));

vi.mock("@/lib/host", () => ({
  openNewWindow: vi.fn(),
}));

describe("MacLeftPaneTopBar", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    toggleLeftSidebar.mockReset();
  });

  it("reserves a dedicated traffic-light safe area and keeps the collapse control interactive", () => {
    render(<MacLeftPaneTopBar />);

    expect(screen.getByTestId("mac-left-pane-traffic-lights-safe-area")).toHaveAttribute(
      "data-tauri-drag-region",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Files" }));

    expect(toggleLeftSidebar).toHaveBeenCalledTimes(1);
  });

  it("uses a full-height control row so left controls align like the right top bar", () => {
    const { container } = render(<MacLeftPaneTopBar />);

    expect(container.firstElementChild).toHaveClass("h-11");
    expect(container.firstElementChild).toHaveClass("items-stretch");
    expect(screen.getByTestId("mac-left-pane-controls")).toHaveClass("h-full");
    expect(screen.getByTestId("mac-left-pane-controls")).toHaveClass("items-center");
    expect(screen.getByTestId("mac-left-pane-controls")).toHaveClass("px-2");
  });

  it("renders file operation buttons in the top bar", () => {
    render(<MacLeftPaneTopBar />);

    expect(screen.getByTitle("Open Folder")).toBeInTheDocument();
    expect(screen.getByTitle("New Note")).toBeInTheDocument();
    expect(screen.getByTitle("New Folder")).toBeInTheDocument();
    expect(screen.getByTitle("Refresh")).toBeInTheDocument();
  });
});
