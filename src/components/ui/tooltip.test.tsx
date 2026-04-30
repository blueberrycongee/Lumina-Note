import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AutoTooltipHost } from "./tooltip";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

function renderWithButton(button: React.ReactElement) {
  return render(
    <>
      {button}
      <AutoTooltipHost />
    </>,
  );
}

describe("AutoTooltipHost", () => {
  it("does not render anything before any interaction", () => {
    renderWithButton(<button aria-label="Save file" />);
    expect(screen.queryByTestId("auto-tooltip")).not.toBeInTheDocument();
  });

  it("shows tooltip after the hover delay on an icon-only button", async () => {
    renderWithButton(<button aria-label="Save file" />);
    fireEvent.mouseOver(screen.getByRole("button"));
    expect(screen.queryByTestId("auto-tooltip")).not.toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByTestId("auto-tooltip")).toHaveTextContent("Save file");
  });

  it("renders tooltip without an entrance animation", async () => {
    renderWithButton(<button aria-label="Save file" />);
    fireEvent.mouseOver(screen.getByRole("button"));
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.getByTestId("auto-tooltip")).not.toHaveClass(
      "animate-in",
      "fade-in-0",
      "zoom-in-95",
    );
  });

  it("falls back to data-tooltip when aria-label is absent", async () => {
    renderWithButton(<button data-tooltip="Open chat" />);
    fireEvent.mouseOver(screen.getByRole("button"));
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByTestId("auto-tooltip")).toHaveTextContent("Open chat");
  });

  it("falls back to title when neither aria-label nor data-tooltip is set", async () => {
    renderWithButton(<button title="Run query">▶</button>);
    fireEvent.mouseOver(screen.getByRole("button"));
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    // Glyph "▶" has no letter characters, so the tooltip still shows.
    expect(screen.getByTestId("auto-tooltip")).toHaveTextContent("Run query");
  });

  it("prefers aria-label over title", async () => {
    renderWithButton(<button aria-label="Save changes" title="Save (Ctrl+S)" />);
    fireEvent.mouseOver(screen.getByRole("button"));
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByTestId("auto-tooltip")).toHaveTextContent("Save changes");
  });

  it("renders nothing when the button has neither aria-label nor data-tooltip", async () => {
    renderWithButton(<button>Bare</button>);
    fireEvent.mouseOver(screen.getByRole("button"));
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.queryByTestId("auto-tooltip")).not.toBeInTheDocument();
  });

  it("suppresses the tooltip when the button has a visible text label", async () => {
    // The aria-label is fine for screen readers, but repeating "Save" on
    // hover of a button that already says "Save" is redundant chrome.
    renderWithButton(<button aria-label="Save file">Save</button>);
    fireEvent.mouseOver(screen.getByRole("button"));
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.queryByTestId("auto-tooltip")).not.toBeInTheDocument();
  });

  it("does not treat screen-reader-only text as a visible label", async () => {
    renderWithButton(
      <button title="Command Palette">
        <span aria-hidden="true">⌘</span>
        <span className="sr-only">3 New</span>
      </button>,
    );

    fireEvent.mouseOver(screen.getByRole("button"));
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.getByTestId("auto-tooltip")).toHaveTextContent(
      "Command Palette",
    );
  });

  it("suppresses the tooltip on labeled buttons under keyboard focus too", async () => {
    renderWithButton(<button aria-label="Save file">Save</button>);
    fireEvent.focusIn(screen.getByRole("button"));
    expect(screen.queryByTestId("auto-tooltip")).not.toBeInTheDocument();
  });

  it("data-tooltip-force overrides the visible-label suppression", async () => {
    renderWithButton(
      <button aria-label="Zoom level" data-tooltip-force="true">
        100%
      </button>,
    );
    fireEvent.mouseOver(screen.getByRole("button"));
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByTestId("auto-tooltip")).toHaveTextContent("Zoom level");
  });

  it("data-tooltip-suppress hides the tooltip on otherwise-iconic buttons", async () => {
    renderWithButton(
      <button aria-label="Close" data-tooltip-suppress="true">
        ×
      </button>,
    );
    fireEvent.mouseOver(screen.getByRole("button"));
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.queryByTestId("auto-tooltip")).not.toBeInTheDocument();
  });

  it("hides the tooltip after the cursor leaves the button", async () => {
    renderWithButton(<button aria-label="Pin tab" />);
    const button = screen.getByRole("button");
    fireEvent.mouseOver(button);
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByTestId("auto-tooltip")).toBeInTheDocument();
    fireEvent.mouseOut(button, { relatedTarget: document.body });
    await act(async () => {
      vi.advanceTimersByTime(120);
    });
    expect(screen.queryByTestId("auto-tooltip")).not.toBeInTheDocument();
  });

  it("shows the tooltip immediately on keyboard focus and hides on blur", async () => {
    renderWithButton(<button aria-label="Toggle sidebar" />);
    const button = screen.getByRole("button");
    fireEvent.focusIn(button);
    // No timer advance needed — focus should not be delayed.
    expect(screen.getByTestId("auto-tooltip")).toHaveTextContent("Toggle sidebar");
    fireEvent.focusOut(button);
    await act(async () => {
      vi.advanceTimersByTime(120);
    });
    expect(screen.queryByTestId("auto-tooltip")).not.toBeInTheDocument();
  });

  it("hides on Escape key", async () => {
    renderWithButton(<button aria-label="Run" />);
    fireEvent.mouseOver(screen.getByRole("button"));
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByTestId("auto-tooltip")).toBeInTheDocument();
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(screen.queryByTestId("auto-tooltip")).not.toBeInTheDocument();
  });

  it("resolves the tooltip from a child icon by walking up to the nearest button", async () => {
    renderWithButton(
      <button aria-label="Close tab">
        <span data-testid="icon">×</span>
      </button>,
    );
    fireEvent.mouseOver(screen.getByTestId("icon"));
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByTestId("auto-tooltip")).toHaveTextContent("Close tab");
  });
});
