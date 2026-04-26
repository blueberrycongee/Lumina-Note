import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MainAIChatShell } from "./MainAIChatShell";
import { useFileStore } from "@/stores/useFileStore";
import { useAIStore } from "@/stores/useAIStore";
import { useOpencodeAgent } from "@/stores/useOpencodeAgent";
import { useLocaleStore } from "@/stores/useLocaleStore";

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

  // Thinking-mode + effort selectors moved out of the "+" menu in W3 — they
  // now live in the ModelEffortPicker chip beside the send button. The "+"
  // menu is back to: Reference file / Skills / AI settings.
  it("only renders Reference / Skills / Settings rows in the + popover", () => {
    useAIStore.setState((state) => ({
      config: {
        ...state.config,
        provider: "deepseek",
        model: "deepseek-chat",
        thinkingMode: "auto",
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
    const thinkingToggle = screen.getByText(t.agentMessage.thinkingDone);
    expect(screen.queryByText("step by step")).toBeNull();
    fireEvent.click(thinkingToggle);
    expect(screen.getByText("step by step")).toBeTruthy();
    expect(screen.getByText("final answer")).toBeTruthy();
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
