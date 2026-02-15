import React from "react";
import { createRoot } from "react-dom/client";
import { FlashcardReview } from "@/components/flashcard/FlashcardReview";
import { useFlashcardStore } from "@/stores/useFlashcardStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import type { Flashcard } from "@/types/flashcard";

const params = new URLSearchParams(window.location.search);
const scenario = params.get("scenario") || "no-due";

useLocaleStore.setState({ locale: "zh-CN" });

const baseCard: Flashcard = {
  id: "Flashcards/repro-card.md",
  notePath: "Flashcards/repro-card.md",
  type: "basic",
  deck: "Default",
  front: "Question",
  back: "Answer",
  ease: 2.5,
  interval: 10,
  repetitions: 2,
  due: "2026-01-30",
  created: "2026-01-30",
};

if (scenario === "negative-interval") {
  useFlashcardStore.setState({
    cards: new Map([[baseCard.notePath, baseCard]]),
    error: null,
    currentSession: {
      deckId: "Default",
      cards: [baseCard],
      currentIndex: 0,
      startTime: new Date().toISOString(),
      reviewed: 0,
      correct: 0,
      incorrect: 0,
    },
  });
} else {
  useFlashcardStore.setState({
    cards: new Map(),
    currentSession: null,
    error: null,
  });
}

const root = createRoot(document.getElementById("root")!);
root.render(
  React.createElement(
    "div",
    { style: { width: "100vw", height: "100vh" } },
    React.createElement(FlashcardReview, { deckId: "Default" }),
  ),
);
