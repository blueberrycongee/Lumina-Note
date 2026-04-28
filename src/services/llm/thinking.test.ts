import { describe, expect, it } from "vitest";

import {
  getDefaultReasoningEffort,
  getThinkingCapability,
  getThinkingRequestBodyPatch,
  normalizeThinkingMode,
  resolveThinkingModel,
  supportedReasoningEfforts,
  supportsBinaryThinkingToggle,
  supportsThinkingModeSwitch,
} from "./thinking";

describe("LLM thinking mode capability", () => {
  it("normalizes unsupported mode values to the thinking default", () => {
    // W4: undefined and any unrecognised value (e.g. legacy "auto" persisted
    // by older clients) collapse to "thinking" — the post-W4 default.
    expect(normalizeThinkingMode(undefined)).toBe("thinking");
    expect(normalizeThinkingMode("auto")).toBe("thinking");
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

    // W4: with the binary union and default = "thinking", an undefined mode
    // resolves to the thinking-side model (no more pass-through behavior).
    expect(
      resolveThinkingModel({
        provider: "deepseek",
        model: "deepseek-chat",
      })
    ).toBe("deepseek-reasoner");
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
    // GPT-5.4 used to be a no-reasoning legacy model; W2 enabled effort-only
    // for the GPT-5.4 family per OpenAI docs.
    expect(supportsThinkingModeSwitch("openai", "gpt-5.4")).toBe(true);
    // gpt-4o still has no reasoning axis.
    expect(supportsThinkingModeSwitch("openai", "gpt-4o")).toBe(false);
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
    // GPT-5.4 family is now effort-only per W2 — no binary toggle.
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

    it("pro exposes high and max effort tiers", () => {
      // W2: DeepSeek V4 Pro supports the `max` effort in addition to `high`.
      expect(getThinkingCapability("deepseek", "deepseek-v4-pro")).toEqual({
        strategy: "param-toggle",
        parameter: "thinking",
        efforts: ["high", "max"],
      });
      expect(supportedReasoningEfforts("deepseek", "deepseek-v4-pro")).toEqual([
        "high",
        "max",
      ]);
    });

    it("emits enabled on thinking and disabled on instant, both wrapped in extra_body", () => {
      // W2: DeepSeek's `thinking` field is forwarded under `extra_body`
      // per the official DeepSeek docs. `reasoning_effort` stays top-level.
      expect(
        getThinkingRequestBodyPatch({
          provider: "deepseek",
          model: "deepseek-v4-flash",
          thinkingMode: "thinking",
        })
      ).toEqual({ extra_body: { thinking: { type: "enabled" } } });

      // V4 Pro / Flash default to reasoning-on at the API, so instant must
      // actively send `disabled` — otherwise the toggle is one-way and
      // Flash keeps emitting reasoning despite the UI selection.
      expect(
        getThinkingRequestBodyPatch({
          provider: "deepseek",
          model: "deepseek-v4-flash",
          thinkingMode: "instant",
        })
      ).toEqual({ extra_body: { thinking: { type: "disabled" } } });

      // W4: undefined mode normalizes to "thinking" (the new default),
      // so DeepSeek V4 emits the enabled blob just like an explicit
      // thinking selection. Pre-W4 this case yielded undefined.
      expect(
        getThinkingRequestBodyPatch({
          provider: "deepseek",
          model: "deepseek-v4-flash",
        })
      ).toEqual({ extra_body: { thinking: { type: "enabled" } } });
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
        extra_body: { thinking: { type: "enabled" } },
        reasoning_effort: "high",
      });
    });

    it("pro accepts max effort", () => {
      expect(
        getThinkingRequestBodyPatch({
          provider: "deepseek",
          model: "deepseek-v4-pro",
          thinkingMode: "thinking",
          reasoningEffort: "max",
        })
      ).toEqual({
        extra_body: { thinking: { type: "enabled" } },
        reasoning_effort: "max",
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
      ).toEqual({ extra_body: { thinking: { type: "enabled" } } });
    });

    it("flash drops reasoning_effort entirely", () => {
      expect(
        getThinkingRequestBodyPatch({
          provider: "deepseek",
          model: "deepseek-v4-flash",
          thinkingMode: "thinking",
          reasoningEffort: "high",
        })
      ).toEqual({ extra_body: { thinking: { type: "enabled" } } });
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
    it("exposes the full none/low/medium/high/xhigh effort range", () => {
      // W2: `none` effort tier was added per OpenAI docs.
      expect(getThinkingCapability("openai", "gpt-5.5")).toEqual({
        strategy: "effort-only",
        parameter: "reasoning",
        efforts: ["none", "low", "medium", "high", "xhigh"],
      });
      expect(getThinkingCapability("openai", "gpt-5.5-pro")).toEqual({
        strategy: "effort-only",
        parameter: "reasoning",
        efforts: ["none", "low", "medium", "high", "xhigh"],
      });
      expect(supportedReasoningEfforts("openai", "gpt-5.5")).toEqual([
        "none",
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

    it("emits `reasoning.effort: none` when the user explicitly opts out", () => {
      // W2: passing 'none' is now valid and must round-trip into the request.
      expect(
        getThinkingRequestBodyPatch({
          provider: "openai",
          model: "gpt-5.5",
          reasoningEffort: "none",
        })
      ).toEqual({ reasoning: { effort: "none" } });
    });

    it("omits the patch when no effort is selected (API default applies)", () => {
      expect(
        getThinkingRequestBodyPatch({
          provider: "openai",
          model: "gpt-5.5",
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

  describe("OpenAI GPT-5.4 family (W2: effort-only)", () => {
    it("exposes the same effort range as GPT-5.5 with default 'none'", () => {
      const expectedEfforts = ["none", "low", "medium", "high", "xhigh"];
      for (const id of ["gpt-5.4", "gpt-5.4-mini", "gpt-5"]) {
        expect(getThinkingCapability("openai", id)).toEqual({
          strategy: "effort-only",
          parameter: "reasoning",
          efforts: expectedEfforts,
        });
        expect(getDefaultReasoningEffort("openai", id)).toBe("none");
      }
    });

    it("emits the openai-reasoning shape when an effort is selected", () => {
      expect(
        getThinkingRequestBodyPatch({
          provider: "openai",
          model: "gpt-5.4",
          reasoningEffort: "high",
        })
      ).toEqual({ reasoning: { effort: "high" } });

      expect(
        getThinkingRequestBodyPatch({
          provider: "openai",
          model: "gpt-5.4-mini",
          reasoningEffort: "low",
        })
      ).toEqual({ reasoning: { effort: "low" } });
    });

    it("omits the patch when no effort is selected (API default = none)", () => {
      // gpt-5.4's API default is `none`, but we still omit the field rather
      // than emit `reasoning.effort: none` so legacy behavior is preserved.
      expect(
        getThinkingRequestBodyPatch({
          provider: "openai",
          model: "gpt-5.4",
        })
      ).toBeUndefined();
    });
  });

  describe("Anthropic effort-only (W2: anthropic-output-config)", () => {
    it("Opus 4.7 exposes low/medium/high/xhigh/max with default 'high'", () => {
      expect(getThinkingCapability("anthropic", "claude-opus-4-7")).toEqual({
        strategy: "effort-only",
        parameter: "reasoning",
        efforts: ["low", "medium", "high", "xhigh", "max"],
      });
      expect(getDefaultReasoningEffort("anthropic", "claude-opus-4-7")).toBe("high");
    });

    it("Sonnet 4.6 / Opus 4.6 / Opus 4.5 expose low/medium/high/max (no xhigh)", () => {
      const expectedEfforts = ["low", "medium", "high", "max"];
      for (const id of ["claude-sonnet-4-6", "claude-opus-4-6", "claude-opus-4-5"]) {
        expect(getThinkingCapability("anthropic", id)).toEqual({
          strategy: "effort-only",
          parameter: "reasoning",
          efforts: expectedEfforts,
        });
        expect(getDefaultReasoningEffort("anthropic", id)).toBe("high");
      }
    });

    it("Haiku 4.5 has no reasoning capability (Anthropic docs)", () => {
      expect(getThinkingCapability("anthropic", "claude-haiku-4-5")).toEqual({
        strategy: "none",
      });
      expect(supportsThinkingModeSwitch("anthropic", "claude-haiku-4-5")).toBe(false);
    });

    it("emits output_config.effort + thinking.adaptive on non-default efforts", () => {
      expect(
        getThinkingRequestBodyPatch({
          provider: "anthropic",
          model: "claude-opus-4-7",
          reasoningEffort: "low",
        })
      ).toEqual({
        output_config: { effort: "low" },
        thinking: { type: "adaptive" },
      });

      expect(
        getThinkingRequestBodyPatch({
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          reasoningEffort: "max",
        })
      ).toEqual({
        output_config: { effort: "max" },
        thinking: { type: "adaptive" },
      });
    });

    it("omits output_config.effort when effort === 'high' (API default)", () => {
      // Anthropic docs: `effort: 'high'` is identical to omitting the field.
      // Skip the field but still send the adaptive thinking flag.
      expect(
        getThinkingRequestBodyPatch({
          provider: "anthropic",
          model: "claude-opus-4-7",
          reasoningEffort: "high",
        })
      ).toEqual({ thinking: { type: "adaptive" } });
    });

    it("omits the entire patch when no effort is selected (API default applies)", () => {
      expect(
        getThinkingRequestBodyPatch({
          provider: "anthropic",
          model: "claude-opus-4-7",
        })
      ).toBeUndefined();
    });
  });

  describe("Zhipu GLM param-toggle (W6)", () => {
    it("glm-5 reports param-toggle (binary thinking) capability", () => {
      expect(getThinkingCapability("glm", "glm-5")).toEqual({
        strategy: "param-toggle",
        parameter: "thinking",
      });
      expect(getThinkingCapability("glm", "glm-5-x")).toEqual({
        strategy: "param-toggle",
        parameter: "thinking",
      });
      expect(getThinkingCapability("glm", "glm-4.7")).toEqual({
        strategy: "param-toggle",
        parameter: "thinking",
      });
    });

    it("glm-4.7-flash and glm-4.5-air report no reasoning capability", () => {
      expect(getThinkingCapability("glm", "glm-4.7-flash")).toEqual({
        strategy: "none",
      });
      expect(getThinkingCapability("glm", "glm-4.5-air")).toEqual({
        strategy: "none",
      });
    });

    it("emits the binary disable patch only when forcing instant", () => {
      expect(
        getThinkingRequestBodyPatch({
          provider: "glm",
          model: "glm-5",
          thinkingMode: "instant",
        }),
      ).toEqual({ thinking: { type: "disabled" } });

      expect(
        getThinkingRequestBodyPatch({
          provider: "glm",
          model: "glm-5",
          thinkingMode: "thinking",
        }),
      ).toBeUndefined();
    });

    it("preserves the binary-thinking capability for legacy openai-compatible+glm configs", () => {
      // W6 drops the `zhipu` preset but findModelInCatalog falls back through
      // [moonshot, glm, mimo] so existing user configs keep their thinking
      // shape. The bridge mirror covers the same fallback via
      // openai-compatible::glm-* entries.
      expect(getThinkingCapability("openai-compatible", "glm-5")).toEqual({
        strategy: "param-toggle",
        parameter: "thinking",
      });
    });
  });

  describe("Xiaomi MiMo effort-only (W6)", () => {
    it("mimo-v2.5-pro exposes low/medium/high with default 'medium'", () => {
      expect(getThinkingCapability("mimo", "mimo-v2.5-pro")).toEqual({
        strategy: "effort-only",
        parameter: "reasoning",
        efforts: ["low", "medium", "high"],
      });
      expect(getDefaultReasoningEffort("mimo", "mimo-v2.5-pro")).toBe("medium");
      expect(supportedReasoningEfforts("mimo", "mimo-v2.5-pro")).toEqual([
        "low",
        "medium",
        "high",
      ]);
    });

    it("mimo-v2-pro and mimo-v2-omni share the same effort axis", () => {
      for (const id of ["mimo-v2-pro", "mimo-v2-omni"]) {
        expect(getThinkingCapability("mimo", id)).toEqual({
          strategy: "effort-only",
          parameter: "reasoning",
          efforts: ["low", "medium", "high"],
        });
        expect(getDefaultReasoningEffort("mimo", id)).toBe("medium");
      }
    });

    it("mimo-v2-flash has no reasoning capability", () => {
      expect(getThinkingCapability("mimo", "mimo-v2-flash")).toEqual({
        strategy: "none",
      });
      expect(getDefaultReasoningEffort("mimo", "mimo-v2-flash")).toBeNull();
    });

    it("emits the flat reasoning_effort field (NOT nested under `reasoning`)", () => {
      expect(
        getThinkingRequestBodyPatch({
          provider: "mimo",
          model: "mimo-v2.5-pro",
          reasoningEffort: "high",
        }),
      ).toEqual({ reasoning_effort: "high" });

      expect(
        getThinkingRequestBodyPatch({
          provider: "mimo",
          model: "mimo-v2-omni",
          reasoningEffort: "low",
        }),
      ).toEqual({ reasoning_effort: "low" });
    });

    it("omits the patch when no effort is selected", () => {
      expect(
        getThinkingRequestBodyPatch({
          provider: "mimo",
          model: "mimo-v2.5-pro",
        }),
      ).toBeUndefined();
    });

    it("ignores efforts outside the supported range", () => {
      expect(
        getThinkingRequestBodyPatch({
          provider: "mimo",
          model: "mimo-v2.5-pro",
          reasoningEffort: "xhigh",
        }),
      ).toBeUndefined();
    });
  });

  describe("getDefaultReasoningEffort", () => {
    it("returns the per-model API default for effort-only models", () => {
      // OpenAI 5.5 family defaults to medium.
      expect(getDefaultReasoningEffort("openai", "gpt-5.5")).toBe("medium");
      expect(getDefaultReasoningEffort("openai", "gpt-5.5-pro")).toBe("medium");
      // GPT-5.4 family defaults to none per OpenAI docs.
      expect(getDefaultReasoningEffort("openai", "gpt-5.4")).toBe("none");
      // Anthropic defaults to high.
      expect(getDefaultReasoningEffort("anthropic", "claude-opus-4-7")).toBe("high");
    });

    it("returns null when the model has no reasoning axis", () => {
      expect(getDefaultReasoningEffort("openai", "gpt-4o")).toBeNull();
      expect(getDefaultReasoningEffort("anthropic", "claude-haiku-4-5")).toBeNull();
    });

    it("returns null when no model is provided", () => {
      expect(getDefaultReasoningEffort("openai", undefined)).toBeNull();
    });
  });
});
