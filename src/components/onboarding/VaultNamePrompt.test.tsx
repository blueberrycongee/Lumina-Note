import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VaultNamePrompt } from "./VaultNamePrompt";

vi.mock("@/stores/useLocaleStore", () => ({
  useLocaleStore: () => ({
    t: {
      welcome: {
        createVault: "Create New Vault",
        createVaultDesc: "Enter a name for your new vault",
        vaultNamePlaceholder: "My Notes",
      },
      common: {
        cancel: "Cancel",
        create: "Create",
      },
    },
  }),
}));

describe("VaultNamePrompt", () => {
  it("renders when open", () => {
    render(
      <VaultNamePrompt isOpen={true} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText("Create New Vault")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("My Notes")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <VaultNamePrompt isOpen={false} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.queryByText("Create New Vault")).not.toBeInTheDocument();
  });

  it("calls onSubmit with name when form is submitted", () => {
    const onSubmit = vi.fn();
    render(
      <VaultNamePrompt isOpen={true} onSubmit={onSubmit} onCancel={vi.fn()} />,
    );
    fireEvent.change(screen.getByPlaceholderText("My Notes"), {
      target: { value: "My Vault" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onSubmit).toHaveBeenCalledWith("My Vault");
  });

  it("calls onCancel when cancel is clicked", () => {
    const onCancel = vi.fn();
    render(
      <VaultNamePrompt isOpen={true} onSubmit={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
