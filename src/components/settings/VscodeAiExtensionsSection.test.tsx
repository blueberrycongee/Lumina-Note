import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VscodeAiExtensionsSection } from "./VscodeAiExtensionsSection";

const diagnosticsMock = vi.fn();
const checkLatestMock = vi.fn();
const installLatestMock = vi.fn();
const installLocalMock = vi.fn();
const installCompatProfilesMock = vi.fn();
const rollbackMock = vi.fn();
const openDialogMock = vi.fn();

vi.mock("@/lib/host", async () => {
  const actual = await vi.importActual<typeof import("@/lib/host")>("@/lib/host");
  return {
    ...actual,
    getVscodeAiExtensionDiagnostics: (...args: unknown[]) => diagnosticsMock(...args),
    checkLatestVscodeAiExtension: (...args: unknown[]) => checkLatestMock(...args),
    installLatestVscodeAiExtension: (...args: unknown[]) => installLatestMock(...args),
    installLocalVscodeAiExtensionVsix: (...args: unknown[]) => installLocalMock(...args),
    installVscodeAiCompatProfiles: (...args: unknown[]) => installCompatProfilesMock(...args),
    rollbackVscodeAiExtension: (...args: unknown[]) => rollbackMock(...args),
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
    rollbackMock.mockReset();
    openDialogMock.mockReset();
    diagnosticsMock.mockResolvedValue([
      {
        extensionId: "openai.chatgpt",
        displayName: "Codex",
        active: null,
        installed: [],
        compatibility: null,
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
        installed: [
          { version: "2.1.0" },
          { version: "2.0.0" },
        ],
        compatibility: {
          status: "preview",
          reason: "manual opt-in required",
          autoUpdateEligible: false,
          version: "2.1.0",
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
    rollbackMock.mockResolvedValue({ version: "2.0.0" });
    openDialogMock.mockResolvedValue("/tmp/ext.vsix");
  });

  it("renders diagnostics and missing host capabilities", async () => {
    render(<VscodeAiExtensionsSection />);

    expect(await screen.findByText("Codex")).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText(/authentication.getSession/)).toBeInTheDocument();
  });

  it("checks and installs latest extension from Open VSX", async () => {
    render(<VscodeAiExtensionsSection />);
    await screen.findByText("Codex");

    fireEvent.click(screen.getByRole("button", { name: "Check latest Codex" }));
    await waitFor(() => {
      expect(checkLatestMock).toHaveBeenCalledWith({
        extensionId: "openai.chatgpt",
        source: "open-vsx",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Install latest Codex" }));
    await waitFor(() => {
      expect(installLatestMock).toHaveBeenCalledWith({
        extensionId: "openai.chatgpt",
        source: "open-vsx",
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

    fireEvent.click(screen.getByRole("button", { name: "Rollback Claude Code" }));
    await waitFor(() => {
      expect(rollbackMock).toHaveBeenCalledWith({
        extensionId: "anthropic.claude-code",
      });
    });
  });
});
