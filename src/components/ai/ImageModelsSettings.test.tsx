import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ImageModelsSettings } from "./ImageModelsSettings";
import { FALLBACK_IMAGE_PROVIDERS } from "@/services/imageGen/types";
import { useImageProvidersStore } from "@/stores/useImageProvidersStore";

const invokeMock = vi.hoisted(() =>
  vi.fn(async (_cmd: string, _args?: unknown): Promise<unknown> => null),
);

vi.mock("@/lib/host", () => ({
  invoke: invokeMock,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const google = FALLBACK_IMAGE_PROVIDERS.find((p) => p.id === "google-image")!;

function seedImageStore(params?: {
  configured?: boolean;
  modelId?: string;
  baseUrl?: string;
}) {
  useImageProvidersStore.setState({
    providers: [
      {
        ...google,
        configured: params?.configured ?? false,
      },
    ],
    settings: {
      perProvider: {
        "google-image": {
          modelId: params?.modelId,
          baseUrl: params?.baseUrl,
        },
      },
    },
    loaded: true,
  });
}

describe("ImageModelsSettings", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    seedImageStore();
  });

  it("shows a saved image API key as hidden keychain state", () => {
    seedImageStore({ configured: true });

    render(<ImageModelsSettings />);

    const input = screen.getByLabelText("API Key") as HTMLInputElement;
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute(
      "placeholder",
      "API Key 已保存（不会显示明文）",
    );
    expect(screen.getByText("已连接")).toBeInTheDocument();
    expect(
      screen.getByText("已保存到本机钥匙串；出于安全不会回显，输入新 key 可替换。"),
    ).toBeInTheDocument();
  });

  it("saves model settings without rewriting or clearing the saved key", async () => {
    seedImageStore({ configured: true, modelId: "gemini-old" });

    render(<ImageModelsSettings />);

    fireEvent.change(screen.getByLabelText("Model"), {
      target: { value: "gemini-new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("image_set_provider_settings", {
        provider_id: "google-image",
        settings: { modelId: "gemini-new", baseUrl: undefined },
      });
    });
    expect(invokeMock).not.toHaveBeenCalledWith(
      "image_set_provider_api_key",
      expect.anything(),
    );
  });

  it("clears the draft after saving a new key and keeps the saved state visible", async () => {
    let configured = false;
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "image_set_provider_api_key") {
        configured = true;
        return null;
      }
      if (cmd === "image_list_providers") {
        return [{ ...google, configured }];
      }
      if (cmd === "image_get_provider_settings") {
        return { perProvider: {} };
      }
      return null;
    });

    seedImageStore({ configured: false });
    render(<ImageModelsSettings />);

    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "AIza-new" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(screen.getByLabelText("API Key")).toHaveAttribute(
        "placeholder",
        "API Key 已保存（不会显示明文）",
      );
    });
    expect(screen.getByLabelText("API Key")).toHaveValue("");
    expect(invokeMock).toHaveBeenCalledWith("image_set_provider_api_key", {
      provider_id: "google-image",
      api_key: "AIza-new",
    });
  });
});
