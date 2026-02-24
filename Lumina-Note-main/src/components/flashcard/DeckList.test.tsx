import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeckList } from "./DeckList";
import { useFlashcardStore } from "@/stores/useFlashcardStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import type { Flashcard } from "@/types/flashcard";

function resetFlashcardStore() {
  useFlashcardStore.setState({
    cards: new Map(),
    decks: [],
    currentSession: null,
    lastReviewSummary: null,
    isLoading: false,
    error: null,
  });
}

describe("DeckList review actions", () => {
  beforeEach(() => {
    resetFlashcardStore();
    useLocaleStore.getState().setLocale("zh-CN");
  });

  it("offers ahead review when there are cards but none are due", () => {
    const futureCard: Flashcard = {
      id: "Flashcards/future.md",
      notePath: "Flashcards/future.md",
      type: "basic",
      deck: "Default",
      front: "Future Q",
      back: "Future A",
      ease: 2.5,
      interval: 7,
      repetitions: 2,
      due: "2099-01-01",
      created: "2026-02-15",
    };

    useFlashcardStore.setState({
      cards: new Map([[futureCard.notePath, futureCard]]),
    });

    const onStartReview = vi.fn();
    render(<DeckList onStartReview={onStartReview} onCreateCard={vi.fn()} />);

    fireEvent.click(screen.getByText("提前复习全部"));
    expect(onStartReview).toHaveBeenCalledWith("all", true);

    fireEvent.click(screen.getByTitle("提前复习"));
    expect(onStartReview).toHaveBeenCalledWith("Default", true);
  });
});
