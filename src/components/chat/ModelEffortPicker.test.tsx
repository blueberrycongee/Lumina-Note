import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { ModelEffortPicker } from "./ModelEffortPicker";
import { useAIStore } from "@/stores/useAIStore";
import { useLocaleStore } from "@/stores/useLocaleStore";

function setConfig(partial: Record<string, unknown>) {
  useAIStore.setState((state) => ({
    config: { ...state.config, ...partial },
  }));
}

function getTrigger(): HTMLElement {
  const el = document.querySelector<HTMLElement>("[data-model-picker-trigger]");
  if (!el) throw new Error("ModelEffortPicker trigger not in DOM");
  return el;
}

describe("ModelEffortPicker", () => {
  beforeEach(() => {
    // Reset to a clean OpenAI / GPT-5.5 baseline so each test starts from
    // an effort-only model with the default 'medium' effort already applied.
    useAIStore.setState((state) => ({
      config: {
        ...state.config,
        provider: "openai",
        model: "gpt-5.5",
        customModelId: undefined,
        thinkingMode: "auto",
        reasoningEffort: "medium",
      },
    }));
  });

  it("renders chip with the current model name and effort", () => {
    render(<ModelEffortPicker />);
    const trigger = getTrigger();
    expect(trigger.textContent ?? "").toContain("GPT-5.5");
    const { t } = useLocaleStore.getState();
    expect(trigger.textContent ?? "").toContain(
      t.aiSettings.reasoningEffortMedium,
    );
  });

  it("opens the popover on click and shows the model list", () => {
    render(<ModelEffortPicker />);
    fireEvent.click(getTrigger());
    // "GPT-5.5 Pro" is unique to the popover (the chip only shows "GPT-5.5").
    expect(screen.getByText("GPT-5.5 Pro")).toBeTruthy();
    expect(screen.getByText("GPT-5.4")).toBeTruthy();
  });

  it("closes the popover on outside click", async () => {
    render(
      <div>
        <ModelEffortPicker />
        <button type="button" data-testid="outside">
          outside
        </button>
      </div>,
    );
    fireEvent.click(getTrigger());
    const { t } = useLocaleStore.getState();
    expect(screen.queryByText(t.aiSettings.modelPicker.moreModels)).toBeTruthy();
    fireEvent.mouseDown(screen.getByTestId("outside"));
    // Popover unmounts after framer-motion's exit animation; wait it out.
    await waitFor(() => {
      expect(
        screen.queryByText(t.aiSettings.modelPicker.moreModels),
      ).toBeNull();
    });
  });

  it("clears stale reasoningEffort when switching to a model without an effort axis", () => {
    // The picker calls setConfig({ model: newId }) without an explicit effort,
    // so the store's reset path can fire. Switching from claude-opus-4-7
    // (effort=medium) to claude-haiku-4-5 (no reasoning spec) — the carried
    // effort is no longer valid and must be cleared.
    setConfig({
      provider: "anthropic",
      model: "claude-opus-4-7",
      reasoningEffort: "medium",
    });
    render(<ModelEffortPicker />);
    fireEvent.click(getTrigger());
    fireEvent.click(screen.getByText("Claude Haiku 4.5"));
    expect(useAIStore.getState().config.model).toBe("claude-haiku-4-5");
    expect(useAIStore.getState().config.reasoningEffort).toBeUndefined();
  });

  it("hides the effort section for models with no effort axis", () => {
    setConfig({
      provider: "openai",
      model: "gpt-4o",
      reasoningEffort: undefined,
    });
    render(<ModelEffortPicker />);
    fireEvent.click(getTrigger());
    const { t } = useLocaleStore.getState();
    expect(screen.queryByText(t.aiSettings.reasoningEffort)).toBeNull();
    expect(screen.queryByText(t.aiSettings.thinkingMode)).toBeNull();
  });

  it("shows two-axis layout (mode + effort) for DeepSeek V4 Pro in thinking mode", () => {
    setConfig({
      provider: "deepseek",
      model: "deepseek-v4-pro",
      thinkingMode: "thinking",
      reasoningEffort: "high",
    });
    render(<ModelEffortPicker />);
    fireEvent.click(getTrigger());
    const { t } = useLocaleStore.getState();
    expect(screen.getByText(t.aiSettings.thinkingMode)).toBeTruthy();
    expect(screen.getByText(t.aiSettings.reasoningEffort)).toBeTruthy();
  });

  it("hides effort section for param-toggle model when thinking mode is auto", () => {
    setConfig({
      provider: "deepseek",
      model: "deepseek-v4-pro",
      thinkingMode: "auto",
      reasoningEffort: undefined,
    });
    render(<ModelEffortPicker />);
    fireEvent.click(getTrigger());
    const { t } = useLocaleStore.getState();
    expect(screen.getByText(t.aiSettings.thinkingMode)).toBeTruthy();
    expect(screen.queryByText(t.aiSettings.reasoningEffort)).toBeNull();
  });
});
