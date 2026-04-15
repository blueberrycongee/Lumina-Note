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

  it("hides chat input when in codex mode", () => {
    useUIStore.setState({ chatMode: "codex" });

    const { queryByRole } = render(<MainAIChatShell />);

    expect(queryByRole("textbox")).toBeNull();
  });

  it("appends text into input when receiving ai-input-append event", () => {
    useUIStore.setState({ chatMode: "agent" });
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
    useUIStore.setState({ chatMode: "agent" });
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
    useUIStore.setState({ chatMode: "agent" });
    useAIStore.getState().enqueueInputAppend("Queued from PDF");
    render(<MainAIChatShell />);

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(input.value).toContain("Queued from PDF");
    expect(useAIStore.getState().pendingInputAppends).toHaveLength(0);
  });

  it("renders thinking mode selector in chat composer for supported models", () => {
    useUIStore.setState({ chatMode: "agent" });
    useAIStore.setState((state) => ({
      config: {
        ...state.config,
        provider: "moonshot",
        model: "kimi-k2.5",
        thinkingMode: "auto",
      },
    }));

    render(<MainAIChatShell />);

    const { t } = useLocaleStore.getState();
    expect(screen.getByText(t.aiSettings.thinkingMode)).toBeTruthy();
    const selector = screen.getByRole("combobox");
    fireEvent.change(selector, { target: { value: "instant" } });
    expect(useAIStore.getState().config.thinkingMode).toBe("instant");
  });

  it("hides thinking mode selector in chat composer for unsupported models", () => {
    useUIStore.setState({ chatMode: "agent" });
    useAIStore.setState((state) => ({
      config: {
        ...state.config,
        provider: "openai",
        model: "gpt-5.2",
        thinkingMode: "auto",
      },
    }));

    render(<MainAIChatShell />);

    const { t } = useLocaleStore.getState();
    expect(screen.queryByText(t.aiSettings.thinkingMode)).toBeNull();
  });

  it("renders assistant thinking as collapsed block and expands on click", () => {
    useUIStore.setState({ chatMode: "agent" });
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
