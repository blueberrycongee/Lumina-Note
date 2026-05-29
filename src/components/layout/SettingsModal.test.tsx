import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsModal } from "./SettingsModal";

const {
  copyFileMock,
  createDirMock,
  getAppDataDirMock,
  getVersionMock,
  joinPathMock,
  openDialogMock,
  readBinaryFileBase64Mock,
  resetAppBackgroundMock,
  setAppBackgroundMock,
  setBlockEditorEnabledMock,
  setDarkModeMock,
  extractPreferredImageSkinModeFromSourceMock,
} = vi.hoisted(() => ({
  copyFileMock: vi.fn(async () => undefined),
  createDirMock: vi.fn(async () => undefined),
  getAppDataDirMock: vi.fn(async () => "/app-data"),
  getVersionMock: vi.fn(async () => "1.2.3"),
  joinPathMock: vi.fn(async (...parts: string[]) => parts.join("/")),
  openDialogMock: vi.fn(),
  readBinaryFileBase64Mock: vi.fn(async () => "base64-image"),
  resetAppBackgroundMock: vi.fn(),
  setAppBackgroundMock: vi.fn(),
  setBlockEditorEnabledMock: vi.fn(),
  setDarkModeMock: vi.fn(),
  extractPreferredImageSkinModeFromSourceMock: vi.fn(async () => "dark"),
}));

vi.mock("@/lib/host", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/host")>("@/lib/host");
  return {
    ...actual,
    copyFile: copyFileMock,
    createDir: createDirMock,
    getAppDataDir: getAppDataDirMock,
    getVersion: getVersionMock,
    joinPath: joinPathMock,
    openDialog: openDialogMock,
    readBinaryFileBase64: readBinaryFileBase64Mock,
  };
});

vi.mock("@/lib/imageSkinPalette", () => ({
  extractPreferredImageSkinModeFromSource:
    extractPreferredImageSkinModeFromSourceMock,
}));

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
    appBackground: {
      kind: "none",
      preset: "paper",
      imagePath: null,
      opacity: 0.26,
      blur: 0,
      dim: 0.72,
    },
    setAppBackground: setAppBackgroundMock,
    resetAppBackground: resetAppBackgroundMock,
    setDarkMode: setDarkModeMock,
    editorMode: "live",
    setEditorMode: () => undefined,
    editorFontSize: 16,
    setEditorFontSize: () => undefined,
    blockEditorEnabled: false,
    setBlockEditorEnabled: setBlockEditorEnabledMock,
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
        myThemes: "My Themes",
        officialThemes: "Official Themes",
        appearance: "Appearance",
        background: "Background",
        backgroundNone: "None",
        backgroundImage: "Local Image",
        chooseBackgroundImage: "Choose Background Image",
        clearBackgroundImage: "Remove Image",
        resetBackground: "Reset Background",
        backgroundOpacity: "Background Strength",
        backgroundBlur: "Blur",
        backgroundDim: "Overlay",
        backgroundPresetPaper: "Paper",
        backgroundPresetMist: "Mist",
        backgroundPresetSakura: "Sakura",
        backgroundPresetDusk: "Dusk",
        themes: {},
        editor: "Editor",
        defaultEditMode: "Default Edit Mode",
        defaultEditModeDesc: "Default edit mode description",
        livePreview: "Live Preview",
        sourceMode: "Source Mode",
        readingMode: "Reading Mode",
        editorFontSize: "Editor Font Size",
        editorFontSizeDesc: "Editor font size description",
        blockEditor: "Block editor",
        blockEditorDesc:
          "Enable block handles, block menu, and drag-to-reorder; disabling reverts to plain Markdown.",
        aiAssistant: "AI Assistant",
        currentModel: "Current Model",
        configInRightPanel: "Configure more options in the right panel",
        notConfigured: "Not configured",
        softwareUpdateDescription:
          "Check the current version and open the updater window.",
        softwareUpdateOpen: "Open updater",
        about: "About",
        appDescription: "Local-first AI note app",
        confirmDeleteTheme: 'Delete theme "{name}"?',
        tabs: {
          general: "General",
          ai: "AI",
          sync: "Sync",
          network: "Network",
          account: "Account",
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

vi.mock("../settings/MobileGatewaySection", () => ({
  MobileGatewaySection: () => <div>MobileGateway</div>,
}));

vi.mock("../settings/MobileOptionsSection", () => ({
  MobileOptionsSection: () => <div>MobileOptions</div>,
}));

vi.mock("../settings/VscodeAiExtensionsSection", () => ({
  VscodeAiExtensionsSection: () => <div>VSCodeAIExtensions</div>,
}));

vi.mock("../settings/ProxySection", () => ({
  ProxySection: () => <div>Proxy</div>,
}));

vi.mock("../settings/LicenseSettings", () => ({
  LicenseSettings: () => <div>LicenseSettings</div>,
}));

vi.mock("../settings/CloudUsagePanel", () => ({
  CloudUsagePanel: () => <div>CloudUsagePanel</div>,
}));

describe("SettingsModal", () => {
  const onOpenUpdateModal = vi.fn();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    copyFileMock.mockReset();
    copyFileMock.mockResolvedValue(undefined);
    createDirMock.mockReset();
    createDirMock.mockResolvedValue(undefined);
    getAppDataDirMock.mockReset();
    getAppDataDirMock.mockResolvedValue("/app-data");
    getVersionMock.mockClear();
    joinPathMock.mockReset();
    joinPathMock.mockImplementation(async (...parts: string[]) =>
      parts.join("/"),
    );
    openDialogMock.mockReset();
    readBinaryFileBase64Mock.mockReset();
    readBinaryFileBase64Mock.mockResolvedValue("base64-image");
    resetAppBackgroundMock.mockClear();
    setAppBackgroundMock.mockClear();
    setDarkModeMock.mockClear();
    extractPreferredImageSkinModeFromSourceMock.mockReset();
    extractPreferredImageSkinModeFromSourceMock.mockResolvedValue("dark");
    onOpenUpdateModal.mockClear();
  });

  it("renders tabbed navigation with 6 tabs", () => {
    render(
      <SettingsModal
        isOpen
        onClose={() => undefined}
        onOpenUpdateModal={onOpenUpdateModal}
      />,
    );

    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("AI")).toBeInTheDocument();
    expect(screen.getByText("Sync")).toBeInTheDocument();
    expect(screen.getByText("Network")).toBeInTheDocument();
    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
  });

  it("switches to account tab and shows license + usage panels", () => {
    render(
      <SettingsModal
        isOpen
        onClose={() => undefined}
        onOpenUpdateModal={onOpenUpdateModal}
      />,
    );

    fireEvent.click(screen.getByText("Account"));

    expect(screen.getByText("LicenseSettings")).toBeInTheDocument();
    expect(screen.getByText("CloudUsagePanel")).toBeInTheDocument();
  });

  it("defaults to general tab showing appearance and editor", () => {
    render(
      <SettingsModal
        isOpen
        onClose={() => undefined}
        onOpenUpdateModal={onOpenUpdateModal}
      />,
    );

    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(screen.queryByText("Create Theme")).not.toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
  });

  it("selects a local image background from the general tab", async () => {
    openDialogMock.mockResolvedValue("/vault/assets/bg.png");

    render(
      <SettingsModal
        isOpen
        onClose={() => undefined}
        onOpenUpdateModal={onOpenUpdateModal}
      />,
    );

    fireEvent.click(screen.getByText("Local Image"));

    await waitFor(() => {
      expect(createDirMock).toHaveBeenCalledWith(
        "/app-data/background-wallpapers",
        { recursive: true },
      );
      expect(copyFileMock).toHaveBeenCalledWith(
        "/vault/assets/bg.png",
        expect.stringMatching(
          /^\/app-data\/background-wallpapers\/wallpaper-\d+-.+\.png$/,
        ),
      );
      expect(setAppBackgroundMock).toHaveBeenCalledWith({
        kind: "image",
        imagePath: expect.stringMatching(
          /^\/app-data\/background-wallpapers\/wallpaper-\d+-.+\.png$/,
        ),
      });
    });
    await waitFor(() => {
      expect(readBinaryFileBase64Mock).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\/app-data\/background-wallpapers\/wallpaper-\d+-.+\.png$/,
        ),
      );
      expect(extractPreferredImageSkinModeFromSourceMock).toHaveBeenCalledWith(
        "data:image/png;base64,base64-image",
      );
      expect(setDarkModeMock).toHaveBeenCalledWith(true);
    });
  });

  it("switches to system tab and shows update section", async () => {
    render(
      <SettingsModal
        isOpen
        onClose={() => undefined}
        onOpenUpdateModal={onOpenUpdateModal}
      />,
    );

    fireEvent.click(screen.getByText("System"));

    const updateSection = await screen.findByTestId("settings-section-update");

    await waitFor(() => {
      expect(updateSection).toHaveTextContent("Version 1.2.3");
    });
    expect(screen.getByText("VSCodeAIExtensions")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("settings-open-update-modal"));
    expect(onOpenUpdateModal).toHaveBeenCalledTimes(1);
  });

  it("switches to sync tab and shows WebDAV", () => {
    render(
      <SettingsModal
        isOpen
        onClose={() => undefined}
        onOpenUpdateModal={onOpenUpdateModal}
      />,
    );

    fireEvent.click(screen.getByText("Sync"));

    expect(screen.getByText("WebDAV")).toBeInTheDocument();
    expect(screen.getByText("MobileGateway")).toBeInTheDocument();
  });

  it("switches to network tab and shows proxy", () => {
    render(
      <SettingsModal
        isOpen
        onClose={() => undefined}
        onOpenUpdateModal={onOpenUpdateModal}
      />,
    );

    fireEvent.click(screen.getByText("Network"));

    expect(screen.getByText("Proxy")).toBeInTheDocument();
  });

  it("renders the block editor toggle and toggles state on click", async () => {
    render(
      <SettingsModal
        isOpen
        onClose={() => undefined}
        onOpenUpdateModal={() => undefined}
      />,
    );

    const toggle = await screen.findByRole("switch", { name: /block editor/i });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);
    expect(setBlockEditorEnabledMock).toHaveBeenCalledWith(true);
  });
});
