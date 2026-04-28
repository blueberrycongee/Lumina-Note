/**
 * Image-provider settings store (renderer side).
 *
 * Talks to the main process via IPC commands prefixed `image_`. Provider
 * metadata + configured-flag come from `image_list_providers`; the user's
 * baseUrl override per provider lives in `image_get_provider_settings`.
 *
 * API keys are write-only from this store: we send keys via
 * `image_set_provider_api_key` (which routes them straight to the OS
 * keychain) but never read them back. The UI shows a fixed "•••••••" mask
 * for any provider with `configured: true` — same approach the chat
 * provider settings take.
 */

import { create } from "zustand";

import { invoke } from "@/lib/host";
import { reportOperationError } from "@/lib/reportError";

import type {
  AllImageProviderSettings,
  ImageProviderId,
  ImageProviderInfo,
  ImageProviderPersistedSettings,
  ImageTestResult,
} from "@/services/imageGen/types";

interface ImageProvidersState {
  providers: ImageProviderInfo[];
  settings: AllImageProviderSettings;
  loaded: boolean;
  refresh: () => Promise<void>;
  setProviderSettings: (
    id: ImageProviderId,
    settings: ImageProviderPersistedSettings,
  ) => Promise<void>;
  setProviderApiKey: (id: ImageProviderId, apiKey: string) => Promise<void>;
  testProvider: (
    id: ImageProviderId,
    apiKey: string,
    baseUrl?: string,
  ) => Promise<ImageTestResult>;
}

export const useImageProvidersStore = create<ImageProvidersState>((set, get) => ({
  providers: [],
  settings: { perProvider: {} },
  loaded: false,
  refresh: async () => {
    try {
      const [providers, settings] = await Promise.all([
        invoke<ImageProviderInfo[]>("image_list_providers"),
        invoke<AllImageProviderSettings | null>("image_get_provider_settings"),
      ]);
      set({
        providers: providers ?? [],
        settings: settings ?? { perProvider: {} },
        loaded: true,
      });
    } catch (err) {
      reportOperationError({
        source: "useImageProvidersStore.refresh",
        action: "Load image providers",
        error: err,
        level: "warning",
      });
      set({ loaded: true });
    }
  },
  setProviderSettings: async (id, settings) => {
    await invoke("image_set_provider_settings", {
      provider_id: id,
      settings,
    });
    // Optimistic local merge so the UI doesn't flash empty while we re-fetch.
    set((state) => ({
      settings: {
        perProvider: {
          ...state.settings.perProvider,
          [id]: settings,
        },
      },
    }));
  },
  setProviderApiKey: async (id, apiKey) => {
    await invoke("image_set_provider_api_key", {
      provider_id: id,
      api_key: apiKey,
    });
    // Refresh `configured` flags after a key change.
    await get().refresh();
  },
  testProvider: async (id, apiKey, baseUrl) => {
    return invoke<ImageTestResult>("image_test_provider", {
      provider_id: id,
      settings: { apiKey: apiKey.trim(), baseUrl },
    });
  },
}));
