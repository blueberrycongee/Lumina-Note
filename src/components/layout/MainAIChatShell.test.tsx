import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MainAIChatShell } from "./MainAIChatShell";
import { useUIStore } from "@/stores/useUIStore";
import { useFileStore } from "@/stores/useFileStore";
import { useCodexPanelDockStore } from "@/stores/useCodexPanelDock";

describe("MainAIChatShell", () => {
  beforeEach(() => {
    useUIStore.setState({ chatMode: "chat" });
    useFileStore.setState({ vaultPath: "/tmp" });
    useCodexPanelDockStore.setState({ targets: {} });
  });

  it("renders Codex slot and hides chat input when in codex mode", () => {
    useUIStore.setState({ chatMode: "codex" });

    const { container, queryByRole } = render(<MainAIChatShell />);

    expect(container.querySelector('[data-codex-slot="main"]')).toBeTruthy();
    expect(queryByRole("textbox")).toBeNull();
  });

  it("does not render Codex slot in chat mode", () => {
    useUIStore.setState({ chatMode: "chat" });

    const { container } = render(<MainAIChatShell />);

    expect(container.querySelector('[data-codex-slot="main"]')).toBeNull();
  });

  it("appends text into input when receiving ai-input-append event", () => {
    useUIStore.setState({ chatMode: "chat" });
    render(<MainAIChatShell />);

    fireEvent(window, new CustomEvent("ai-input-append", { detail: { text: "Quoted from PDF" } }));

    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(input.value).toContain("Quoted from PDF");
  });
});
