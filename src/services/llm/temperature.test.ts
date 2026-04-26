import { describe, expect, it } from "vitest";

import {
  getRecommendedTemperature,
  resolveTemperature,
  resolveTemperatureLock,
} from "./temperature";

describe("LLM temperature strategy", () => {
  it("returns provider/model best-practice defaults", () => {
    expect(getRecommendedTemperature("openai-compatible", "kimi-k2.5")).toBe(1.0);
    expect(getRecommendedTemperature("openai", "gpt-5.4-codex")).toBe(0.2);
    expect(getRecommendedTemperature("openai-compatible", "glm-4.7-flash")).toBe(0.6);
    expect(getRecommendedTemperature("deepseek", "deepseek-reasoner")).toBe(1.0);
    expect(getRecommendedTemperature("openai", "gpt-4o")).toBe(0.7);
  });

  it("uses recommended default when user temperature is not set", () => {
    expect(
      resolveTemperature({ provider: "openai-compatible", model: "kimi-k2.5" })
    ).toBe(1.0);
  });

  it("forces kimi-k2.5 to use temperature=1.0", () => {
    expect(
      resolveTemperature({
        provider: "openai-compatible",
        model: "kimi-k2.5",
        configuredTemperature: 1.4,
      })
    ).toBe(1.0);
  });

  it("forces kimi-k2.5 instant mode to use temperature=0.6", () => {
    expect(
      resolveTemperature({
        provider: "openai-compatible",
        model: "kimi-k2.5",
        thinkingMode: "instant",
      })
    ).toBe(0.6);
    expect(
      resolveTemperature({
        provider: "openai-compatible",
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

  describe("fixedWhenReasoning (W2)", () => {
    it("forces GPT-5.5 to temperature=1.0 when reasoning is on (effort != none)", () => {
      // OpenAI o-series / GPT-5.5 reject temperature != 1.0 while reasoning.
      expect(
        resolveTemperature({
          provider: "openai",
          model: "gpt-5.5",
          configuredTemperature: 0.3,
          reasoningEffort: "high",
        })
      ).toBe(1.0);

      // No explicit effort → the model's API default ('medium') is used,
      // which still counts as reasoning-on.
      expect(
        resolveTemperature({
          provider: "openai",
          model: "gpt-5.5",
          configuredTemperature: 0.3,
        })
      ).toBe(1.0);
    });

    it("respects user temperature on GPT-5.5 when effort = 'none'", () => {
      // Opting out of reasoning means the constraint no longer applies.
      expect(
        resolveTemperature({
          provider: "openai",
          model: "gpt-5.5",
          configuredTemperature: 0.3,
          reasoningEffort: "none",
        })
      ).toBe(0.3);
    });

    it("respects user temperature on GPT-5.4 (defaultEffort=none) when no effort is selected", () => {
      // gpt-5.4's API default is `none`, so without an explicit effort the
      // model is NOT reasoning and the user's temperature applies.
      expect(
        resolveTemperature({
          provider: "openai",
          model: "gpt-5.4",
          configuredTemperature: 0.3,
        })
      ).toBe(0.3);
    });

    it("forces Anthropic Opus 4.7 to temperature=1.0 whenever reasoning is on", () => {
      // Anthropic 4.x extended thinking requires temperature=1.0. Opus 4.7's
      // efforts don't include 'none', so reasoning is always on and the
      // constraint always fires regardless of what the user passes.
      expect(
        resolveTemperature({
          provider: "anthropic",
          model: "claude-opus-4-7",
          configuredTemperature: 0.5,
          reasoningEffort: "high",
        })
      ).toBe(1.0);

      expect(
        resolveTemperature({
          provider: "anthropic",
          model: "claude-opus-4-7",
          configuredTemperature: 0.5,
        })
      ).toBe(1.0);

      expect(
        resolveTemperature({
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          configuredTemperature: 0.5,
          reasoningEffort: "max",
        })
      ).toBe(1.0);
    });
  });

  describe("resolveTemperatureLock (W5: UI surface for fixed values)", () => {
    it("returns null for unconstrained models", () => {
      expect(
        resolveTemperatureLock({ provider: "openai", model: "gpt-4o" })
      ).toBeNull();
      expect(
        resolveTemperatureLock({
          provider: "openai",
          model: "gpt-4o",
          thinkingMode: "thinking",
        })
      ).toBeNull();
    });

    it("locks Kimi K2.6 / K2.5 to 1.0 in thinking mode", () => {
      expect(
        resolveTemperatureLock({
          provider: "moonshot",
          model: "kimi-k2.6",
          thinkingMode: "thinking",
        })
      ).toEqual({ value: 1.0, reason: "fixed-thinking" });

      expect(
        resolveTemperatureLock({
          provider: "moonshot",
          model: "kimi-k2.5",
          thinkingMode: "thinking",
        })
      ).toEqual({ value: 1.0, reason: "fixed-thinking" });
    });

    it("locks Kimi to 0.6 in instant mode", () => {
      expect(
        resolveTemperatureLock({
          provider: "moonshot",
          model: "kimi-k2.6",
          thinkingMode: "instant",
        })
      ).toEqual({ value: 0.6, reason: "fixed-instant" });
    });

    it("locks Kimi to 1.0 by default (post-W4 default mode is thinking)", () => {
      expect(
        resolveTemperatureLock({ provider: "moonshot", model: "kimi-k2.6" })
      ).toEqual({ value: 1.0, reason: "fixed-thinking" });
    });

    it("preserves the lock for legacy openai-compatible+kimi configs", () => {
      // W5 added a findModelInCatalog fallback so users who still have
      // provider='openai-compatible' + modelId pointing at a Kimi model
      // see the same lock behavior as the new top-level moonshot provider.
      expect(
        resolveTemperatureLock({
          provider: "openai-compatible",
          model: "kimi-k2.5",
          thinkingMode: "thinking",
        })
      ).toEqual({ value: 1.0, reason: "fixed-thinking" });

      expect(
        resolveTemperatureLock({
          provider: "openai-compatible",
          model: "moonshotai/kimi-k2.6",
          thinkingMode: "instant",
        })
      ).toEqual({ value: 0.6, reason: "fixed-instant" });
    });

    it("locks GPT-5.5 to 1.0 when reasoning is on", () => {
      expect(
        resolveTemperatureLock({
          provider: "openai",
          model: "gpt-5.5",
          reasoningEffort: "medium",
        })
      ).toEqual({ value: 1.0, reason: "fixed-reasoning" });

      expect(
        resolveTemperatureLock({
          provider: "openai",
          model: "gpt-5.5",
          reasoningEffort: "xhigh",
        })
      ).toEqual({ value: 1.0, reason: "fixed-reasoning" });
    });

    it("does NOT lock GPT-5.5 when effort is none (reasoning off)", () => {
      expect(
        resolveTemperatureLock({
          provider: "openai",
          model: "gpt-5.5",
          reasoningEffort: "none",
        })
      ).toBeNull();
    });

    it("locks Anthropic Opus 4.7 / Sonnet 4.6 to 1.0 by default (no `none` effort means always reasoning)", () => {
      expect(
        resolveTemperatureLock({
          provider: "anthropic",
          model: "claude-opus-4-7",
        })
      ).toEqual({ value: 1.0, reason: "fixed-reasoning" });

      expect(
        resolveTemperatureLock({
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          reasoningEffort: "max",
        })
      ).toEqual({ value: 1.0, reason: "fixed-reasoning" });
    });

    it("returns null for an unknown model id", () => {
      expect(
        resolveTemperatureLock({ provider: "openai", model: "made-up-model" })
      ).toBeNull();
    });
  });
});
