import { describe, expect, it } from "vitest";

import {
  getThinkingCapability,
  getThinkingRequestBodyPatch,
  normalizeThinkingMode,
  resolveThinkingModel,
  supportedReasoningEfforts,
  supportsBinaryThinkingToggle,
  supportsThinkingModeSwitch,
} from "./thinking";

describe("LLM thinking mode capability", () => {
  it("normalizes unsupported mode values to auto", () => {
    expect(normalizeThinkingMode(undefined)).toBe("auto");
    expect(normalizeThinkingMode("thinking")).toBe("thinking");
    expect(normalizeThinkingMode("instant")).toBe("instant");
  });

  it("detects moonshot k2.5 as param-toggle mode", () => {
    expect(getThinkingCapability("openai-compatible", "kimi-k2.5")).toEqual({
      strategy: "param-toggle",
      parameter: "thinking",
    });
    expect(getThinkingCapability("openai-compatible", "moonshotai/kimi-k2.5")).toEqual({
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
        provider: "openai-compatible",
        model: "kimi-k2.5",
        thinkingMode: "instant",
      })
    ).toEqual({ thinking: { type: "disabled" } });

    expect(
      getThinkingRequestBodyPatch({
        provider: "openai-compatible",
        model: "kimi-k2.5",
        thinkingMode: "thinking",
      })
    ).toBeUndefined();
  });

  it("reports thinking switch availability", () => {
    expect(supportsThinkingModeSwitch("openai-compatible", "kimi-k2.5")).toBe(true);
    expect(supportsThinkingModeSwitch("deepseek", "deepseek-chat")).toBe(true);
    expect(supportsThinkingModeSwitch("deepseek", "deepseek-v4-pro")).toBe(true);
    expect(supportsThinkingModeSwitch("deepseek", "deepseek-v4-flash")).toBe(true);
    expect(supportsThinkingModeSwitch("openai", "gpt-5.5")).toBe(true);
    expect(supportsThinkingModeSwitch("openai", "gpt-5.4")).toBe(false);
  });

  it("reports binary toggle separately from effort axis", () => {
    // Binary toggle: true for param-toggle and separate-model
    expect(supportsBinaryThinkingToggle("openai-compatible", "kimi-k2.5")).toBe(true);
    expect(supportsBinaryThinkingToggle("deepseek", "deepseek-chat")).toBe(true);
    expect(supportsBinaryThinkingToggle("deepseek", "deepseek-v4-pro")).toBe(true);
    // Binary toggle: false for effort-only models — UI should hide the
    // auto/thinking/instant select and show only the effort selector.
    expect(supportsBinaryThinkingToggle("openai", "gpt-5.5")).toBe(false);
    expect(supportsBinaryThinkingToggle("openai", "gpt-5.5-pro")).toBe(false);
    expect(supportsBinaryThinkingToggle("openai", "gpt-5.4")).toBe(false);
  });

  describe("DeepSeek V4 param-toggle", () => {
    it("flash uses param-toggle without tunable effort", () => {
      expect(getThinkingCapability("deepseek", "deepseek-v4-flash")).toEqual({
        strategy: "param-toggle",
        parameter: "thinking",
      });
      expect(supportedReasoningEfforts("deepseek", "deepseek-v4-flash")).toBeNull();
    });

    it("pro exposes high effort only", () => {
      expect(getThinkingCapability("deepseek", "deepseek-v4-pro")).toEqual({
        strategy: "param-toggle",
        parameter: "thinking",
        efforts: ["high"],
      });
      expect(supportedReasoningEfforts("deepseek", "deepseek-v4-pro")).toEqual(["high"]);
    });

    it("emits enabled patch on thinking, omits on instant", () => {
      expect(
        getThinkingRequestBodyPatch({
          provider: "deepseek",
          model: "deepseek-v4-flash",
          thinkingMode: "thinking",
        })
      ).toEqual({ thinking: { type: "enabled" } });

      expect(
        getThinkingRequestBodyPatch({
          provider: "deepseek",
          model: "deepseek-v4-flash",
          thinkingMode: "instant",
        })
      ).toBeUndefined();

      expect(
        getThinkingRequestBodyPatch({
          provider: "deepseek",
          model: "deepseek-v4-flash",
          thinkingMode: "auto",
        })
      ).toBeUndefined();
    });

    it("pro adds reasoning_effort when high is requested", () => {
      expect(
        getThinkingRequestBodyPatch({
          provider: "deepseek",
          model: "deepseek-v4-pro",
          thinkingMode: "thinking",
          reasoningEffort: "high",
        })
      ).toEqual({
        thinking: { type: "enabled" },
        reasoning_effort: "high",
      });
    });

    it("pro ignores unsupported effort values", () => {
      expect(
        getThinkingRequestBodyPatch({
          provider: "deepseek",
          model: "deepseek-v4-pro",
          thinkingMode: "thinking",
          reasoningEffort: "low",
        })
      ).toEqual({ thinking: { type: "enabled" } });
    });

    it("flash drops reasoning_effort entirely", () => {
      expect(
        getThinkingRequestBodyPatch({
          provider: "deepseek",
          model: "deepseek-v4-flash",
          thinkingMode: "thinking",
          reasoningEffort: "high",
        })
      ).toEqual({ thinking: { type: "enabled" } });
    });

    it("does not resolve a separate model for V4 (param-toggle only)", () => {
      expect(
        resolveThinkingModel({
          provider: "deepseek",
          model: "deepseek-v4-pro",
          thinkingMode: "thinking",
        })
      ).toBe("deepseek-v4-pro");
    });
  });

  describe("OpenAI GPT-5.5 effort-only", () => {
    it("exposes the full low/medium/high/xhigh effort range", () => {
      expect(getThinkingCapability("openai", "gpt-5.5")).toEqual({
        strategy: "effort-only",
        parameter: "reasoning",
        efforts: ["low", "medium", "high", "xhigh"],
      });
      expect(getThinkingCapability("openai", "gpt-5.5-pro")).toEqual({
        strategy: "effort-only",
        parameter: "reasoning",
        efforts: ["low", "medium", "high", "xhigh"],
      });
      expect(supportedReasoningEfforts("openai", "gpt-5.5")).toEqual([
        "low",
        "medium",
        "high",
        "xhigh",
      ]);
    });

    it("emits the nested OpenAI shape `reasoning.effort`", () => {
      expect(
        getThinkingRequestBodyPatch({
          provider: "openai",
          model: "gpt-5.5",
          reasoningEffort: "high",
        })
      ).toEqual({ reasoning: { effort: "high" } });

      expect(
        getThinkingRequestBodyPatch({
          provider: "openai",
          model: "gpt-5.5-pro",
          reasoningEffort: "xhigh",
        })
      ).toEqual({ reasoning: { effort: "xhigh" } });
    });

    it("omits the patch when no effort is selected (API default applies)", () => {
      expect(
        getThinkingRequestBodyPatch({
          provider: "openai",
          model: "gpt-5.5",
        })
      ).toBeUndefined();
    });

    it("ignores effort on non-effort-only OpenAI models", () => {
      expect(
        getThinkingRequestBodyPatch({
          provider: "openai",
          model: "gpt-5.4",
          reasoningEffort: "high",
        })
      ).toBeUndefined();
    });

    it("never resolves a separate model (effort-only is single-id)", () => {
      expect(
        resolveThinkingModel({
          provider: "openai",
          model: "gpt-5.5",
          thinkingMode: "thinking",
        })
      ).toBe("gpt-5.5");
    });
  });
});
