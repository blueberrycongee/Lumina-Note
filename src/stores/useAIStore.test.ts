/**
 * useAIStore 测试
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const callLLMStreamMock = vi.hoisted(() => vi.fn());
const invokeMock = vi.hoisted(() => vi.fn(async () => null));
const aiConfigState = vi.hoisted(() => ({
  current: {
    provider: "openai",
    model: "gpt-5.4",
    apiKey: "sk-test-key",
    temperature: 0.5,
  },
}));
const getAIConfigMock = vi.hoisted(() => vi.fn(() => ({ ...aiConfigState.current })));
const setAIConfigMock = vi.hoisted(() =>
  vi.fn((newConfig: Record<string, unknown>) => {
    aiConfigState.current = {
      ...aiConfigState.current,
      ...newConfig,
    };
  })
);

vi.mock("@/services/llm", () => ({
  callLLMStream: callLLMStreamMock.mockImplementation(async function* () {
    yield { type: "reasoning", text: "thinking..." };
    yield { type: "text", text: "pong" };
    yield { type: "usage", inputTokens: 1, outputTokens: 1, totalTokens: 2 };
  }),
  normalizeThinkingMode: (mode?: "auto" | "thinking" | "instant") => {
    if (mode === "thinking" || mode === "instant") return mode;
    return "auto";
  },
  supportsThinkingModeSwitch: () => true,
  buildConfigOverrideForPurpose: () => undefined,
}));

vi.mock("@/services/ai/ai", () => ({
  getAIConfig: getAIConfigMock,
  setAIConfig: setAIConfigMock,
  chat: vi.fn(),
  parseFileReferences: vi.fn(() => []),
  parseEditSuggestions: vi.fn(() => []),
  applyEdit: vi.fn((content: string) => content),
}));

vi.mock("@/lib/host", () => ({
  invoke: invokeMock,
  readFile: vi.fn(async (path: string) => path ? "" : ""),
}));

vi.mock("@/stores/useLocaleStore", () => ({
  getCurrentTranslations: () => ({
    common: {
      newConversation: "新对话",
    },
    ai: {
      apiKeyRequired: "请先配置 API Key",
      sendFailed: "发送失败",
    },
    prompts: {
      chat: {
        system: "You are Lumina.",
        contextFiles: "Context files:",
        emptyFile: "(empty)",
      },
      edit: {
        system: "You are Lumina.",
        currentFiles: "Current files:",
        contentNotLoaded: "(not loaded)",
        fileEnd: "END",
      },
    },
  }),
}));

// Import after mocks
import { useAIStore } from "./useAIStore";

describe("useAIStore sendMessageStream", () => {
  beforeEach(() => {
    callLLMStreamMock.mockClear();
    invokeMock.mockClear();
    setAIConfigMock.mockClear();
    aiConfigState.current = {
      provider: "openai",
      model: "gpt-5.4",
      apiKey: "sk-test-key",
      temperature: 0.5,
    };
    useAIStore.setState({
      config: {
        provider: "openai",
        model: "gpt-5.4",
        apiKey: "sk-test-key",
        temperature: 0.5,
      },
      messages: [],
      sessions: [],
      currentSessionId: null,
      error: null,
      isStreaming: false,
      isLoading: false,
      streamingContent: "",
      streamingReasoning: "",
      streamingReasoningStatus: "idle",
      pendingEdits: [],
      referencedFiles: [],
    });
  });

  it("should use runtime config apiKey for streaming", async () => {
    await useAIStore.getState().sendMessageStream("hello");

    expect(callLLMStreamMock).toHaveBeenCalledTimes(1);
    expect(useAIStore.getState().error).toBeNull();
    const messages = useAIStore.getState().messages;
    expect(messages[messages.length - 1]).toMatchObject({
      role: "assistant",
    });
    const assistantContent = String(messages[messages.length - 1].content);
    expect(assistantContent).toContain("<thinking>");
    expect(assistantContent).toContain("thinking...");
    expect(assistantContent).toContain("pong");
  });

  it("should ignore duplicate stream requests while streaming", async () => {
    useAIStore.setState({ isStreaming: true });

    await useAIStore.getState().sendMessageStream("hello");

    expect(callLLMStreamMock).not.toHaveBeenCalled();
    expect(useAIStore.getState().messages).toHaveLength(0);
  });

  it("syncs resolved provider settings to backend for custom models", async () => {
    await useAIStore.getState().setConfig({
      provider: "openai-compatible",
      model: "custom",
      customModelId: "kimi-k2.5",
      baseUrl: "https://api.moonshot.cn/v1",
    });

    expect(invokeMock).toHaveBeenCalledWith("agent_set_active_provider", {
      provider_id: "openai-compatible",
    });
    expect(invokeMock).toHaveBeenCalledWith("agent_set_provider_settings", {
      provider_id: "openai-compatible",
      settings: {
        modelId: "kimi-k2.5",
        baseUrl: "https://api.moonshot.cn/v1",
      },
    });
  });
});
