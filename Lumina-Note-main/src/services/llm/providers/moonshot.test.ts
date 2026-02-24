import { describe, expect, it } from "vitest";

import { getRecommendedTemperature } from "../temperature";
import { MoonshotProvider } from "./moonshot";
import type { LLMConfig, LLMOptions, Message } from "../types";

describe("Moonshot temperature strategy", () => {
  it("uses high default temperature for thinking models", () => {
    expect(getRecommendedTemperature("moonshot", "kimi-k2-thinking")).toBe(1.0);
    expect(getRecommendedTemperature("moonshot", "KIMI-K2-THINKING-TURBO")).toBe(1.0);
  });

  it("uses high default temperature for k2.5 models", () => {
    expect(getRecommendedTemperature("moonshot", "kimi-k2.5")).toBe(1.0);
    expect(getRecommendedTemperature("moonshot", "moonshotai/kimi-k2.5")).toBe(1.0);
    expect(getRecommendedTemperature("moonshot", "kimi-k2-5")).toBe(1.0);
  });

  it("uses moderate defaults for non-thinking models", () => {
    expect(getRecommendedTemperature("moonshot", "moonshot-v1-128k")).toBe(0.7);
    expect(getRecommendedTemperature("moonshot", "kimi-k2-turbo-preview")).toBe(0.6);
  });
});

class TestMoonshotProvider extends MoonshotProvider {
  exposeBody(messages: Message[], options?: LLMOptions, stream = false) {
    return this.buildRequestBody(messages, options, stream);
  }
}

function createProvider(config: Partial<LLMConfig> = {}) {
  return new TestMoonshotProvider({
    provider: "moonshot",
    apiKey: "test-key",
    model: "kimi-k2.5",
    ...config,
  });
}

describe("Moonshot request constraints", () => {
  it("enforces K2.5 fixed sampling params in thinking mode", () => {
    const provider = createProvider({ thinkingMode: "thinking" });
    const body = provider.exposeBody([{ role: "user", content: "hi" }]);

    expect(body.temperature).toBe(1.0);
    expect(body.top_p).toBe(0.95);
    expect(body.n).toBe(1);
    expect(body.presence_penalty).toBe(0);
    expect(body.frequency_penalty).toBe(0);
    expect(body.max_tokens).toBe(32768);
  });

  it("enforces K2.5 fixed sampling params in instant mode", () => {
    const provider = createProvider({ thinkingMode: "instant" });
    const body = provider.exposeBody([{ role: "user", content: "hi" }]);

    expect(body.temperature).toBe(0.6);
    expect(body.thinking).toEqual({ type: "disabled" });
  });

  it("keeps explicit maxTokens override when provided", () => {
    const provider = createProvider({ thinkingMode: "instant" });
    const body = provider.exposeBody(
      [{ role: "user", content: "hi" }],
      { maxTokens: 2048 }
    );

    expect(body.max_tokens).toBe(2048);
    expect(body.temperature).toBe(0.6);
  });
});
