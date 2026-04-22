import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MainAIChatShell } from "./MainAIChatShell";
import { useUIStore } from "@/stores/useUIStore";
import { useFileStore } from "@/stores/useFileStore";
import { useAIStore } from "@/stores/useAIStore";
import { useOpencodeAgent } from "@/stores/useOpencodeAgent";
import { useLocaleStore } from "@/stores/useLocaleStore";

describe("MainAIChatShell", () => {
  beforeEach(() => {
    useUIStore.setState({ chatMode: "agent" });
    useFileStore.setState({ vaultPath: "/tmp" });
    useAIStore.setState({ pendingInputAppends: [] });
    useOpencodeAgent.setState({ messages: [], status: "idle" });
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

  it("renders thinking mode selector in plus menu for supported models", () => {
    useAIStore.setState((state) => ({
      config: {
        ...state.config,
        provider: "deepseek",
        model: "deepseek-chat",
        thinkingMode: "auto",
      },
    }));

    render(<MainAIChatShell />);

    // Thinking mode is inside the "+" menu — click to open
    fireEvent.click(screen.getByTitle("More"));

    const { t } = useLocaleStore.getState();
    expect(screen.getByText(t.aiSettings.thinkingMode)).toBeTruthy();
    const selector = screen.getByRole("combobox");
    fireEvent.change(selector, { target: { value: "instant" } });
    expect(useAIStore.getState().config.thinkingMode).toBe("instant");
  });

  it("hides thinking mode in plus menu for unsupported models", () => {
    useAIStore.setState((state) => ({
      config: {
        ...state.config,
        provider: "deepseek",
        model: "gpt-5.4",
        thinkingMode: "auto",
      },
    }));

    render(<MainAIChatShell />);

    // Open plus menu
    fireEvent.click(screen.getByTitle("More"));

    const { t } = useLocaleStore.getState();
    expect(screen.queryByText(t.aiSettings.thinkingMode)).toBeNull();
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
});
