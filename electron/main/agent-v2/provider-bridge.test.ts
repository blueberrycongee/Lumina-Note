import { describe, expect, it } from "vitest";

import type { ProviderSettingsStore } from "../agent/providers/settings-store.js";
import { buildOpencodeBridge } from "./provider-bridge.js";

function makeProviderSettings(
  settings: {
    provider: string;
    modelId: string;
    apiKey?: string;
  },
): ProviderSettingsStore {
  return {
    getActiveProvider() {
      return settings.provider;
    },
    getProviderSettings() {
      return { modelId: settings.modelId };
    },
    async getProviderApiKey() {
      return settings.apiKey ?? "sk-test";
    },
  } as unknown as ProviderSettingsStore;
}

describe("buildOpencodeBridge", () => {
  it("marks DeepSeek V4 models as interleaved reasoning models for opencode", async () => {
    const bridge = await buildOpencodeBridge(
      makeProviderSettings({
        provider: "deepseek",
        modelId: "deepseek-v4-flash",
      }),
    );

    const config = JSON.parse(bridge?.config ?? "{}");
    expect(config.provider.deepseek.models["deepseek-v4-flash"]).toMatchObject({
      reasoning: true,
      interleaved: { field: "reasoning_content" },
    });
  });

  it("does not mark legacy DeepSeek chat as interleaved reasoning", async () => {
    const bridge = await buildOpencodeBridge(
      makeProviderSettings({
        provider: "deepseek",
        modelId: "deepseek-chat",
      }),
    );

    const config = JSON.parse(bridge?.config ?? "{}");
    expect(config.provider.deepseek.models["deepseek-chat"].interleaved).toBeUndefined();
  });
});
