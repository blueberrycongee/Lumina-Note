import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProxySection } from "../ProxySection";
import en from "@/i18n/locales/en";

vi.mock("@/stores/useLocaleStore", () => ({
  useLocaleStore: () => ({ t: en }),
  getCurrentTranslations: () => en,
}));

const mockSetProxyUrl = vi.fn();
const mockSetProxyEnabled = vi.fn();

vi.mock("@/stores/useUIStore", () => ({
  useUIStore: vi.fn(() => ({
    proxyUrl: "",
    proxyEnabled: false,
    setProxyUrl: mockSetProxyUrl,
    setProxyEnabled: mockSetProxyEnabled,
  })),
}));

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe("ProxySection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ proxy_url: "", enabled: false });
  });

  it("renders title and input", () => {
    render(<ProxySection />);
    expect(screen.getByText(en.settingsModal.proxyTitle)).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(en.settingsModal.proxyUrlPlaceholder),
    ).toBeInTheDocument();
  });

  it("renders enable toggle and hint text", () => {
    render(<ProxySection />);
    expect(screen.getByText(en.settingsModal.proxyEnable)).toBeInTheDocument();
    expect(screen.getByText(en.settingsModal.proxyHint)).toBeInTheDocument();
  });

  it("calls setProxyUrl on input change", () => {
    render(<ProxySection />);
    const input = screen.getByPlaceholderText(
      en.settingsModal.proxyUrlPlaceholder,
    );
    fireEvent.change(input, { target: { value: "http://127.0.0.1:7890" } });
    expect(mockSetProxyUrl).toHaveBeenCalledWith("http://127.0.0.1:7890");
  });

  it("calls setProxyEnabled on toggle click", () => {
    render(<ProxySection />);
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);
    expect(mockSetProxyEnabled).toHaveBeenCalledWith(true);
  });

  it("test button is disabled when proxyUrl is empty", () => {
    render(<ProxySection />);
    const btn = screen.getByText(en.settingsModal.proxyTestConnection);
    expect(btn).toBeDisabled();
  });

  it("syncs config to backend on mount", async () => {
    render(<ProxySection />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("set_proxy_config", {
        proxyUrl: "",
        enabled: false,
      });
    });
  });
});
