import { StrictMode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Ribbon } from "./Ribbon";

const updateStoreState = {
  availableUpdate: null,
  hasUnreadUpdate: false,
  installTelemetry: {
    phase: "idle",
    version: null,
  },
  currentVersion: "1.0.0",
  isChecking: false,
};

vi.mock("@/stores/useUIStore", () => ({
  useUIStore: () => ({
    isDarkMode: false,
    toggleTheme: vi.fn(),
    setRightPanelTab: vi.fn(),
  }),
}));

vi.mock("@/stores/useFileStore", () => ({
  useFileStore: () => ({
    tabs: [],
    activeTabIndex: -1,
    openGraphTab: vi.fn(),
    switchTab: vi.fn(),
    recentFiles: [],
    openFile: vi.fn(),
    fileTree: [],
    openAIMainTab: vi.fn(),
    currentFile: null,
    openFlashcardTab: vi.fn(),
    openCardFlowTab: vi.fn(),
  }),
}));

vi.mock("@/stores/useLocaleStore", () => ({
  useLocaleStore: () => ({
    t: {
      graph: {
        title: "Graph",
      },
      ribbon: {
        globalSearch: "Global Search",
        aiChatMain: "AI Chat",
        fileEditor: "Files",
        cardView: "Card View",
        database: "Database",
        flashcardReview: "Flashcards",
        plugins: "Plugins",
        softwareUpdateChecking: "Checking for updates",
        starProject: "Star project",
        switchToLight: "Switch to light mode",
        switchToDark: "Switch to dark mode",
        settings: "Settings",
      },
      updateChecker: {
        title: "Software Update",
        descReady: "Update is ready",
        descVerifying: "Verifying package...",
        descInstalling: "Installing...",
        descDownloading: "Downloading update...",
        descAvailable: "New version found v{version}",
        descIdle: "Check for updates",
        descError: "Update failed",
        descCancelled: "Update cancelled",
        descUnsupported: "Updates are not supported in the current environment",
      },
    },
  }),
}));

vi.mock("@/stores/usePluginStore", () => ({
  usePluginStore: (selector: (state: { isRibbonItemEnabled: () => boolean }) => unknown) =>
    selector({
      isRibbonItemEnabled: () => true,
    }),
}));

vi.mock("@/stores/usePluginUiStore", () => ({
  usePluginUiStore: (selector: (state: { ribbonItems: never[] }) => unknown) =>
    selector({
      ribbonItems: [],
    }),
}));

vi.mock("@/stores/useUpdateStore", () => ({
  useUpdateStore: (selector: (state: typeof updateStoreState) => unknown) => selector(updateStoreState),
  hasActionableTerminalInstallPhase: () => false,
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(),
}));

vi.mock("@/lib/tauri", () => ({
  exists: vi.fn(),
  isTauriAvailable: () => true,
}));

vi.mock("@/components/plugins/InstalledPluginsModal", () => ({
  InstalledPluginsModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>Plugins Modal</div> : null),
}));

vi.mock("./SettingsModal", () => ({
  SettingsModal: ({
    isOpen,
    onClose,
    onOpenUpdateModal,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onOpenUpdateModal: () => void;
  }) =>
    isOpen ? (
      <div>
        <div>Settings Modal</div>
        <button onClick={onOpenUpdateModal}>Open Update From Settings</button>
        <button onClick={onClose}>Close Settings</button>
      </div>
    ) : null,
}));

vi.mock("./UpdateModal", () => ({
  UpdateModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>Update Modal</div> : null),
}));

describe("Ribbon", () => {
  it("renders in StrictMode without triggering a zustand selector loop", () => {
    render(
      <StrictMode>
        <Ribbon />
      </StrictMode>,
    );

    expect(screen.getByRole("button", { name: /Software Update/ })).toBeInTheDocument();
  });

  it("opens the dedicated update modal directly from the ribbon button", () => {
    render(<Ribbon />);

    fireEvent.click(screen.getByRole("button", { name: /Software Update/ }));

    expect(screen.getByText("Update Modal")).toBeInTheDocument();
    expect(screen.queryByText("Settings Modal")).not.toBeInTheDocument();
  });

  it("closes settings before opening the update modal from the settings entry", () => {
    render(<Ribbon />);

    fireEvent.click(screen.getByTitle("Settings"));
    expect(screen.getByText("Settings Modal")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Open Update From Settings"));

    expect(screen.getByText("Update Modal")).toBeInTheDocument();
    expect(screen.queryByText("Settings Modal")).not.toBeInTheDocument();
  });
});
