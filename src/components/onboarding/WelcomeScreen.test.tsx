import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WelcomeScreen } from "./WelcomeScreen";

const macTopChromeEnabled = vi.hoisted(() => ({ value: false }));

vi.mock("@/components/layout/TitleBar", () => ({
  TitleBar: () => <div data-testid="titlebar" />,
}));

vi.mock("@/components/layout/LanguageSwitcher", () => ({
  LanguageSwitcher: ({ className, compact, showLabel }: { className?: string; compact?: boolean; showLabel?: boolean }) => (
    <div
      data-testid="language-switcher"
      data-classname={className || ""}
      data-compact={compact ? "true" : "false"}
      data-show-label={showLabel ? "true" : "false"}
    >
      Language Switcher
    </div>
  ),
}));

vi.mock("@/components/layout/MacTopChrome", () => ({
  useMacTopChromeEnabled: () => macTopChromeEnabled.value,
}));

vi.mock("@/stores/useLocaleStore", () => ({
  useLocaleStore: () => ({
    t: {
      welcome: {
        title: "Welcome",
        subtitle: "Pick a folder",
        openFolder: "Open Folder",
        selectFolder: "Choose a folder to continue",
        featureMarkdown: "Markdown Native",
        featureMarkdownDesc: "Write in pure Markdown with live preview",
        featureAI: "AI Powered",
        featureAIDesc: "Chat, search, and agent workflows with AI",
        featureLocal: "Local First",
        featureLocalDesc: "Your notes stay on your device",
      },
    },
  }),
}));

describe("WelcomeScreen", () => {
  beforeEach(() => {
    macTopChromeEnabled.value = false;
  });

  it("keeps the legacy floating language switcher outside macOS overlay mode", () => {
    render(<WelcomeScreen onOpenVault={vi.fn()} />);

    expect(screen.getByTestId("language-switcher")).toHaveAttribute("data-classname", "absolute top-4 right-4 z-10");
  });

  it("renders the language switcher inside a real macOS top row", () => {
    macTopChromeEnabled.value = true;

    const { container } = render(<WelcomeScreen onOpenVault={vi.fn()} />);

    expect(screen.getByTestId("language-switcher")).toHaveAttribute("data-classname", "");
    expect(screen.getByTestId("language-switcher")).toHaveAttribute("data-compact", "true");
    expect(screen.getByTestId("language-switcher")).toHaveAttribute("data-show-label", "false");
    expect(screen.getByTestId("welcome-top-row")).toBeInTheDocument();
    expect(container.querySelector('.h-10[data-tauri-drag-region]')).toBeNull();
  });

  it("renders all three feature highlights", () => {
    render(<WelcomeScreen onOpenVault={vi.fn()} />);

    expect(screen.getByText("Markdown Native")).toBeInTheDocument();
    expect(screen.getByText("AI Powered")).toBeInTheDocument();
    expect(screen.getByText("Local First")).toBeInTheDocument();

    expect(screen.getByText("Write in pure Markdown with live preview")).toBeInTheDocument();
    expect(screen.getByText("Chat, search, and agent workflows with AI")).toBeInTheDocument();
    expect(screen.getByText("Your notes stay on your device")).toBeInTheDocument();
  });
});
