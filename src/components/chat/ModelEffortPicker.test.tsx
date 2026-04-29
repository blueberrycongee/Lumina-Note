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

function chip(kind: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-chip="${kind}"]`);
}

function getModelChip(): HTMLElement {
  const el = chip("model");
  if (!el) throw new Error("model chip not in DOM");
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
        thinkingMode: "instant",
        reasoningEffort: "max",
      },
    }));
  });

  it("renders only the model chip even when legacy thinking settings exist", () => {
    render(<ModelEffortPicker />);
    expect(chip("model")).toBeTruthy();
    expect(chip("mode")).toBeNull();
    expect(chip("effort")).toBeNull();
  });

  it("selecting a different model updates the selected model", () => {
    setConfig({
      provider: "anthropic",
      model: "claude-opus-4-7",
      reasoningEffort: "medium",
    });
    render(<ModelEffortPicker />);
    fireEvent.click(getModelChip());
    fireEvent.click(screen.getByText("Claude Haiku 4.5"));
    expect(useAIStore.getState().config.model).toBe("claude-haiku-4-5");
  });

  it("shows the disabled Configure-in-Settings row for openai-compatible", () => {
    setConfig({
      provider: "openai-compatible",
      model: "custom",
      customModelId: "",
      reasoningEffort: undefined,
    });
    render(<ModelEffortPicker />);
    fireEvent.click(getModelChip());
    const { t } = useLocaleStore.getState();
    expect(
      screen.getByText(t.aiSettings.modelPicker.configureInSettings),
    ).toBeTruthy();
  });
});
