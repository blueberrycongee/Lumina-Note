import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FolderOpen } from "lucide-react";
import { ActionCard } from "./ActionCard";

describe("ActionCard", () => {
  it("renders title, description, and button", () => {
    render(
      <ActionCard
        icon={FolderOpen}
        title="Open Folder"
        description="Select an existing folder"
        action={{ label: "Open", variant: "primary", onClick: vi.fn() }}
      />,
    );
    expect(screen.getByText("Open Folder")).toBeInTheDocument();
    expect(screen.getByText("Select an existing folder")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
  });

  it("calls onClick when button is clicked", () => {
    const onClick = vi.fn();
    render(
      <ActionCard
        icon={FolderOpen}
        title="Open Folder"
        description="Select an existing folder"
        action={{ label: "Open", variant: "primary", onClick }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
