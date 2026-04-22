import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsModal } from "./SettingsModal";

const {
  getVersionMock,
} = vi.hoisted(() => ({
  getVersionMock: vi.fn(async () => "1.2.3"),
}));

vi.mock("@/lib/host", async () => {
  const actual = await vi.importActual<typeof import("@/lib/host")>("@/lib/host");
  return { ...actual, getVersion: getVersionMock };
});

vi.mock("@/config/themes", () => ({
  OFFICIAL_THEMES: [],
}));

vi.mock("@/config/themePlugin", () => ({
  loadUserThemes: async () => [],
  getUserThemes: () => [],
  deleteUserTheme: async () => undefined,
}));

vi.mock("@/stores/useUIStore", () => ({
  useUIStore: () => ({
    themeId: "default",
    setThemeId: () => undefined,
    editorMode: "live",
    setEditorMode: () => undefined,
    editorFontSize: 16,
    setEditorFontSize: () => undefined,
    proxyUrl: "",
    proxyEnabled: false,
    setProxyUrl: () => undefined,
    setProxyEnabled: () => undefined,
  }),
}));

vi.mock("@/stores/useAIStore", () => ({
  useAIStore: () => ({
    config: {
      model: "gpt-5.4",
      provider: "openai",
      apiKey: "",
    },
    setConfig: () => undefined,
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
        close: "Close",
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
        tabs: {
          general: "General",
          ai: "AI",
          sync: "Sync",
          network: "Network",
          publish: "Publish",
          system: "System",
        },
      },
      aiSettings: {
        title: "AI Settings",
        mainModel: "Main Model",
        provider: "Provider",
        apiKey: "API Key",
        apiKeyOptional: "optional",
        localModelNoKey: "Local model",
        model: "Model",
        customModelId: "Custom Model ID",
        customModelHint: "Enter model ID",
        baseUrl: "Base URL",
        baseUrlOptional: "optional",
        temperature: "Temperature",
        agentSettings: "Agent Settings",
        autoApproveTools: "Auto approve",
        noManualConfirm: "no manual confirm",
        autoCompactContext: "Auto compact",
        autoCompactHint: "hint",
        testButton: "Test",
        testing: "Testing...",
        testSuccess: "Success",
        testSuccessShort: "OK",
        testSuccessDetail: "Connection works",
        testFailed: "Failed",
        testResponseEmpty: "Empty response",
        close: "Close",
        errors: {},
      },
    },
  }),
}));

vi.mock("@/services/llm", () => ({
  PROVIDER_MODELS: {
    openai: {
      label: "OpenAI",
      description: "OpenAI API",
      models: [{ id: "gpt-5.4", name: "GPT-5.4" }],
    },
  },
  createProvider: () => ({ call: async () => ({ content: "OK" }) }),
}));

vi.mock("@/services/llm/temperature", () => ({
  getRecommendedTemperature: () => 0.7,
}));

vi.mock("../ai/ThemeEditor", () => ({
  ThemeEditor: () => null,
}));

vi.mock("../ai/ThinkingModelIcon", () => ({
  ThinkingModelIcon: () => null,
}));

vi.mock("../settings/WebDAVSettings", () => ({
  WebDAVSettings: () => <div>WebDAV</div>,
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

vi.mock("../settings/MobileOptionsSection", () => ({
  MobileOptionsSection: () => <div>MobileOptions</div>,
}));

vi.mock("../settings/DiagnosticsSection", () => ({
  DiagnosticsSection: () => <div>Diagnostics</div>,
}));

vi.mock("../settings/ProxySection", () => ({
  ProxySection: () => <div>Proxy</div>,
}));

describe("SettingsModal", () => {
  const onOpenUpdateModal = vi.fn();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    getVersionMock.mockClear();
    onOpenUpdateModal.mockClear();
  });

  it("renders tabbed navigation with 6 tabs", () => {
    render(<SettingsModal isOpen onClose={() => undefined} onOpenUpdateModal={onOpenUpdateModal} />);

    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("AI")).toBeInTheDocument();
    expect(screen.getByText("Sync")).toBeInTheDocument();
    expect(screen.getByText("Network")).toBeInTheDocument();
    expect(screen.getByText("Publish")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
  });

  it("defaults to general tab showing theme and editor", () => {
    render(<SettingsModal isOpen onClose={() => undefined} onOpenUpdateModal={onOpenUpdateModal} />);

    expect(screen.getByText("Theme")).toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
  });

  it("switches to system tab and shows update section", async () => {
    render(<SettingsModal isOpen onClose={() => undefined} onOpenUpdateModal={onOpenUpdateModal} />);

    fireEvent.click(screen.getByText("System"));

    const updateSection = await screen.findByTestId("settings-section-update");

    await waitFor(() => {
      expect(updateSection).toHaveTextContent("Version 1.2.3");
    });

    fireEvent.click(screen.getByTestId("settings-open-update-modal"));
    expect(onOpenUpdateModal).toHaveBeenCalledTimes(1);
  });

  it("switches to sync tab and shows WebDAV", () => {
    render(<SettingsModal isOpen onClose={() => undefined} onOpenUpdateModal={onOpenUpdateModal} />);

    fireEvent.click(screen.getByText("Sync"));

    expect(screen.getByText("WebDAV")).toBeInTheDocument();
    expect(screen.getByText("MobileGateway")).toBeInTheDocument();
  });

  it("switches to network tab and shows proxy", () => {
    render(<SettingsModal isOpen onClose={() => undefined} onOpenUpdateModal={onOpenUpdateModal} />);

    fireEvent.click(screen.getByText("Network"));

    expect(screen.getByText("Proxy")).toBeInTheDocument();
  });

  it("switches to publish tab and shows publish section", () => {
    render(<SettingsModal isOpen onClose={() => undefined} onOpenUpdateModal={onOpenUpdateModal} />);

    fireEvent.click(screen.getByText("Publish"));

    expect(screen.getByText("PublishSettings")).toBeInTheDocument();
    expect(screen.getByText("ProfileSettings")).toBeInTheDocument();
  });
});
