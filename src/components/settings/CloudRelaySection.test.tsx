import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CloudRelaySection } from "./CloudRelaySection";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@/stores/useLocaleStore", () => ({
  useLocaleStore: () => ({
    t: {
      settingsModal: {
        cloudRelayTitle: "Cloud Relay",
        cloudRelayDesc: "Cloud relay description",
        cloudRelayStart: "Start",
        cloudRelayStop: "Stop",
        cloudRelayStatus: "Status",
        cloudRelayConnected: "Connected",
        cloudRelayDisconnected: "Disconnected",
        cloudRelayUrl: "Relay URL",
        cloudRelayEmail: "Email",
        cloudRelayPassword: "Password",
        cloudRelayPairingPayload: "Pairing payload",
        cloudRelayCopied: "Copied",
        cloudRelayCopy: "Copy",
        cloudRelayQrHint: "Scan this QR code",
      },
    },
  }),
}));

vi.mock("@/lib/reportError", () => ({
  reportOperationError: vi.fn(),
}));

describe("CloudRelaySection", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("falls back to an empty config when the backend returns null", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "cloud_relay_get_status") {
        return Promise.resolve({
          running: false,
          connected: false,
        });
      }
      if (command === "cloud_relay_get_config") {
        return Promise.resolve(null);
      }
      return Promise.resolve(undefined);
    });

    render(<CloudRelaySection />);

    expect(await screen.findByText("Cloud Relay")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("wss://cloud.example.com/relay")).toHaveValue("");
      expect(screen.getByPlaceholderText("you@example.com")).toHaveValue("");
      expect(screen.getByPlaceholderText("••••••••")).toHaveValue("");
    });
  });
});
