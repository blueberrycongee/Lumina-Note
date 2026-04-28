import { describe, expect, it } from "vitest";

import {
  handleOpencodeServerChanged,
  resolveOpencodePromptModel,
  useOpencodeAgent,
  type AgentMessage,
} from "./useOpencodeAgent";

describe("resolveOpencodePromptModel", () => {
  it("resolves the selected DeepSeek model exactly", () => {
    expect(
      resolveOpencodePromptModel({
        provider: "deepseek",
        model: "deepseek-v4-flash",
      }),
    ).toEqual({
      providerID: "deepseek",
      modelID: "deepseek-v4-flash",
    });
  });

  it("uses Lumina's declared opencode provider id for custom providers", () => {
    expect(
      resolveOpencodePromptModel({
        provider: "openai-compatible",
        model: "custom",
        customModelId: "  kimi-k2.5  ",
      }),
    ).toEqual({
      providerID: "lumina-compat",
      modelID: "kimi-k2.5",
    });
  });

  it("omits an invalid custom model instead of sending an empty model id", () => {
    expect(
      resolveOpencodePromptModel({
        provider: "openai-compatible",
        model: "custom",
        customModelId: "   ",
      }),
    ).toBeUndefined();
  });
});

describe("handleOpencodeServerChanged", () => {
  it("does not discard the active conversation during provider restarts", () => {
    const messages: AgentMessage[] = [
      {
        id: "msg-1",
        role: "user",
        content: "keep this context",
        rawParts: [],
      },
    ];

    useOpencodeAgent.setState({
      currentSessionId: "session-1",
      messages,
      pendingTool: {
        tool: { id: "tool-1", name: "edit", params: {} },
        requestId: "request-1",
      },
      status: "waiting_approval",
      error: "stale",
      llmRetryState: {
        attempt: 1,
        maxRetries: 3,
        reason: "retry",
        nextRetryAt: 123,
      },
    });

    handleOpencodeServerChanged(null);

    expect(useOpencodeAgent.getState().currentSessionId).toBe("session-1");
    expect(useOpencodeAgent.getState().messages).toEqual(messages);
    expect(useOpencodeAgent.getState().pendingTool).toBeNull();
    expect(useOpencodeAgent.getState().status).toBe("idle");
    expect(useOpencodeAgent.getState().error).toBeNull();
    expect(useOpencodeAgent.getState().llmRetryState).toBeNull();
  });
});
