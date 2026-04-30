import { describe, expect, it } from "vitest";

import type { ProviderSettingsStore } from "./providers/settings-store.js";
import { buildOpencodeBridge } from "./provider-bridge.js";

function makeProviderSettings(
  settings: {
    provider: string;
    modelId: string;
    apiKey?: string;
    all?: Record<string, { modelId?: string; baseUrl?: string; contextWindow?: number; maxOutputTokens?: number }>;
    keys?: Record<string, string>;
  },
): ProviderSettingsStore {
  return {
    getActiveProvider() {
      return settings.provider;
    },
    getProviderSettings(id?: string) {
      return settings.all?.[id ?? settings.provider] ?? { modelId: settings.modelId };
    },
    async getProviderApiKey(id?: string) {
      return settings.keys?.[id ?? settings.provider] ?? settings.apiKey ?? "sk-test";
    },
    getAll() {
      return {
        activeProviderId: settings.provider,
        perProvider: settings.all ?? {
          [settings.provider]: { modelId: settings.modelId },
        },
      };
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
    expect(config.provider.deepseek.models["deepseek-v4-pro"]).toMatchObject({
      reasoning: true,
      interleaved: { field: "reasoning_content" },
    });
    expect(config.provider.deepseek.models["deepseek-chat"].interleaved).toBeUndefined();
    expect(config.provider.deepseek.models["deepseek-chat"].limit).toEqual({
      context: 128_000,
      output: 8_192,
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

  it("includes every configured provider so promptAsync can switch providers without a restart", async () => {
    const bridge = await buildOpencodeBridge(
      makeProviderSettings({
        provider: "openai",
        modelId: "gpt-5.4",
        all: {
          openai: { modelId: "gpt-5.4" },
          deepseek: { modelId: "deepseek-v4-flash" },
        },
        keys: {
          openai: "sk-openai",
          deepseek: "sk-deepseek",
        },
      }),
    );

    const config = JSON.parse(bridge?.config ?? "{}");
    const auth = JSON.parse(bridge?.auth ?? "{}");
    expect(config.model).toBe("openai/gpt-5.4");
    expect(config.provider.openai.models["gpt-5.5"]).toEqual({});
    expect(config.provider.deepseek.models["deepseek-v4-flash"]).toMatchObject({
      reasoning: true,
      interleaved: { field: "reasoning_content" },
    });
    expect(auth.openai.key).toBe("sk-openai");
    expect(auth.deepseek.key).toBe("sk-deepseek");
  });

  it("maps MiMo Token Plan endpoints to opencode's regional Xiaomi ids", async () => {
    const bridge = await buildOpencodeBridge(
      makeProviderSettings({
        provider: "mimo",
        modelId: "mimo-v2.5-pro",
        all: {
          mimo: {
            modelId: "mimo-v2.5-pro",
            baseUrl: "https://token-plan-sgp.xiaomimimo.com/v1",
          },
        },
      }),
    );

    const config = JSON.parse(bridge?.config ?? "{}");
    const auth = JSON.parse(bridge?.auth ?? "{}");
    expect(config.model).toBe("xiaomi-token-plan-sgp/mimo-v2.5-pro");
    expect(config.provider["xiaomi-token-plan-sgp"].models).toMatchObject({
      "mimo-v2.5-pro": {
        limit: {
          context: 1_000_000,
          output: 4_096,
        },
      },
      "mimo-v2.5": {
        limit: {
          context: 1_000_000,
          output: 4_096,
        },
      },
    });
    expect(config.provider["xiaomi-token-plan-sgp"].models["mimo-v2-flash"]).toBeUndefined();
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

  it("uses user-configured OpenAI-compatible runtime limits", async () => {
    const bridge = await buildOpencodeBridge(
      makeProviderSettings({
        provider: "openai-compatible",
        modelId: "mimo-v2.5-pro",
        all: {
          "openai-compatible": {
            modelId: "mimo-v2.5-pro",
            baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
            contextWindow: 1_000_000,
            maxOutputTokens: 16_384,
          },
        },
      }),
    );

    const config = JSON.parse(bridge?.config ?? "{}");
    expect(config.provider["lumina-compat"].models["mimo-v2.5-pro"].limit).toEqual({
      context: 1_000_000,
      output: 16_384,
    });
  });
});
