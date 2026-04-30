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

  it("selecting a different model updates only the runtime model selection", () => {
    setConfig({
      provider: "anthropic",
      model: "claude-opus-4-7",
      apiKeyConfigured: true,
      reasoningEffort: "medium",
    });
    const setConfigSpy = vi.spyOn(useAIStore.getState(), "setConfig");
    render(<ModelEffortPicker />);
    fireEvent.click(getModelChip());
    fireEvent.click(screen.getByText("Claude Haiku 4.5"));
    expect(setConfigSpy).not.toHaveBeenCalled();
    expect(useAIStore.getState().config.model).toBe("claude-opus-4-7");
    expect(useAIStore.getState().runtimeModelSelection).toEqual({
      provider: "anthropic",
      model: "claude-haiku-4-5",
    });
  });

  it("can switch to a configured provider for the next message", () => {
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
    fireEvent.click(screen.getByText("DeepSeek V4 Flash"));
    expect(
      useAIStore.getState().runtimeModelSelection,
    ).toEqual({
      provider: "deepseek",
      model: "deepseek-v4-flash",
    });
    expect(useAIStore.getState().config).toMatchObject({
      provider: "openai",
      model: "gpt-5.4",
    });
  });

  it("hides unconfigured providers from the primary model list", () => {
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
    expect(screen.getByText(t.aiSettings.modelPicker.manageModelsHint)).toBeTruthy();
  });

  it("can open AI settings from the model picker footer", () => {
    const onOpenSettings = vi.fn();
    render(<ModelEffortPicker onOpenSettings={onOpenSettings} />);
    fireEvent.click(getModelChip());
    const { t } = useLocaleStore.getState();
    fireEvent.click(screen.getByText(t.aiSettings.modelPicker.manageModels));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state when no provider is ready to send", () => {
    setConfig({
      provider: "openai",
      model: "gpt-5.4",
      apiKeyConfigured: false,
      apiKey: "",
      reasoningEffort: undefined,
    });
    render(<ModelEffortPicker />);
    fireEvent.click(getModelChip());
    const { t } = useLocaleStore.getState();
    expect(screen.getByText(
      t.aiSettings.modelPicker.noConfiguredModels,
    )).toBeTruthy();
    expect(screen.queryByText(
      t.aiSettings.modelPicker.configureInSettings,
    )).toBeNull();
  });
});
