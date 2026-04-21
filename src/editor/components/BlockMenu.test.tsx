import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BlockMenu } from "./BlockMenu";

vi.mock("@/stores/useLocaleStore", () => ({
  useLocaleStore: () => ({
    t: {
      editor: {
        blockMenu: {
          groups: {
            heading: "Heading",
            list: "List",
            block: "Block",
            insert: "Insert",
          },
          items: {
            heading1: "Heading 1",
            heading2: "Heading 2",
            heading3: "Heading 3",
            heading4: "Heading 4",
            heading5: "Heading 5",
            bulletList: "Bullet List",
            orderedList: "Numbered List",
            taskList: "Task List",
            blockquote: "Quote",
            codeBlock: "Code Block",
            divider: "Divider",
            link: "Link",
            image: "Image",
            table: "Table",
            mathBlock: "Math Block",
            callout: "Callout",
            insertAbove: "Insert above",
            insertAboveTitle: "Insert block above",
            delete: "Delete",
            deleteTitle: "Delete block",
            duplicate: "Duplicate",
            duplicateTitle: "Duplicate block",
            insertBelow: "Insert below",
            insertBelowTitle: "Insert block below",
          },
        },
      },
    },
  }),
}));

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
