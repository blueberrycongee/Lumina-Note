import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BlockMenu } from "./BlockMenu";

describe("BlockMenu", () => {
  it("renders in combined mode with format buttons and manage items", () => {
    render(
      <BlockMenu
        mode="combined"
        position={{ x: 100, y: 100 }}
        onAction={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTitle("Heading 1")).toBeInTheDocument();
    expect(screen.getByTitle("Delete block")).toBeInTheDocument();
    expect(screen.getByTitle("Duplicate block")).toBeInTheDocument();
  });

  it("renders in insert mode without manage items", () => {
    render(
      <BlockMenu
        mode="insert"
        position={{ x: 100, y: 100 }}
        onAction={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTitle("Heading 1")).toBeInTheDocument();
    expect(screen.queryByTitle("Delete block")).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByTitle("Heading 1"));
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
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(onClose).toHaveBeenCalled();
        resolve(undefined);
      }, 150);
    });
  });
});
