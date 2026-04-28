import { describe, expect, it } from "vitest";

import { resolveOpencodePromptModel } from "./useOpencodeAgent";

describe("resolveOpencodePromptModel", () => {
  it("resolves the selected DeepSeek model exactly", () => {
    expect(
      resolveOpencodePromptModel({
        provider: "deepseek",
        model: "deepseek-v4-flash",
      }),
    ).toEqual({
      providerID: "deepseek",
      modelID: "deepseek-v4-flash",
    });
  });

  it("uses Lumina's declared opencode provider id for custom providers", () => {
    expect(
      resolveOpencodePromptModel({
        provider: "openai-compatible",
        model: "custom",
        customModelId: "  kimi-k2.5  ",
      }),
    ).toEqual({
      providerID: "lumina-compat",
      modelID: "kimi-k2.5",
    });
  });

  it("omits an invalid custom model instead of sending an empty model id", () => {
    expect(
      resolveOpencodePromptModel({
        provider: "openai-compatible",
        model: "custom",
        customModelId: "   ",
      }),
    ).toBeUndefined();
  });
});
