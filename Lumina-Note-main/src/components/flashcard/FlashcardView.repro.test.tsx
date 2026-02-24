import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlashcardView } from "./FlashcardView";
import { useFlashcardStore } from "@/stores/useFlashcardStore";
import { useFileStore } from "@/stores/useFileStore";

let originalLoadCards: (() => Promise<void>) | null = null;

function resetStores() {
  useFileStore.setState({
    fileTree: [],
  });

  useFlashcardStore.setState({
    cards: new Map(),
    decks: [],
    currentSession: null,
    lastReviewSummary: null,
    isLoading: false,
    error: null,
  });
}

describe("FlashcardView regression", () => {
  beforeEach(() => {
    resetStores();
    originalLoadCards = useFlashcardStore.getState().loadCards;
  });

  afterEach(() => {
    if (originalLoadCards) {
      useFlashcardStore.setState({ loadCards: originalLoadCards });
    }
  });

  it("renders store errors in flashcard main view", async () => {
    useFlashcardStore.setState({
      error: "加载失败：mock",
      loadCards: vi.fn(async () => undefined),
    });

    render(<FlashcardView />);

    expect(await screen.findByText("加载失败：mock")).toBeInTheDocument();
  });
});
