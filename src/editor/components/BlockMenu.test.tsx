import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BlockMenu } from "./BlockMenu";

describe("BlockMenu", () => {
  it("renders in combined mode with format and manage buttons", () => {
    render(
      <BlockMenu
        mode="combined"
        position={{ x: 100, y: 100 }}
        onAction={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("menuitem", { name: /H1/i })).toBeInTheDocument();
    expect(screen.getByText(/Delete/i)).toBeInTheDocument();
    expect(screen.getByText(/Duplicate/i)).toBeInTheDocument();
  });

  it("renders in insert mode without delete/duplicate", () => {
    render(
      <BlockMenu
        mode="insert"
        position={{ x: 100, y: 100 }}
        onAction={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("menuitem", { name: /H1/i })).toBeInTheDocument();
    expect(screen.queryByText(/Delete/i)).not.toBeInTheDocument();
  });

  it("calls onAction with actionId when button clicked", () => {
    const onAction = vi.fn();
    render(
      <BlockMenu
        mode="combined"
        position={{ x: 100, y: 100 }}
        onAction={onAction}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: /H1/i }));
    expect(onAction).toHaveBeenCalledWith("heading1");
  });

  it("calls onClose when Escape pressed", () => {
    const onClose = vi.fn();
    render(
      <BlockMenu
        mode="combined"
        position={{ x: 100, y: 100 }}
        onAction={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
