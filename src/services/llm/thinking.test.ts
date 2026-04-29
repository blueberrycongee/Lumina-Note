import { describe, expect, it } from "vitest";

import {
  getDefaultReasoningEffort,
  getThinkingCapability,
  normalizeThinkingMode,
  resolveThinkingModel,
  supportedReasoningEfforts,
  supportsBinaryThinkingToggle,
  supportsThinkingModeSwitch,
} from "./thinking";

describe("LLM thinking metadata", () => {
  it("normalizes legacy mode values for persisted-state compatibility", () => {
    expect(normalizeThinkingMode(undefined)).toBe("thinking");
    expect(normalizeThinkingMode("auto")).toBe("thinking");
    expect(normalizeThinkingMode("thinking")).toBe("thinking");
    expect(normalizeThinkingMode("instant")).toBe("instant");
  });

  it("detects binary, separate-model, and effort-only capabilities", () => {
    expect(getThinkingCapability("moonshot", "kimi-k2.6")).toEqual({
      strategy: "param-toggle",
      parameter: "thinking",
    });
    expect(getThinkingCapability("deepseek", "deepseek-chat")).toEqual({
      strategy: "separate-model",
      thinkingModel: "deepseek-reasoner",
      instantModel: "deepseek-chat",
    });
    expect(getThinkingCapability("openai", "gpt-5.5")).toEqual({
      strategy: "effort-only",
      parameter: "reasoning",
      efforts: ["none", "low", "medium", "high", "xhigh"],
    });
    expect(getThinkingCapability("openai", "gpt-4o")).toEqual({
      strategy: "none",
    });
  });

  it("keeps DeepSeek V4 as a single model id with interleaved reasoning metadata", () => {
    expect(getThinkingCapability("deepseek", "deepseek-v4-flash")).toEqual({
      strategy: "param-toggle",
      parameter: "thinking",
    });
    expect(getThinkingCapability("deepseek", "deepseek-v4-pro")).toEqual({
      strategy: "param-toggle",
      parameter: "thinking",
      efforts: ["high", "max"],
    });
    expect(supportedReasoningEfforts("deepseek", "deepseek-v4-flash")).toBeNull();
    expect(supportedReasoningEfforts("deepseek", "deepseek-v4-pro")).toEqual([
      "high",
      "max",
    ]);
    expect(
      resolveThinkingModel({
        provider: "deepseek",
        model: "deepseek-v4-pro",
        thinkingMode: "instant",
      }),
    ).toBe("deepseek-v4-pro");
  });

  it("resolves legacy DeepSeek chat/reasoner model ids", () => {
    expect(
      resolveThinkingModel({
        provider: "deepseek",
        model: "deepseek-chat",
        thinkingMode: "thinking",
      }),
    ).toBe("deepseek-reasoner");
    expect(
      resolveThinkingModel({
        provider: "deepseek",
        model: "deepseek-reasoner",
        thinkingMode: "instant",
      }),
    ).toBe("deepseek-chat");
  });

  it("reports UI-facing capability axes without implying request patching", () => {
    expect(supportsThinkingModeSwitch("moonshot", "kimi-k2.6")).toBe(true);
    expect(supportsBinaryThinkingToggle("moonshot", "kimi-k2.6")).toBe(true);
    expect(supportsThinkingModeSwitch("openai", "gpt-5.5")).toBe(true);
    expect(supportsBinaryThinkingToggle("openai", "gpt-5.5")).toBe(false);
    expect(supportsThinkingModeSwitch("openai", "gpt-4o")).toBe(false);
  });

  it("returns model API defaults for effort-only metadata", () => {
    expect(getDefaultReasoningEffort("openai", "gpt-5.5")).toBe("medium");
    expect(getDefaultReasoningEffort("openai", "gpt-5.4")).toBe("none");
    expect(getDefaultReasoningEffort("anthropic", "claude-opus-4-7")).toBe("high");
    expect(getDefaultReasoningEffort("mimo", "mimo-v2.5-pro")).toBe("medium");
    expect(getDefaultReasoningEffort("openai", "gpt-4o")).toBeNull();
  });
});
