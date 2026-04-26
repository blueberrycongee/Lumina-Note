import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecentVaultList } from "./RecentVaultList";

vi.mock("@/stores/useLocaleStore", () => ({
  useLocaleStore: () => ({
    t: {
      welcome: {
        recentVaults: "Recent Vaults",
        noRecentVaults: "No recent vaults",
        clearHistory: "Clear History",
      },
    },
  }),
}));

describe("RecentVaultList", () => {
  const mockVaults = [
    { path: "/home/user/notes", name: "notes", openedAt: Date.now() },
    { path: "/home/user/work", name: "work", openedAt: Date.now() - 1000 },
  ];

  it("renders vault names", () => {
    render(
      <RecentVaultList
        vaults={mockVaults}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText("notes")).toBeInTheDocument();
    expect(screen.getByText("work")).toBeInTheDocument();
  });

  it("calls onSelect when vault is clicked", () => {
    const onSelect = vi.fn();
    render(
      <RecentVaultList
        vaults={mockVaults}
        onSelect={onSelect}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("notes"));
    expect(onSelect).toHaveBeenCalledWith("/home/user/notes");
  });

  it("calls onRemove when remove button is clicked", () => {
    const onRemove = vi.fn();
    render(
      <RecentVaultList
        vaults={mockVaults}
        onSelect={vi.fn()}
        onRemove={onRemove}
        onClear={vi.fn()}
      />,
    );
    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    fireEvent.click(removeButtons[0]);
    expect(onRemove).toHaveBeenCalledWith("/home/user/notes");
  });

  it("calls onClear when clear history is clicked", () => {
    const onClear = vi.fn();
    render(
      <RecentVaultList
        vaults={mockVaults}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        onClear={onClear}
      />,
    );
    fireEvent.click(screen.getByText("Clear History"));
    expect(onClear).toHaveBeenCalled();
  });

  it("shows empty state when no vaults", () => {
    render(
      <RecentVaultList
        vaults={[]}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText("No recent vaults")).toBeInTheDocument();
  });
});
