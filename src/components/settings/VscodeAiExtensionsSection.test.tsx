import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VscodeAiExtensionsSection } from "./VscodeAiExtensionsSection";

const diagnosticsMock = vi.fn();
const checkLatestMock = vi.fn();
const installLatestMock = vi.fn();
const installLocalMock = vi.fn();
const installCompatProfilesMock = vi.fn();
const activateInstalledMock = vi.fn();
const rollbackMock = vi.fn();
const openDialogMock = vi.fn();
const openActiveMock = vi.fn();
const stopHostMock = vi.fn();

vi.mock("@/lib/host", async () => {
  const actual = await vi.importActual<typeof import("@/lib/host")>("@/lib/host");
  return {
    ...actual,
    getVscodeAiExtensionDiagnostics: (...args: unknown[]) => diagnosticsMock(...args),
    checkLatestVscodeAiExtension: (...args: unknown[]) => checkLatestMock(...args),
    activateInstalledVscodeAiExtension: (...args: unknown[]) => activateInstalledMock(...args),
    installLatestVscodeAiExtension: (...args: unknown[]) => installLatestMock(...args),
    installLocalVscodeAiExtensionVsix: (...args: unknown[]) => installLocalMock(...args),
    installVscodeAiCompatProfiles: (...args: unknown[]) => installCompatProfilesMock(...args),
    openActiveVscodeAiExtension: (...args: unknown[]) => openActiveMock(...args),
    rollbackVscodeAiExtension: (...args: unknown[]) => rollbackMock(...args),
    stopVscodeAiExtensionHost: (...args: unknown[]) => stopHostMock(...args),
    openDialog: (...args: unknown[]) => openDialogMock(...args),
  };
});

vi.mock("@/lib/reportError", () => ({
  reportOperationError: vi.fn(),
}));

describe("VscodeAiExtensionsSection", () => {
  beforeEach(() => {
    diagnosticsMock.mockReset();
    checkLatestMock.mockReset();
    installLatestMock.mockReset();
    installLocalMock.mockReset();
    installCompatProfilesMock.mockReset();
    activateInstalledMock.mockReset();
    rollbackMock.mockReset();
    openDialogMock.mockReset();
    openActiveMock.mockReset();
    stopHostMock.mockReset();
    diagnosticsMock.mockResolvedValue([
      {
        extensionId: "openai.chatgpt",
        displayName: "Codex",
        active: null,
        installed: [],
        compatibility: null,
        platform: null,
        hostCapabilities: {
          canRunWithoutMissingCapabilities: true,
          missingCapabilities: [],
          implementedCapabilities: ["commands"],
        },
      },
      {
        extensionId: "anthropic.claude-code",
        displayName: "Claude Code",
        active: {
          extensionId: "anthropic.claude-code",
          version: "2.0.0",
          extensionPath: "/tmp/claude-old",
          source: "manual-vsix",
          installedAt: "2026-05-01T00:00:00.000Z",
          smokeTestPassed: true,
          compatibility: {
            status: "preview",
            reason: "manual opt-in required",
            autoUpdateEligible: false,
            profileVersionRange: "*",
          },
        },
        installed: [
          {
            extensionId: "anthropic.claude-code",
            version: "2.1.0",
            extensionPath: "/tmp/claude",
            source: "manual-vsix",
            installedAt: "2026-05-01T00:00:00.000Z",
            smokeTestPassed: true,
            compatibility: {
              status: "preview",
              reason: "manual opt-in required",
              autoUpdateEligible: false,
              profileVersionRange: "*",
            },
          },
          {
            extensionId: "anthropic.claude-code",
            version: "2.0.0",
            extensionPath: "/tmp/claude-old",
            source: "manual-vsix",
            installedAt: "2026-04-30T00:00:00.000Z",
            smokeTestPassed: false,
            compatibility: {
              status: "unknown-version",
              reason: "unverified",
              autoUpdateEligible: false,
              profileVersionRange: null,
            },
          },
        ],
        compatibility: {
          status: "preview",
          reason: "manual opt-in required",
          autoUpdateEligible: false,
          version: "2.1.0",
        },
        platform: {
          expectedPlatform: "darwin-arm64",
          targetPlatform: null,
          compatible: true,
        },
        hostCapabilities: {
          canRunWithoutMissingCapabilities: false,
          missingCapabilities: ["authentication.getSession"],
          implementedCapabilities: ["commands"],
        },
      },
    ]);
    checkLatestMock.mockResolvedValue({ version: "6.1.0" });
    installLatestMock.mockResolvedValue({ outcome: { decision: "pending-manual-opt-in" } });
    installLocalMock.mockResolvedValue({ outcome: { decision: "pending-manual-opt-in" } });
    installCompatProfilesMock.mockResolvedValue({ profiles: [{ extensionId: "openai.chatgpt" }] });
    activateInstalledMock.mockResolvedValue({ version: "2.1.0" });
    rollbackMock.mockResolvedValue({ version: "2.0.0" });
    openDialogMock.mockResolvedValue("/tmp/ext.vsix");
    openActiveMock.mockResolvedValue({
      extensionId: "anthropic.claude-code",
      version: "2.0.0",
      origin: "http://127.0.0.1:4100",
      viewTypes: ["claudeVSCodeSidebar"],
      viewType: "claudeVSCodeSidebar",
      viewUrl: "http://127.0.0.1:4100/view/claudeVSCodeSidebar?token=t",
    });
    stopHostMock.mockResolvedValue(undefined);
  });

  it("renders diagnostics and missing host capabilities", async () => {
    render(<VscodeAiExtensionsSection />);

    expect(await screen.findByText("Codex")).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText(/authentication.getSession/)).toBeInTheDocument();
    expect(
      screen.getByText(/Latest installed: 2.1.0 \(preview, smoke passed\)/),
    ).toBeInTheDocument();
  });

  it("checks and installs latest extension from Marketplace by default", async () => {
    render(<VscodeAiExtensionsSection />);
    await screen.findByText("Codex");

    fireEvent.click(screen.getByRole("button", { name: "Check latest Codex" }));
    await waitFor(() => {
      expect(checkLatestMock).toHaveBeenCalledWith({
        extensionId: "openai.chatgpt",
        source: "marketplace",
        marketplaceTermsAccepted: false,
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Install latest Codex" }));
    await waitFor(() => {
      expect(installLatestMock).toHaveBeenCalledWith({
        extensionId: "openai.chatgpt",
        source: "marketplace",
        marketplaceTermsAccepted: false,
      });
    });
  });

  it("passes explicit Marketplace terms acceptance to remote checks", async () => {
    render(<VscodeAiExtensionsSection />);
    await screen.findByText("Codex");

    fireEvent.change(screen.getByLabelText("VS Code extension remote source"), {
      target: { value: "marketplace" },
    });
    fireEvent.click(screen.getByLabelText(/Marketplace terms/));
    fireEvent.click(screen.getByRole("button", { name: "Check latest Codex" }));

    await waitFor(() => {
      expect(checkLatestMock).toHaveBeenCalledWith({
        extensionId: "openai.chatgpt",
        source: "marketplace",
        marketplaceTermsAccepted: true,
      });
    });
  });

  it("passes GitHub release source options to remote installs", async () => {
    render(<VscodeAiExtensionsSection />);
    await screen.findByText("Codex");

    fireEvent.change(screen.getByLabelText("VS Code extension remote source"), {
      target: { value: "github-release" },
    });
    fireEvent.change(screen.getByLabelText("GitHub owner"), {
      target: { value: "openai" },
    });
    fireEvent.change(screen.getByLabelText("GitHub repo"), {
      target: { value: "codex" },
    });
    fireEvent.change(screen.getByLabelText("GitHub asset pattern"), {
      target: { value: "chatgpt.*vsix" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Install latest Codex" }));

    await waitFor(() => {
      expect(installLatestMock).toHaveBeenCalledWith({
        extensionId: "openai.chatgpt",
        source: "github-release",
        githubOwner: "openai",
        githubRepo: "codex",
        githubAssetPattern: "chatgpt.*vsix",
      });
    });
  });

  it("installs remote compatibility profile indexes", async () => {
    render(<VscodeAiExtensionsSection />);
    await screen.findByText("Codex");

    fireEvent.change(screen.getByLabelText("Compatibility profile index URL"), {
      target: { value: "https://updates.example.com/compat/index.json" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => {
      expect(installCompatProfilesMock).toHaveBeenCalledWith({
        indexUrl: "https://updates.example.com/compat/index.json",
      });
    });
  });

  it("imports a selected local VSIX and rolls back installed versions", async () => {
    render(<VscodeAiExtensionsSection />);
    await screen.findByText("Claude Code");

    fireEvent.click(screen.getByRole("button", { name: "Import VSIX Claude Code" }));
    await waitFor(() => {
      expect(installLocalMock).toHaveBeenCalledWith({
        extensionId: "anthropic.claude-code",
        vsixPath: "/tmp/ext.vsix",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Activate latest installed Claude Code" }));
    await waitFor(() => {
      expect(activateInstalledMock).toHaveBeenCalledWith({
        extensionId: "anthropic.claude-code",
        version: "2.1.0",
        allowUnverified: true,
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Rollback Claude Code" }));
    await waitFor(() => {
      expect(rollbackMock).toHaveBeenCalledWith({
        extensionId: "anthropic.claude-code",
      });
    });
  });

  it("opens and closes an active VS Code AI extension webview", async () => {
    diagnosticsMock.mockResolvedValueOnce([
      {
        extensionId: "anthropic.claude-code",
        displayName: "Claude Code",
        active: {
          extensionId: "anthropic.claude-code",
          version: "2.0.0",
          extensionPath: "/tmp/claude-old",
          source: "manual-vsix",
          installedAt: "2026-05-01T00:00:00.000Z",
          smokeTestPassed: true,
          compatibility: {
            status: "stable",
            reason: "verified",
            autoUpdateEligible: true,
            profileVersionRange: "2.0.0",
          },
        },
        installed: [],
        compatibility: {
          status: "stable",
          reason: "verified",
          autoUpdateEligible: true,
          version: "2.0.0",
        },
        platform: {
          expectedPlatform: "darwin-arm64",
          targetPlatform: null,
          compatible: true,
        },
        hostCapabilities: {
          canRunWithoutMissingCapabilities: true,
          missingCapabilities: [],
          implementedCapabilities: ["commands"],
        },
      },
    ]);
    render(<VscodeAiExtensionsSection />);
    await screen.findByText("Claude Code");

    fireEvent.click(screen.getByRole("button", { name: "Open Claude Code" }));
    await waitFor(() => {
      expect(openActiveMock).toHaveBeenCalledWith({
        extensionId: "anthropic.claude-code",
      });
    });

    const iframe = await screen.findByTitle("anthropic.claude-code webview");
    expect(iframe).toHaveAttribute(
      "src",
      "http://127.0.0.1:4100/view/claudeVSCodeSidebar?token=t",
    );

    fireEvent.click(screen.getByRole("button", { name: "Close VS Code AI extension" }));
    await waitFor(() => {
      expect(stopHostMock).toHaveBeenCalled();
    });
  });
});
