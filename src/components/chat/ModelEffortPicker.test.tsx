import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { ModelEffortPicker } from "./ModelEffortPicker";
import { useAIStore } from "@/stores/useAIStore";
import { useLocaleStore } from "@/stores/useLocaleStore";

function setConfig(partial: Record<string, unknown>) {
  useAIStore.setState((state) => ({
    config: { ...state.config, ...partial },
  }));
}

function chip(kind: "model" | "mode" | "effort"): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-chip="${kind}"]`);
}

function getChip(kind: "model" | "mode" | "effort"): HTMLElement {
  const el = chip(kind);
  if (!el) throw new Error(`${kind} chip not in DOM`);
  return el;
}

describe("ModelEffortPicker", () => {
  beforeEach(() => {
    useAIStore.setState((state) => ({
      config: {
        ...state.config,
        provider: "openai",
        model: "gpt-5.5",
        customModelId: undefined,
        thinkingMode: "thinking",
        reasoningEffort: "medium",
      },
    }));
  });

  it("renders only the model chip when the model has no thinking axis", () => {
    setConfig({ provider: "openai", model: "gpt-4o", reasoningEffort: undefined });
    render(<ModelEffortPicker />);
    expect(chip("model")).toBeTruthy();
    expect(chip("mode")).toBeNull();
    expect(chip("effort")).toBeNull();
  });

  it("renders model + effort chips for GPT-5.5 (effort-only)", () => {
    render(<ModelEffortPicker />);
    expect(chip("model")).toBeTruthy();
    expect(chip("mode")).toBeNull();
    expect(chip("effort")).toBeTruthy();
    const { t } = useLocaleStore.getState();
    expect(getChip("effort").textContent ?? "").toContain(
      t.aiSettings.reasoningEffortMedium,
    );
  });

  it("renders model + mode + effort chips for DeepSeek V4 Pro in thinking mode", () => {
    setConfig({
      provider: "deepseek",
      model: "deepseek-v4-pro",
      thinkingMode: "thinking",
      reasoningEffort: "high",
    });
    render(<ModelEffortPicker />);
    expect(chip("model")).toBeTruthy();
    expect(chip("mode")).toBeTruthy();
    expect(chip("effort")).toBeTruthy();
  });

  it("hides the effort chip for DeepSeek V4 Pro in instant mode", () => {
    setConfig({
      provider: "deepseek",
      model: "deepseek-v4-pro",
      thinkingMode: "instant",
      reasoningEffort: undefined,
    });
    render(<ModelEffortPicker />);
    expect(chip("model")).toBeTruthy();
    expect(chip("mode")).toBeTruthy();
    expect(chip("effort")).toBeNull();
  });

  it("renders model + mode chips only for Kimi K2.5 (binary toggle, no effort)", () => {
    setConfig({
      provider: "openai-compatible",
      model: "custom",
      customModelId: "kimi-k2.5",
      thinkingMode: "thinking",
      reasoningEffort: undefined,
    });
    render(<ModelEffortPicker />);
    expect(chip("model")).toBeTruthy();
    expect(chip("mode")).toBeTruthy();
    expect(chip("effort")).toBeNull();
  });

  it("mode popover lists exactly Thinking and Instant (no Auto)", () => {
    setConfig({
      provider: "deepseek",
      model: "deepseek-v4-pro",
      thinkingMode: "thinking",
    });
    render(<ModelEffortPicker />);
    fireEvent.click(getChip("mode"));
    const { t } = useLocaleStore.getState();
    const popover = document.querySelector<HTMLElement>(
      '[data-chip-popover="mode"]',
    );
    expect(popover).toBeTruthy();
    expect(popover?.textContent ?? "").toContain(t.aiSettings.thinkingModeThinking);
    expect(popover?.textContent ?? "").toContain(t.aiSettings.thinkingModeInstant);
    // No third option — the legacy "Auto" label was dropped in W4.
    const rows = popover?.querySelectorAll('[role="button"]') ?? [];
    expect(rows.length).toBe(2);
  });

  it("selecting a different model calls setConfig with model only", () => {
    setConfig({
      provider: "anthropic",
      model: "claude-opus-4-7",
      reasoningEffort: "medium",
    });
    render(<ModelEffortPicker />);
    fireEvent.click(getChip("model"));
    fireEvent.click(screen.getByText("Claude Haiku 4.5"));
    // The store's reset path clears the carried effort (haiku has no
    // reasoning axis) — picker doesn't pass effort itself.
    expect(useAIStore.getState().config.model).toBe("claude-haiku-4-5");
    expect(useAIStore.getState().config.reasoningEffort).toBeUndefined();
  });

  it("selecting an effort calls setConfig with reasoningEffort", () => {
    render(<ModelEffortPicker />);
    fireEvent.click(getChip("effort"));
    const { t } = useLocaleStore.getState();
    fireEvent.click(screen.getByText(t.aiSettings.reasoningEffortHigh));
    expect(useAIStore.getState().config.reasoningEffort).toBe("high");
  });

  it("shows the disabled Configure-in-Settings row for openai-compatible", () => {
    setConfig({
      provider: "openai-compatible",
      model: "custom",
      customModelId: "",
      reasoningEffort: undefined,
    });
    render(<ModelEffortPicker />);
    fireEvent.click(getChip("model"));
    const { t } = useLocaleStore.getState();
    expect(
      screen.getByText(t.aiSettings.modelPicker.configureInSettings),
    ).toBeTruthy();
  });
});
