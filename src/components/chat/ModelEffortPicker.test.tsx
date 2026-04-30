import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    vi.clearAllMocks();
    useAIStore.setState((state) => ({
      config: {
        ...state.config,
        provider: "openai",
        model: "gpt-5.5",
        apiKey: "",
        apiKeyConfigured: true,
        customModelId: undefined,
        thinkingMode: "instant",
        reasoningEffort: "max",
      },
      providerSettings: {
        activeProviderId: "openai",
        perProvider: {},
      },
      runtimeModelSelection: null,
    }));
  });

  it("renders only the model chip even when legacy thinking settings exist", () => {
    render(<ModelEffortPicker />);
    expect(chip("model")).toBeTruthy();
    expect(chip("mode")).toBeNull();
    expect(chip("effort")).toBeNull();
  });

  it("selecting a different model updates the configured model", () => {
    setConfig({
      provider: "anthropic",
      model: "claude-opus-4-7",
      apiKeyConfigured: true,
      reasoningEffort: "medium",
    });
    render(<ModelEffortPicker />);
    fireEvent.click(getModelChip());
    fireEvent.click(screen.getByText("Claude Haiku 4.5"));
    expect(useAIStore.getState().config.model).toBe("claude-haiku-4-5");
    expect(useAIStore.getState().runtimeModelSelection).toBeNull();
  });

  it("does not show models from other configured providers", () => {
    setConfig({
      provider: "openai",
      model: "gpt-5.4",
      apiKeyConfigured: true,
      reasoningEffort: undefined,
    });
    useAIStore.setState((state) => ({
      providerSettings: {
        activeProviderId: "openai",
        perProvider: {
          ...state.providerSettings.perProvider,
          deepseek: {
            modelId: "deepseek-v4-flash",
            apiKeyConfigured: true,
          },
        },
      },
    }));
    render(<ModelEffortPicker />);
    fireEvent.click(getModelChip());
    expect(screen.queryByText("DeepSeek V4 Flash")).toBeNull();
    expect(screen.getAllByText("GPT-5.4").length).toBeGreaterThan(0);
  });

  it("shows only the current provider model list", () => {
    setConfig({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      apiKeyConfigured: true,
      reasoningEffort: undefined,
    });
    render(<ModelEffortPicker />);
    fireEvent.click(getModelChip());
    const { t } = useLocaleStore.getState();
    expect(
      screen.queryByText(
        t.aiSettings.modelPicker.configureInSettings,
      ),
    ).toBeNull();
    expect(screen.queryByText("Anthropic")).toBeNull();
    expect(screen.queryByText("OpenAI")).toBeNull();
    expect(screen.getAllByText("DeepSeek V4 Flash").length).toBeGreaterThan(0);
    expect(
      screen.queryByText(t.aiSettings.modelPicker.manageModelsHint),
    ).toBeNull();
  });

  it("shows the settings hint row when the provider has no preset model list", () => {
    setConfig({
      provider: "openai-compatible",
      model: "custom",
      customModelId: "custom-model",
      apiKeyConfigured: true,
      apiKey: "",
      reasoningEffort: undefined,
    });
    render(<ModelEffortPicker />);
    fireEvent.click(getModelChip());
    const { t } = useLocaleStore.getState();
    expect(screen.getByText(
      t.aiSettings.modelPicker.configureInSettings,
    )).toBeTruthy();
    expect(screen.queryByText(
      t.aiSettings.modelPicker.noConfiguredModels,
    )).toBeNull();
  });
});
