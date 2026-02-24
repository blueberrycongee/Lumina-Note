import { describe, expect, it } from "vitest";

import { getRecommendedTemperature, resolveTemperature } from "./temperature";

describe("LLM temperature strategy", () => {
  it("returns provider/model best-practice defaults", () => {
    expect(getRecommendedTemperature("moonshot", "kimi-k2.5")).toBe(1.0);
    expect(getRecommendedTemperature("openai", "gpt-5.2-codex")).toBe(0.2);
    expect(getRecommendedTemperature("zai", "glm-4.7-flash")).toBe(0.6);
    expect(getRecommendedTemperature("deepseek", "deepseek-reasoner")).toBe(1.0);
    expect(getRecommendedTemperature("openai", "gpt-4o")).toBe(0.7);
  });

  it("uses recommended default when user temperature is not set", () => {
    expect(
      resolveTemperature({ provider: "moonshot", model: "kimi-k2.5" })
    ).toBe(1.0);
  });

  it("forces kimi-k2.5 to use temperature=1.0", () => {
    expect(
      resolveTemperature({
        provider: "moonshot",
        model: "kimi-k2.5",
        configuredTemperature: 1.4,
      })
    ).toBe(1.0);
  });

  it("forces kimi-k2.5 instant mode to use temperature=0.6", () => {
    expect(
      resolveTemperature({
        provider: "moonshot",
        model: "kimi-k2.5",
        thinkingMode: "instant",
      })
    ).toBe(0.6);
    expect(
      resolveTemperature({
        provider: "moonshot",
        model: "kimi-k2.5",
        thinkingMode: "instant",
        configuredTemperature: 1.2,
      })
    ).toBe(0.6);
  });

  it("respects user configured temperature for non-fixed models", () => {
    expect(
      resolveTemperature({
        provider: "openai",
        model: "gpt-4o",
        configuredTemperature: 1.4,
      })
    ).toBe(1.4);
  });

  it("clamps invalid temperatures to [0, 2]", () => {
    expect(
      resolveTemperature({
        provider: "openai",
        model: "gpt-4o",
        configuredTemperature: 9,
      })
    ).toBe(2);
    expect(
      resolveTemperature({
        provider: "openai",
        model: "gpt-4o",
        configuredTemperature: -1,
      })
    ).toBe(0);
  });
});
