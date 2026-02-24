import { describe, expect, it } from "vitest";

import {
  getThinkingCapability,
  getThinkingRequestBodyPatch,
  normalizeThinkingMode,
  resolveThinkingModel,
  supportsThinkingModeSwitch,
} from "./thinking";

describe("LLM thinking mode capability", () => {
  it("normalizes unsupported mode values to auto", () => {
    expect(normalizeThinkingMode(undefined)).toBe("auto");
    expect(normalizeThinkingMode("thinking")).toBe("thinking");
    expect(normalizeThinkingMode("instant")).toBe("instant");
  });

  it("detects moonshot k2.5 as param-toggle mode", () => {
    expect(getThinkingCapability("moonshot", "kimi-k2.5")).toEqual({
      strategy: "param-toggle",
      parameter: "thinking",
    });
    expect(getThinkingCapability("moonshot", "moonshotai/kimi-k2.5")).toEqual({
      strategy: "param-toggle",
      parameter: "thinking",
    });
  });

  it("detects deepseek chat/reasoner as separate-model mode", () => {
    expect(getThinkingCapability("deepseek", "deepseek-chat")).toEqual({
      strategy: "separate-model",
      thinkingModel: "deepseek-reasoner",
      instantModel: "deepseek-chat",
    });
    expect(getThinkingCapability("deepseek", "deepseek-reasoner")).toEqual({
      strategy: "separate-model",
      thinkingModel: "deepseek-reasoner",
      instantModel: "deepseek-chat",
    });
  });

  it("resolves deepseek model by thinking mode", () => {
    expect(
      resolveThinkingModel({
        provider: "deepseek",
        model: "deepseek-chat",
        thinkingMode: "thinking",
      })
    ).toBe("deepseek-reasoner");

    expect(
      resolveThinkingModel({
        provider: "deepseek",
        model: "deepseek-reasoner",
        thinkingMode: "instant",
      })
    ).toBe("deepseek-chat");

    expect(
      resolveThinkingModel({
        provider: "deepseek",
        model: "deepseek-chat",
        thinkingMode: "auto",
      })
    ).toBe("deepseek-chat");
  });

  it("only sends moonshot thinking disable patch in instant mode", () => {
    expect(
      getThinkingRequestBodyPatch({
        provider: "moonshot",
        model: "kimi-k2.5",
        thinkingMode: "instant",
      })
    ).toEqual({ thinking: { type: "disabled" } });

    expect(
      getThinkingRequestBodyPatch({
        provider: "moonshot",
        model: "kimi-k2.5",
        thinkingMode: "thinking",
      })
    ).toBeUndefined();
  });

  it("reports thinking switch availability", () => {
    expect(supportsThinkingModeSwitch("moonshot", "kimi-k2.5")).toBe(true);
    expect(supportsThinkingModeSwitch("deepseek", "deepseek-chat")).toBe(true);
    expect(supportsThinkingModeSwitch("openai", "gpt-5.2")).toBe(false);
  });
});
