import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WelcomeScreen } from "./WelcomeScreen";

const macTopChromeEnabled = vi.hoisted(() => ({ value: false }));

vi.mock("@/components/layout/TitleBar", () => ({
  TitleBar: () => <div data-testid="titlebar" />,
}));

vi.mock("@/components/layout/LanguageSwitcher", () => ({
  LanguageSwitcher: ({
    className,
    compact,
    showLabel,
  }: {
    className?: string;
    compact?: boolean;
    showLabel?: boolean;
  }) => (
    <div
      data-testid="language-switcher"
      data-classname={className || ""}
      data-compact={compact ? "true" : "false"}
      data-show-label={showLabel ? "true" : "false"}
    >
      Language Switcher
    </div>
  ),
}));

vi.mock("@/components/layout/MacTopChrome", () => ({
  useMacTopChromeEnabled: () => macTopChromeEnabled.value,
}));

vi.mock("@/stores/useLocaleStore", () => ({
  useLocaleStore: () => ({
    t: {
      welcome: {
        title: "Lumina Note",
        openFolder: "Open Notes Folder",
        selectFolder: "Select a folder to continue",
        createVault: "Create New Vault",
        createVaultDesc: "Create a new folder with Lumina workspace structure",
        vaultNamePlaceholder: "My Notes",
        recentVaults: "Recent Vaults",
        noRecentVaults: "No recent vaults",
        clearHistory: "Clear History",
        selectParentFolder: "Select Parent Folder",
        newVaultButton: "New",
      },
      common: {
        cancel: "Cancel",
        create: "Create",
        open: "Open",
      },
    },
  }),
}));

vi.mock("@/lib/appAsset", () => ({
  resolveRendererAssetUrl: () => "lumina.png",
}));

vi.mock("@/stores/useRecentVaultStore", () => ({
  useRecentVaultStore: (
    selector: (s: {
      vaults: never[];
      removeVault: () => void;
      clearVaults: () => void;
    }) => unknown,
  ) => selector({ vaults: [], removeVault: vi.fn(), clearVaults: vi.fn() }),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  openDialog: vi.fn(),
}));

describe("WelcomeScreen", () => {
  beforeEach(() => {
    macTopChromeEnabled.value = false;
  });

  it("renders the two-pane layout", () => {
    render(<WelcomeScreen onOpenVault={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: "Lumina Note" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Open Notes Folder")).toBeInTheDocument();
    expect(screen.getByText("No recent vaults")).toBeInTheDocument();
  });

  it("keeps the legacy floating language switcher outside macOS overlay mode", () => {
    render(<WelcomeScreen onOpenVault={vi.fn()} />);
    expect(screen.getByTestId("language-switcher")).toHaveAttribute(
      "data-classname",
      "absolute top-4 right-4 z-10",
    );
  });

  it("renders the language switcher inside a real macOS top row", () => {
    macTopChromeEnabled.value = true;
    render(<WelcomeScreen onOpenVault={vi.fn()} />);
    expect(screen.getByTestId("welcome-top-row")).toBeInTheDocument();
  });

  it("shows Create New Vault when onCreateVault prop is provided", () => {
    render(<WelcomeScreen onOpenVault={vi.fn()} onCreateVault={vi.fn()} />);
    expect(screen.getByText("Create New Vault")).toBeInTheDocument();
  });

  it("hides Create New Vault when onCreateVault prop is not provided", () => {
    render(<WelcomeScreen onOpenVault={vi.fn()} />);
    expect(screen.queryByText("Create New Vault")).not.toBeInTheDocument();
  });
});
