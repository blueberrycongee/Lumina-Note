import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  CodexPanel,
  codexViewReadyResultToError,
  formatCodexUserError,
  waitForCodexViewReady,
} from "./CodexPanel";
import { useErrorStore } from "@/stores/useErrorStore";

vi.mock("@/components/codex/CodexEmbeddedWebview", () => ({
  CodexEmbeddedWebview: ({ url }: { url?: string | null }) => (
    <div data-testid="codex-native" data-url={url ?? ""} />
  ),
}));

const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>;
const openMock = open as unknown as ReturnType<typeof vi.fn>;
const mockUuid = "00000000-0000-0000-0000-000000000000";

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", {
    value: { randomUUID: () => mockUuid },
  });
}

if (!globalThis.fetch) {
  Object.defineProperty(globalThis, "fetch", {
    value: vi.fn(),
  });
}

describe("CodexPanel", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let cryptoSpy: ReturnType<typeof vi.spyOn>;

  const mockHostReadyFetch = () => {
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/health")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, viewTypes: ["chatgpt.sidebarView"] }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as Response);
    });
  };

  beforeEach(() => {
    invokeMock.mockReset();
    openMock.mockReset();
    useErrorStore.setState({ notices: [] });
    fetchSpy = vi.spyOn(globalThis, "fetch");
    cryptoSpy = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(mockUuid);
  });

  afterEach(() => {
    vi.useRealTimers();
    fetchSpy.mockRestore();
    cryptoSpy.mockRestore();
  });

  it("renders an iframe when using iframe mode", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "codex_extension_get_status") {
        return Promise.resolve({
          installed: true,
          version: "0.5.60",
          extensionPath: "C:\\\\ext",
          latestVersion: "0.5.60",
        });
      }
      if (cmd === "codex_vscode_host_start") {
        return Promise.resolve({ origin: "http://127.0.0.1:1234", port: 1234 });
      }
      return Promise.resolve(null);
    });

    mockHostReadyFetch();

    render(<CodexPanel visible workspacePath="C:\\\\workspace" renderMode="iframe" />);

    await waitFor(() => {
      const iframe = document.querySelector("iframe");
      expect(iframe).not.toBeNull();
      expect(iframe?.getAttribute("src") ?? "").toContain("/view/chatgpt.sidebarView");
    });

    expect(document.querySelector("[data-testid=\"codex-native\"]")).toBeNull();
  });

  it("renders the native webview when using native mode", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "codex_extension_get_status") {
        return Promise.resolve({
          installed: true,
          version: "0.5.60",
          extensionPath: "C:\\\\ext",
          latestVersion: "0.5.60",
        });
      }
      if (cmd === "codex_vscode_host_start") {
        return Promise.resolve({ origin: "http://127.0.0.1:1234", port: 1234 });
      }
      return Promise.resolve(null);
    });

    mockHostReadyFetch();

    render(<CodexPanel visible workspacePath="C:\\\\workspace" renderMode="native" />);

    await waitFor(() => {
      expect(document.querySelector("[data-testid=\"codex-native\"]")).not.toBeNull();
    });

    expect(document.querySelector("iframe")).toBeNull();
  });

  it("auto-installs when visible and not installed", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "codex_extension_get_status") {
        return Promise.resolve({
          installed: false,
          version: null,
          extensionPath: null,
          latestVersion: null,
        });
      }
      if (cmd === "codex_extension_install_latest") {
        return Promise.resolve({
          installed: true,
          version: "0.5.60",
          extensionPath: "C:\\\\ext",
          latestVersion: "0.5.60",
        });
      }
      if (cmd === "codex_vscode_host_start") {
        return Promise.resolve({ origin: "http://127.0.0.1:1234", port: 1234 });
      }
      return Promise.resolve(null);
    });

    mockHostReadyFetch();

    render(<CodexPanel visible workspacePath="C:\\\\workspace" renderMode="native" />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("codex_extension_install_latest");
    });

  });

  it("installs from a VSIX file when selected", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "codex_extension_get_status") {
        return Promise.resolve({
          installed: false,
          version: null,
          extensionPath: null,
          latestVersion: null,
        });
      }
      if (cmd === "codex_extension_install_vsix") {
        return Promise.resolve({
          installed: true,
          version: "0.5.60",
          extensionPath: "C:\\\\ext",
          latestVersion: "0.5.60",
        });
      }
      return Promise.resolve(null);
    });

    openMock.mockResolvedValue("C:\\\\codex.vsix");

    render(<CodexPanel visible={false} workspacePath="C:\\\\workspace" renderMode="native" />);

    const button = await screen.findByRole("button", { name: /import vsix/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("codex_extension_install_vsix", {
        vsixPath: "C:\\\\codex.vsix",
      });
    });
  });

  it("waits for the registered Codex view before rendering the webview", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "codex_extension_get_status") {
        return Promise.resolve({
          installed: true,
          version: "0.5.60",
          extensionPath: "C:\\\\ext",
          latestVersion: "0.5.60",
        });
      }
      if (cmd === "codex_vscode_host_start") {
        return Promise.resolve({ origin: "http://127.0.0.1:1234", port: 1234 });
      }
      return Promise.resolve(null);
    });

    let healthChecks = 0;
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/health")) {
        healthChecks += 1;
        const ready = healthChecks >= 2;
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, viewTypes: ready ? ["chatgpt.sidebarView"] : [] }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as Response);
    });

    render(<CodexPanel visible workspacePath="C:\\\\workspace" renderMode="native" />);

    expect(document.querySelector("[data-testid=\"codex-native\"]")).toBeNull();

    await waitFor(() => {
      expect(document.querySelector("[data-testid=\"codex-native\"]")).not.toBeNull();
    });

    expect(healthChecks).toBeGreaterThanOrEqual(2);
  });

  it("maps an unregistered Codex view timeout to user-facing guidance", async () => {
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/health")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, viewTypes: [] }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as Response);
    });

    const result = await waitForCodexViewReady(
      "http://127.0.0.1:1234",
      "chatgpt.sidebarView",
      new AbortController().signal,
      { timeoutMs: 20, pollIntervalMs: 1 },
    );

    expect(result).toEqual({ ok: false, reason: "view_register_timeout" });
    if (result.ok) {
      throw new Error("Expected Codex view readiness to time out");
    }

    const userMessage = formatCodexUserError("Start Codex host", codexViewReadyResultToError(result));
    expect(userMessage).toBe(
      "Codex took too long to start. Retry once, and if it still hangs, copy the error details and report the issue.",
    );
    expect(userMessage.toLowerCase()).not.toContain("chatgpt.sidebarview");
  });

  it("stops the Codex host when the panel is hidden", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "codex_extension_get_status") {
        return Promise.resolve({
          installed: true,
          version: "0.5.60",
          extensionPath: "C:\\\\ext",
          latestVersion: "0.5.60",
        });
      }
      if (cmd === "codex_vscode_host_start") {
        return Promise.resolve({ origin: "http://127.0.0.1:1234", port: 1234 });
      }
      return Promise.resolve(null);
    });

    mockHostReadyFetch();

    const { rerender } = render(<CodexPanel visible workspacePath="C:\\\\workspace" renderMode="native" />);

    await waitFor(() => {
      expect(document.querySelector("[data-testid=\"codex-native\"]")).not.toBeNull();
    });

    rerender(<CodexPanel visible={false} workspacePath="C:\\\\workspace" renderMode="native" />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("codex_vscode_host_stop");
    });
  });

  it("surfaces runtime issues reported by the Codex host to the user", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "codex_extension_get_status") {
        return Promise.resolve({
          installed: true,
          version: "0.5.60",
          extensionPath: "C:\\\\ext",
          latestVersion: "0.5.60",
        });
      }
      if (cmd === "codex_vscode_host_start") {
        return Promise.resolve({ origin: "http://127.0.0.1:1234", port: 1234 });
      }
      return Promise.resolve(null);
    });

    let healthChecks = 0;
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/health")) {
        healthChecks += 1;
        if (healthChecks === 1) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ ok: true, viewTypes: ["chatgpt.sidebarView"], latestRuntimeIssue: null }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ok: true,
            viewTypes: ["chatgpt.sidebarView"],
            latestRuntimeIssue: {
              id: 7,
              viewType: "chatgpt.sidebarView",
              kind: "securitypolicyviolation",
              message: "Content Security Policy blocked a Codex webview resource.",
              detail: {
                effectiveDirective: "font-src",
                blockedURI: "data:font/woff2;base64,abc",
              },
              createdAt: Date.now(),
              lastSeenAt: Date.now(),
              count: 1,
            },
          }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as Response);
    });

    render(<CodexPanel visible workspacePath="C:\\\\workspace" renderMode="native" />);

    await waitFor(() => {
      const notices = useErrorStore.getState().notices;
      expect(notices.length).toBeGreaterThan(0);
      expect(notices[0]?.message).toContain("Codex blocked data:font/woff2;base64,abc because of font-src.");
    });

    expect(screen.getByText("Codex blocked data:font/woff2;base64,abc because of font-src.")).toBeTruthy();
  });

  it("shows actionable guidance when the Codex extension download fails", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "codex_extension_get_status") {
        return Promise.resolve({
          installed: false,
          version: null,
          extensionPath: null,
          latestVersion: null,
        });
      }
      if (cmd === "codex_extension_install_latest") {
        return Promise.reject(new Error("Network error: VSIX download failed: 503 Service Unavailable"));
      }
      return Promise.resolve(null);
    });

    render(<CodexPanel visible workspacePath="C:\\\\workspace" renderMode="native" />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Lumina Note couldn't download the Codex extension automatically. Check your network connection, or import a VSIX manually.",
        ),
      ).toBeTruthy();
    });

    expect(screen.getByRole("button", { name: /download & install/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /import vsix/i })).toBeTruthy();
  });

  it("shows actionable guidance when the built-in Codex runtime cannot start", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "codex_extension_get_status") {
        return Promise.resolve({
          installed: true,
          version: "0.5.60",
          extensionPath: "C:\\\\ext",
          latestVersion: "0.5.60",
        });
      }
      if (cmd === "codex_vscode_host_start") {
        return Promise.reject(
          new Error("Invalid path: Node runtime not found. Bundle node with the app or set LUMINA_NODE_PATH."),
        );
      }
      return Promise.resolve(null);
    });

    render(<CodexPanel visible workspacePath="C:\\\\workspace" renderMode="native" />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Lumina Note couldn't start the built-in Codex runtime. Retry in a moment, or update Lumina Note if the problem keeps happening.",
        ),
      ).toBeTruthy();
    });
  });
});
