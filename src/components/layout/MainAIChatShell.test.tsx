import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MainAIChatShell } from "./MainAIChatShell";
import { useUIStore } from "@/stores/useUIStore";
import { useFileStore } from "@/stores/useFileStore";
import { useAIStore } from "@/stores/useAIStore";
import { useRustAgentStore } from "@/stores/useRustAgentStore";
import { useLocaleStore } from "@/stores/useLocaleStore";

describe("MainAIChatShell", () => {
  beforeEach(() => {
    useUIStore.setState({ chatMode: "agent" });
    useFileStore.setState({ vaultPath: "/tmp" });
    useAIStore.setState({ pendingInputAppends: [] });
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
    useRustAgentStore.setState({
      messages: [
        { role: "user", content: "hello" },
        {
          role: "assistant",
          content: "<thinking>step by step</thinking>\n\nfinal answer",
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
