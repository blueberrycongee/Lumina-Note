import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MainAIChatShell } from "./MainAIChatShell";
import { useFileStore } from "@/stores/useFileStore";
import { useAIStore } from "@/stores/useAIStore";
import { useOpencodeAgent } from "@/stores/useOpencodeAgent";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useErrorBanner } from "@/stores/useErrorBanner";

describe("MainAIChatShell", () => {
  const originalStartTask = useOpencodeAgent.getState().startTask;

  beforeEach(() => {
    useFileStore.setState({ vaultPath: "/tmp" });
    useAIStore.setState({ pendingInputAppends: [] });
    useOpencodeAgent.setState({
      messages: [],
      status: "idle",
      currentSessionId: null,
      startTask: originalStartTask,
    });
    useErrorBanner.setState({ active: null });
  });

  it("renders textarea in agent mode", () => {
    render(<MainAIChatShell />);
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("appends text into input when receiving ai-input-append event", () => {
    render(<MainAIChatShell />);

    fireEvent(
      window,
      new CustomEvent("ai-input-append", {
        detail: { text: "Quoted from PDF" },
      }),
    );

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(input.value).toContain("Quoted from PDF");
  });

  it("appends incoming ai-input-append text as a new paragraph", () => {
    render(<MainAIChatShell />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Initial prompt" } });
    fireEvent(
      window,
      new CustomEvent("ai-input-append", { detail: { text: "PDF Quote" } }),
    );

    expect(input.value).toBe("Initial prompt\n\nPDF Quote");
  });

  it("consumes queued input appends from store on mount", () => {
    useAIStore.getState().enqueueInputAppend("Queued from PDF");
    render(<MainAIChatShell />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(input.value).toContain("Queued from PDF");
    expect(useAIStore.getState().pendingInputAppends).toHaveLength(0);
  });

  it("sends pasted screenshots as opencode file parts", async () => {
    const startTask = vi.fn(async () => undefined);
    useOpencodeAgent.setState({
      currentSessionId: "test-session",
      status: "idle",
      startTask: startTask as typeof originalStartTask,
    });

    render(<MainAIChatShell />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    const file = new File(["image-bytes"], "clip.png", { type: "image/png" });
    fireEvent.paste(input, {
      clipboardData: {
        items: [
          {
            type: "image/png",
            getAsFile: () => file,
          },
        ],
      },
    });

    await waitFor(() => expect(screen.getByAltText("clip.png")).toBeTruthy());
    fireEvent.change(input, { target: { value: "what is this?" } });

    const { t } = useLocaleStore.getState();
    fireEvent.click(screen.getByTitle(t.ai.send));

    await waitFor(() => expect(startTask).toHaveBeenCalledTimes(1));
    const [task, context] = startTask.mock.calls[0] as unknown as Parameters<
      typeof originalStartTask
    >;
    expect(task).toBe("what is this?");
    expect(context?.fileParts).toHaveLength(1);
    expect(context?.fileParts?.[0]).toMatchObject({
      type: "file",
      mime: "image/png",
      filename: "clip.png",
    });
    expect(context?.fileParts?.[0]?.url).toMatch(
      /^data:image\/png;base64,/,
    );
  });

  it("sends pasted screenshots without requiring text", async () => {
    const startTask = vi.fn(async () => undefined);
    useOpencodeAgent.setState({
      currentSessionId: "test-session",
      status: "idle",
      startTask: startTask as typeof originalStartTask,
    });

    render(<MainAIChatShell />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    const file = new File(["image-bytes"], "clip.png", { type: "image/png" });
    fireEvent.paste(input, {
      clipboardData: {
        items: [
          {
            type: "image/png",
            getAsFile: () => file,
          },
        ],
      },
    });

    await waitFor(() => expect(screen.getByAltText("clip.png")).toBeTruthy());

    const { t } = useLocaleStore.getState();
    fireEvent.click(screen.getByTitle(t.ai.send));

    await waitFor(() => expect(startTask).toHaveBeenCalledTimes(1));
    const [task, context] = startTask.mock.calls[0] as unknown as Parameters<
      typeof originalStartTask
    >;
    expect(task).toBe("");
    expect(context?.fileParts).toHaveLength(1);
    expect(context?.fileParts?.[0]).toMatchObject({
      type: "file",
      mime: "image/png",
      filename: "clip.png",
    });
  });

  it("attaches generated images from assistant message click events", async () => {
    const startTask = vi.fn(async () => undefined);
    useOpencodeAgent.setState({
      currentSessionId: "test-session",
      status: "idle",
      startTask: startTask as typeof originalStartTask,
    });

    render(<MainAIChatShell />);

    fireEvent(
      window,
      new CustomEvent("lumina:attach-image", {
        detail: {
          data: "aW1hZ2UtYnl0ZXM=",
          mediaType: "image/png",
          preview: "data:image/png;base64,aW1hZ2UtYnl0ZXM=",
        },
      }),
    );

    await waitFor(() =>
      expect(screen.getByAltText("attached-image.png")).toBeTruthy(),
    );

    const { t } = useLocaleStore.getState();
    fireEvent.click(screen.getByTitle(t.ai.send));

    await waitFor(() => expect(startTask).toHaveBeenCalledTimes(1));
    const [_task, context] = startTask.mock.calls[0] as unknown as Parameters<
      typeof originalStartTask
    >;
    expect(context?.fileParts?.[0]).toMatchObject({
      type: "file",
      mime: "image/png",
      filename: "attached-image.png",
      url: "data:image/png;base64,aW1hZ2UtYnl0ZXM=",
    });
  });

  // Thinking-mode + effort selectors are not exposed in chat controls. The "+"
  // menu is: Reference file / Skills / AI settings.
  it("only renders Reference / Skills / Settings rows in the + popover", () => {
    useAIStore.setState((state) => ({
      config: {
        ...state.config,
        provider: "deepseek",
        model: "deepseek-chat",
      },
    }));

    render(<MainAIChatShell />);

    fireEvent.click(screen.getByTitle("More"));

    const { t } = useLocaleStore.getState();
    expect(screen.queryByText(t.aiSettings.thinkingMode)).toBeNull();
    expect(screen.queryByText(t.aiSettings.reasoningEffort)).toBeNull();
    expect(screen.getByText("Reference file")).toBeTruthy();
    expect(screen.getByText("Skills")).toBeTruthy();
    expect(screen.getByText(t.ai.aiChatSettings)).toBeTruthy();
  });

  it("renders the model chip in the input pill", () => {
    useAIStore.setState((state) => ({
      config: {
        ...state.config,
        provider: "openai",
        model: "gpt-5.5",
      },
    }));

    render(<MainAIChatShell />);

    const modelChip = document.querySelector('[data-chip="model"]');
    expect(modelChip).toBeTruthy();
    expect(modelChip?.textContent ?? "").toContain("GPT-5.5");
  });

  it("keeps the slash skill menu at menu width", async () => {
    render(<MainAIChatShell />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "/" } });

    await waitFor(() => {
      const menu = document.querySelector(
        "[data-skill-menu]",
      ) as HTMLElement | null;
      expect(menu).toBeTruthy();
      expect(menu?.style.width).toBe("360px");
      expect(menu?.className).toContain("max-w-[calc(100vw-16px)]");
    });
  });

  it("renders assistant thinking as collapsed block and expands on click", () => {
    // Main chat runs on opencode now. Messages carry structured rawParts
    // (text / reasoning / tool), so feed those directly — the renderer maps
    // them via timelineFromOpencodeParts rather than parsing <thinking> XML.
    useOpencodeAgent.setState({
      currentSessionId: "test-session",
      status: "completed",
      messages: [
        {
          id: "msg-user",
          role: "user",
          content: "hello",
          rawParts: [],
        },
        {
          id: "msg-assistant",
          role: "assistant",
          content: "final answer",
          rawParts: [
            {
              id: "part-reasoning",
              sessionID: "test-session",
              messageID: "msg-assistant",
              type: "reasoning",
              text: "step by step",
              time: { start: 1, end: 2 },
            } as never,
            {
              id: "part-text",
              sessionID: "test-session",
              messageID: "msg-assistant",
              type: "text",
              text: "final answer",
            } as never,
          ],
        },
      ],
    });

    render(<MainAIChatShell />);

    const { t } = useLocaleStore.getState();
    const workSessionToggle = screen.getByText(t.agentMessage.workCompleted);
    expect(screen.queryByText("step by step")).toBeNull();
    fireEvent.click(workSessionToggle);
    const thinkingToggle = screen.getByText(t.agentMessage.thinkingDone);
    expect(screen.queryByText("step by step")).toBeNull();
    fireEvent.click(thinkingToggle);
    expect(screen.getByText("step by step")).toBeTruthy();
    expect(screen.getByText("final answer")).toBeTruthy();
  });

  it("keeps the chat pinned to bottom when agent parts update without resize events", async () => {
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(performance.now());
        return 1;
      });
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined);

    try {
      useOpencodeAgent.setState({
        currentSessionId: "test-session",
        status: "running",
        messages: [
          {
            id: "msg-user",
            role: "user",
            content: "hello",
            rawParts: [],
          },
          {
            id: "msg-assistant",
            role: "assistant",
            content: "",
            rawParts: [
              {
                id: "part-reasoning",
                sessionID: "test-session",
                messageID: "msg-assistant",
                type: "reasoning",
                text: "thinking",
                time: { start: 1 },
              } as never,
            ],
          },
        ],
      });

      render(<MainAIChatShell />);

      const scrollContainer = document.querySelector(
        ".scrollbar-thin",
      ) as HTMLElement | null;
      expect(scrollContainer).toBeTruthy();

      let scrollHeight = 1000;
      Object.defineProperty(scrollContainer, "scrollHeight", {
        configurable: true,
        get: () => scrollHeight,
      });
      Object.defineProperty(scrollContainer, "clientHeight", {
        configurable: true,
        get: () => 500,
      });
      scrollContainer!.scrollTop = 500;

      scrollHeight = 1200;
      act(() => {
        useOpencodeAgent.setState({
          messages: [
            {
              id: "msg-user",
              role: "user",
              content: "hello",
              rawParts: [],
            },
            {
              id: "msg-assistant",
              role: "assistant",
              content: "",
              rawParts: [
                {
                  id: "part-reasoning",
                  sessionID: "test-session",
                  messageID: "msg-assistant",
                  type: "reasoning",
                  text: "thinking\nstill thinking",
                  time: { start: 1 },
                } as never,
              ],
            },
          ],
        });
      });

      await waitFor(() => expect(scrollContainer!.scrollTop).toBe(700));
    } finally {
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
  });

  it("scrolls to the bottom when switching sessions after the user scrolled up", async () => {
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(performance.now());
        return 1;
      });
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined);

    try {
      useOpencodeAgent.setState({
        currentSessionId: "session-a",
        status: "idle",
        messages: [
          {
            id: "session-a-user",
            role: "user",
            content: "old session",
            rawParts: [],
          },
        ],
      });

      render(<MainAIChatShell />);

      const scrollContainer = document.querySelector(
        ".scrollbar-thin",
      ) as HTMLElement | null;
      expect(scrollContainer).toBeTruthy();

      let scrollHeight = 1000;
      Object.defineProperty(scrollContainer, "scrollHeight", {
        configurable: true,
        get: () => scrollHeight,
      });
      Object.defineProperty(scrollContainer, "clientHeight", {
        configurable: true,
        get: () => 500,
      });

      scrollContainer!.scrollTop = 500;
      fireEvent.scroll(scrollContainer!);
      scrollContainer!.scrollTop = 300;
      fireEvent.scroll(scrollContainer!);

      scrollHeight = 1400;
      act(() => {
        useOpencodeAgent.setState({
          currentSessionId: "session-b",
          messages: [
            {
              id: "session-b-user",
              role: "user",
              content: "new session",
              rawParts: [],
            },
          ],
        });
      });

      await waitFor(() => expect(scrollContainer!.scrollTop).toBe(900));
    } finally {
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
  });

  it("sends a lumina prompt link through opencode when input is empty", async () => {
    const startTask = vi.fn(async () => undefined);
    useOpencodeAgent.setState({
      currentSessionId: "test-session",
      status: "idle",
      startTask: startTask as typeof originalStartTask,
      messages: [
        {
          id: "msg-user",
          role: "user",
          content: "hello",
          rawParts: [],
        },
        {
          id: "msg-assistant",
          role: "assistant",
          content: "[继续追问](lumina-prompt:)",
          rawParts: [
            {
              id: "part-text",
              sessionID: "test-session",
              messageID: "msg-assistant",
              type: "text",
              text: "[继续追问](lumina-prompt:)",
            } as never,
          ],
        },
      ],
    });

    render(<MainAIChatShell />);
    fireEvent.click(screen.getByText("继续追问"));

    await waitFor(() => expect(startTask).toHaveBeenCalledTimes(1));
    const [task, context] = startTask.mock.calls[0] as unknown as Parameters<
      typeof originalStartTask
    >;
    expect(task).toBe("继续追问");
    expect(context).toMatchObject({
      workspace_path: "/tmp",
      display_message: "继续追问",
    });
  });

  it("retries the failed send intent instead of the last rendered user message", async () => {
    const startTask = vi.fn(async () => undefined);
    useOpencodeAgent.setState({
      currentSessionId: "test-session",
      status: "idle",
      startTask: startTask as typeof originalStartTask,
      messages: [
        {
          id: "previous-user",
          role: "user",
          content: "previous prompt",
          rawParts: [],
        },
      ],
    });

    render(<MainAIChatShell />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "failed prompt" } });
    const { t } = useLocaleStore.getState();
    fireEvent.click(screen.getByTitle(t.ai.send));

    await waitFor(() => expect(startTask).toHaveBeenCalledTimes(1));
    useErrorBanner.setState({
      active: {
        id: "err-1",
        kind: "task.start",
        severity: "blocker",
        message: "send failed",
        retryable: true,
        timestamp: Date.now(),
      },
    });

    fireEvent.click(await screen.findByText(t.agentMessage.errors.retry));

    await waitFor(() => expect(startTask).toHaveBeenCalledTimes(2));
    const retryCalls = startTask.mock.calls as unknown as Parameters<
      typeof originalStartTask
    >[];
    expect(retryCalls[1]?.[0]).toBe("failed prompt");
  });

  it("queues sends while the agent is running and dispatches them after idle", async () => {
    const startTask = vi.fn(async () => undefined);
    useOpencodeAgent.setState({
      currentSessionId: "test-session",
      status: "running",
      startTask: startTask as typeof originalStartTask,
      messages: [
        {
          id: "current-user",
          role: "user",
          content: "current prompt",
          rawParts: [],
        },
      ],
    });

    render(<MainAIChatShell />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "queued prompt" } });
    const { t } = useLocaleStore.getState();
    fireEvent.click(screen.getByTitle(t.ai.sendToQueue));

    expect(startTask).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByText((content) =>
          content.includes("#1") && content.includes("queued prompt"),
        ),
      ).toBeTruthy(),
    );

    act(() => {
      useOpencodeAgent.setState({ status: "idle" });
    });

    await waitFor(() => expect(startTask).toHaveBeenCalledTimes(1));
    const queuedCalls = startTask.mock.calls as unknown as Parameters<
      typeof originalStartTask
    >[];
    expect(queuedCalls[0]?.[0]).toBe("queued prompt");
    await waitFor(() =>
      expect(
        screen.queryByText((content) =>
          content.includes("#1") && content.includes("queued prompt"),
        ),
      ).toBeNull(),
    );
  });

  it("appends a lumina prompt link to existing draft instead of sending", () => {
    const startTask = vi.fn(async () => undefined);
    useOpencodeAgent.setState({
      currentSessionId: "test-session",
      status: "idle",
      startTask: startTask as typeof originalStartTask,
      messages: [
        {
          id: "msg-user",
          role: "user",
          content: "hello",
          rawParts: [],
        },
        {
          id: "msg-assistant",
          role: "assistant",
          content: "[继续追问](lumina-prompt:)",
          rawParts: [
            {
              id: "part-text",
              sessionID: "test-session",
              messageID: "msg-assistant",
              type: "text",
              text: "[继续追问](lumina-prompt:)",
            } as never,
          ],
        },
      ],
    });

    render(<MainAIChatShell />);
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "已有草稿" } });
    fireEvent.click(screen.getByText("继续追问"));

    expect(startTask).not.toHaveBeenCalled();
    expect(input.value).toBe("已有草稿\n\n继续追问");
  });
});
