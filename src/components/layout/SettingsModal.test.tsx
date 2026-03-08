import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsModal } from "./SettingsModal";

const {
  getVersionMock,
  hideAllWebViewsMock,
  showAllWebViewsMock,
} = vi.hoisted(() => ({
  getVersionMock: vi.fn(async () => "1.2.3"),
  hideAllWebViewsMock: vi.fn(),
  showAllWebViewsMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: getVersionMock,
}));

vi.mock("@/config/themes", () => ({
  OFFICIAL_THEMES: [],
}));

vi.mock("@/config/themePlugin", () => ({
  loadUserThemes: vi.fn(async () => []),
  getUserThemes: vi.fn(() => []),
  deleteUserTheme: vi.fn(async () => undefined),
}));

vi.mock("@/stores/useUIStore", () => ({
  useUIStore: () => ({
    themeId: "default",
    setThemeId: vi.fn(),
    editorMode: "live",
    setEditorMode: vi.fn(),
    editorFontSize: 16,
    setEditorFontSize: vi.fn(),
  }),
}));

vi.mock("@/stores/useAIStore", () => ({
  useAIStore: () => ({
    config: {
      model: "gpt-5.4",
    },
  }),
}));

vi.mock("@/stores/useBrowserStore", () => ({
  useBrowserStore: () => ({
    hideAllWebViews: hideAllWebViewsMock,
    showAllWebViews: showAllWebViewsMock,
  }),
}));

vi.mock("@/stores/useFileStore", () => ({
  useFileStore: () => ({
    vaultPath: null,
    fileTree: [],
  }),
}));

vi.mock("@/stores/useLocaleStore", () => ({
  useLocaleStore: () => ({
    t: {
      updateChecker: {
        title: "Software Update",
        versionLabel: "Version {version}",
      },
      common: {
        edit: "Edit",
        delete: "Delete",
      },
      settings: {
        language: "Language",
      },
      welcome: {
        language: "Language",
      },
      settingsModal: {
        title: "Settings",
        theme: "Theme",
        createTheme: "Create Theme",
        themeDescription: "Theme description",
        myThemes: "My Themes",
        officialThemes: "Official Themes",
        themes: {},
        editor: "Editor",
        defaultEditMode: "Default Edit Mode",
        defaultEditModeDesc: "Default edit mode description",
        livePreview: "Live Preview",
        sourceMode: "Source Mode",
        readingMode: "Reading Mode",
        editorFontSize: "Editor Font Size",
        editorFontSizeDesc: "Editor font size description",
        aiAssistant: "AI Assistant",
        currentModel: "Current Model",
        configInRightPanel: "Configure more options in the right panel",
        notConfigured: "Not configured",
        softwareUpdateDescription: "Check the current version and open the updater window.",
        softwareUpdateOpen: "Open updater",
        about: "About",
        appDescription: "Local-first AI note app",
        confirmDeleteTheme: 'Delete theme "{name}"?',
      },
    },
  }),
}));

vi.mock("../ai/ThemeEditor", () => ({
  ThemeEditor: () => null,
}));

vi.mock("../settings/WebDAVSettings", () => ({
  WebDAVSettings: () => <div>WebDAV</div>,
}));

vi.mock("../settings/DocToolsSection", () => ({
  DocToolsSection: () => <div>DocTools</div>,
}));

vi.mock("./LanguageSwitcher", () => ({
  LanguageSwitcher: () => <div>LanguageSwitcher</div>,
}));

vi.mock("../settings/ProfileSettingsSection", () => ({
  ProfileSettingsSection: () => <div>ProfileSettings</div>,
}));

vi.mock("../settings/PublishSettingsSection", () => ({
  PublishSettingsSection: () => <div>PublishSettings</div>,
}));

vi.mock("../settings/MobileGatewaySection", () => ({
  MobileGatewaySection: () => <div>MobileGateway</div>,
}));

vi.mock("../settings/CloudRelaySection", () => ({
  CloudRelaySection: () => <div>CloudRelay</div>,
}));

vi.mock("../settings/MobileOptionsSection", () => ({
  MobileOptionsSection: () => <div>MobileOptions</div>,
}));

vi.mock("../settings/DiagnosticsSection", () => ({
  DiagnosticsSection: () => <div>Diagnostics</div>,
}));

describe("SettingsModal", () => {
  const onOpenUpdateModal = vi.fn();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    getVersionMock.mockClear();
    hideAllWebViewsMock.mockClear();
    showAllWebViewsMock.mockClear();
    onOpenUpdateModal.mockClear();
  });

  it("renders a lightweight update entry and opens the dedicated update modal", async () => {
    render(<SettingsModal isOpen onClose={() => undefined} onOpenUpdateModal={onOpenUpdateModal} />);

    const updateSection = await screen.findByTestId("settings-section-update");
    expect(screen.queryByText("UpdateChecker")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(updateSection).toHaveTextContent("Version 1.2.3");
    });

    fireEvent.click(screen.getByTestId("settings-open-update-modal"));

    expect(onOpenUpdateModal).toHaveBeenCalledTimes(1);
    expect(hideAllWebViewsMock).toHaveBeenCalledTimes(1);
  });

  it("releases hidden webviews if the modal unmounts while still open", () => {
    const { unmount } = render(
      <SettingsModal isOpen onClose={() => undefined} onOpenUpdateModal={onOpenUpdateModal} />,
    );

    expect(hideAllWebViewsMock).toHaveBeenCalledTimes(1);

    unmount();

    expect(showAllWebViewsMock).toHaveBeenCalledTimes(1);
  });
});
