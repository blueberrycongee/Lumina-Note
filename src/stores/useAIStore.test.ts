/**
 * useAIStore 测试
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const callLLMStreamMock = vi.hoisted(() => vi.fn());
const getAIConfigMock = vi.hoisted(() =>
  vi.fn(() => ({
    provider: "moonshot",
    model: "kimi-k2-0711-preview",
    apiKey: "sk-test-key",
    temperature: 0.5,
  }))
);

vi.mock("@/services/llm", () => ({
  callLLMStream: callLLMStreamMock.mockImplementation(async function* () {
    yield { type: "reasoning", text: "thinking..." };
    yield { type: "text", text: "pong" };
    yield { type: "usage", inputTokens: 1, outputTokens: 1, totalTokens: 2 };
  }),
}));

vi.mock("@/services/ai/ai", () => ({
  getAIConfig: getAIConfigMock,
  setAIConfig: vi.fn(),
  chat: vi.fn(),
  parseFileReferences: vi.fn(() => []),
  parseEditSuggestions: vi.fn(() => []),
  applyEdit: vi.fn((content: string) => content),
}));

vi.mock("@/lib/tauri", () => ({
  readFile: vi.fn(async () => ""),
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
    useAIStore.setState({
      config: {
        provider: "moonshot",
        model: "kimi-k2-0711-preview",
        apiKey: "",
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
      content: "pong",
    });
  });

  it("should ignore duplicate stream requests while streaming", async () => {
    useAIStore.setState({ isStreaming: true });

    await useAIStore.getState().sendMessageStream("hello");

    expect(callLLMStreamMock).not.toHaveBeenCalled();
    expect(useAIStore.getState().messages).toHaveLength(0);
  });
});
