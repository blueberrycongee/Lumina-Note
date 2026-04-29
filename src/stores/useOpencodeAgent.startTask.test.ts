import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  getOpencodeClient: vi.fn(),
  getAIConfig: vi.fn(),
}));

vi.mock("@/services/opencode/client", () => ({
  getCachedServerInfo: vi.fn(() => null),
  getDefaultDirectory: vi.fn(() => null),
  getOpencodeClient: mocks.getOpencodeClient,
  resetOpencodeClient: vi.fn(),
  setDefaultDirectory: vi.fn(),
}));

vi.mock("@/services/ai/ai", () => ({
  getAIConfig: mocks.getAIConfig,
}));

import { useOpencodeAgent } from "./useOpencodeAgent";

async function* emptyStream(): AsyncGenerator<never, void, unknown> {
  return;
}

async function* disposedStream(): AsyncGenerator<unknown, void, unknown> {
  await Promise.resolve();
  yield {
    type: "server.instance.disposed",
    properties: { directory: "/tmp/vault" },
  };
}

describe("useOpencodeAgent.startTask", () => {
  beforeEach(() => {
    mocks.getAIConfig.mockReturnValue({
      provider: "ollama",
      apiKey: "",
      model: "llama3.2",
    });
    mocks.getOpencodeClient.mockResolvedValue({
      event: {
        subscribe: vi.fn(async () => ({ stream: emptyStream() })),
      },
      session: {
        create: vi.fn(async () => ({ data: { id: "session-1" } })),
        list: vi.fn(async () => ({ data: [] })),
        promptAsync: vi.fn(async () => ({ data: {} })),
      },
    });
    useOpencodeAgent.setState({
      status: "idle",
      messages: [],
      error: null,
      currentSessionId: null,
      sessions: [],
      pendingTool: null,
      llmRetryState: null,
      _subscribed: false,
      _abortController: null,
    });
  });

  afterEach(() => {
    useOpencodeAgent.getState().unsubscribe();
    vi.clearAllMocks();
  });

  it("shows the optimistic user message before waiting for opencode startup", async () => {
    const promise = useOpencodeAgent
      .getState()
      .startTask("hello", { workspace_path: "/tmp/vault" });

    const immediate = useOpencodeAgent.getState();
    expect(immediate.status).toBe("running");
    expect(immediate.messages).toEqual([
      expect.objectContaining({
        role: "user",
        content: "hello",
      }),
    ]);

    await promise;
  });

  it("releases the running state when opencode disposes the active instance", async () => {
    mocks.getOpencodeClient.mockResolvedValue({
      event: {
        subscribe: vi.fn(async () => ({ stream: disposedStream() })),
      },
      session: {
        create: vi.fn(async () => ({ data: { id: "session-1" } })),
        list: vi.fn(async () => ({ data: [] })),
        promptAsync: vi.fn(async () => ({ data: {} })),
      },
    });

    await useOpencodeAgent
      .getState()
      .startTask("hello", { workspace_path: "/tmp/vault" });

    await waitFor(() => {
      expect(useOpencodeAgent.getState().status).toBe("idle");
    });
  });
});
