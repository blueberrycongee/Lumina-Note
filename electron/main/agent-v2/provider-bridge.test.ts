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

  it("maps MiMo Token Plan providers to opencode's regional Xiaomi ids", async () => {
    const bridge = await buildOpencodeBridge(
      makeProviderSettings({
        provider: "mimo-token-plan-sgp",
        modelId: "mimo-v2.5-pro",
      }),
    );

    const config = JSON.parse(bridge?.config ?? "{}");
    const auth = JSON.parse(bridge?.auth ?? "{}");
    expect(config.model).toBe("xiaomi-token-plan-sgp/mimo-v2.5-pro");
    expect(config.provider["xiaomi-token-plan-sgp"].models).toEqual({
      "mimo-v2.5-pro": {},
    });
    expect(auth["xiaomi-token-plan-sgp"]).toEqual({
      type: "api",
      key: "sk-test",
    });
  });

  it("does not write Lumina thinking or effort settings into opencode model options", async () => {
    const bridge = await buildOpencodeBridge(
      {
        getActiveProvider() {
          return "deepseek";
        },
        getProviderSettings() {
          return {
            modelId: "deepseek-v4-pro",
            thinkingMode: "instant",
            reasoningEffort: "max",
          };
        },
        async getProviderApiKey() {
          return "sk-test";
        },
      } as unknown as ProviderSettingsStore,
    );

    const config = JSON.parse(bridge?.config ?? "{}");
    expect(config.provider.deepseek.models["deepseek-v4-pro"]).toMatchObject({
      reasoning: true,
      interleaved: { field: "reasoning_content" },
    });
    expect(config.provider.deepseek.models["deepseek-v4-pro"].options).toBeUndefined();
  });
});
