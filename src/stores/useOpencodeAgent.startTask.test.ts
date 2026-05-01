import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { invoke } from "@/lib/host";

const mocks = vi.hoisted(() => ({
  getOpencodeClient: vi.fn(),
  resetOpencodeClient: vi.fn(),
  getAIConfig: vi.fn(),
  waitForAIConfigSync: vi.fn(),
}));

vi.mock("@/services/opencode/client", () => ({
  getCachedServerInfo: vi.fn(() => null),
  getDefaultDirectory: vi.fn(() => null),
  getOpencodeClient: mocks.getOpencodeClient,
  resetOpencodeClient: mocks.resetOpencodeClient,
  setDefaultDirectory: vi.fn(),
}));

vi.mock("@/services/ai/ai", () => ({
  getAIConfig: mocks.getAIConfig,
}));

vi.mock("@/services/ai/config-sync", () => ({
  waitForAIConfigSync: mocks.waitForAIConfigSync,
}));

import { useOpencodeAgent } from "./useOpencodeAgent";
import { useAIStore } from "./useAIStore";
import { getCurrentTranslations } from "./useLocaleStore";

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

async function* singleEventStream(
  event: unknown,
  onYield: () => void,
): AsyncGenerator<unknown, void, unknown> {
  await Promise.resolve();
  yield event;
  onYield();
}

describe("useOpencodeAgent.startTask", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockResolvedValue(true);
    mocks.getAIConfig.mockReturnValue({
      provider: "ollama",
      apiKey: "",
      model: "llama3.2",
    });
    mocks.waitForAIConfigSync.mockResolvedValue(undefined);
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
    useAIStore.setState({
      config: {
        provider: "ollama",
        apiKey: "",
        apiKeyConfigured: false,
        model: "llama3.2",
      },
      runtimeModelSelection: null,
    });
  });

  afterEach(() => {
    useOpencodeAgent.getState().unsubscribe();
    vi.clearAllMocks();
  });

  it("waits for pending provider config sync and drops stale clients before sending", async () => {
    const order: string[] = [];
    mocks.waitForAIConfigSync.mockImplementation(async () => {
      order.push("config-sync");
    });
    mocks.resetOpencodeClient.mockImplementation(() => {
      order.push("reset-client");
    });
    mocks.getOpencodeClient.mockImplementation(async () => {
      order.push("get-client");
      return {
        event: {
          subscribe: vi.fn(async () => ({ stream: emptyStream() })),
        },
        session: {
          create: vi.fn(async () => ({ data: { id: "session-1" } })),
          list: vi.fn(async () => ({ data: [] })),
          promptAsync: vi.fn(async () => ({ data: {} })),
        },
      };
    });

    await useOpencodeAgent
      .getState()
      .startTask("hello", { workspace_path: "/tmp/vault" });

    expect(order.slice(0, 3)).toEqual([
      "config-sync",
      "reset-client",
      "get-client",
    ]);
  });

  it("creates opencode sessions with Lumina's localized default title", async () => {
    const create = vi.fn(async () => ({ data: { id: "session-1" } }));
    mocks.getOpencodeClient.mockResolvedValue({
      session: {
        create,
        list: vi.fn(async () => ({ data: [] })),
      },
    });

    await useOpencodeAgent.getState().newSession("/tmp/vault");

    expect(create).toHaveBeenCalledWith({
      body: { title: getCurrentTranslations().common.newConversation },
      query: { directory: "/tmp/vault" },
      throwOnError: true,
    });
  });

  it("hides inline slash AI sessions from main AI history loading", async () => {
    mocks.getOpencodeClient.mockResolvedValue({
      session: {
        list: vi.fn(async () => ({
          data: [
            {
              id: "inline-session",
              title: "Inline Insert",
              time: { created: 1, updated: 3 },
            },
            {
              id: "chat-session",
              title: "Main chat",
              time: { created: 2, updated: 4 },
            },
          ],
        })),
      },
    });

    await useOpencodeAgent.getState().loadSessions();

    expect(useOpencodeAgent.getState().sessions).toEqual([
      expect.objectContaining({
        id: "chat-session",
        title: "Main chat",
      }),
    ]);
  });

  it("ignores inline slash AI session events in main AI history", async () => {
    let resolveEventHandled = () => {};
    const eventHandled = new Promise<void>((resolve) => {
      resolveEventHandled = resolve;
    });
    mocks.getOpencodeClient.mockResolvedValue({
      event: {
        subscribe: vi.fn(async () => ({
          stream: singleEventStream(
            {
              type: "session.created",
              properties: {
                info: {
                  id: "inline-session",
                  title: "Inline Insert",
                  time: { created: 1, updated: 2 },
                },
              },
            },
            resolveEventHandled,
          ),
        })),
      },
      session: {
        list: vi.fn(async () => ({ data: [] })),
      },
    });
    useOpencodeAgent.setState({
      sessions: [
        {
          id: "chat-session",
          title: "Main chat",
          createdAt: 1,
          updatedAt: 3,
        },
      ],
    });

    await useOpencodeAgent.getState().subscribe();
    await eventHandled;

    expect(useOpencodeAgent.getState().sessions).toEqual([
      expect.objectContaining({ id: "chat-session" }),
    ]);
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

  it("sends the runtime-selected provider/model without mutating persistent config", async () => {
    const promptAsync = vi.fn(async () => ({ data: {} }));
    mocks.getAIConfig.mockReturnValue({
      provider: "openai",
      apiKey: "",
      apiKeyConfigured: true,
      model: "gpt-5.4",
    });
    mocks.getOpencodeClient.mockResolvedValue({
      event: {
        subscribe: vi.fn(async () => ({ stream: emptyStream() })),
      },
      session: {
        create: vi.fn(async () => ({ data: { id: "session-1" } })),
        list: vi.fn(async () => ({ data: [] })),
        promptAsync,
      },
    });
    useAIStore.getState().setRuntimeModelSelection({
      provider: "deepseek",
      model: "deepseek-v4-flash",
    });

    await useOpencodeAgent
      .getState()
      .startTask("hello", { workspace_path: "/tmp/vault" });

    expect(promptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          model: {
            providerID: "deepseek",
            modelID: "deepseek-v4-flash",
          },
        }),
      }),
    );
    expect(mocks.getAIConfig()).toMatchObject({
      provider: "openai",
      model: "gpt-5.4",
    });
  });
});
