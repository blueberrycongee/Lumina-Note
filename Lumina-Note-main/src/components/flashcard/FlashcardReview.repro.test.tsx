import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlashcardReview } from "./FlashcardReview";
import { useFlashcardStore } from "@/stores/useFlashcardStore";
import { useFileStore } from "@/stores/useFileStore";
import type { Flashcard } from "@/types/flashcard";

vi.mock("framer-motion", async () => {
  const ReactModule = await import("react");
  const MotionDiv = ReactModule.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    function MotionDiv(props, ref) {
      return <div ref={ref} {...props} />;
    },
  );
  return {
    motion: {
      div: MotionDiv,
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

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

describe("FlashcardReview regression", () => {
  const RealDate = Date;

  beforeEach(() => {
    resetFlashcardStore();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.stubGlobal("Date", RealDate);
  });

  it("shows no-cards message instead of fake completion when no due cards", async () => {
    render(<FlashcardReview deckId="Default" />);

    await screen.findByText("没有待复习的卡片");

    await waitFor(() => {
      expect(useFlashcardStore.getState().error).toBe("没有待复习的卡片");
    });

    expect(screen.queryByText("复习完成！")).not.toBeInTheDocument();
  });

  it("interval preview never displays negative days across month boundaries", async () => {
    class MockDate extends RealDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super("2026-01-30T10:00:00.000Z");
          return;
        }
        super(args[0]);
      }

      static now() {
        return new RealDate("2026-01-30T10:00:00.000Z").getTime();
      }
    }
    vi.stubGlobal("Date", MockDate as unknown as DateConstructor);

    const card: Flashcard = {
      id: "Flashcards/repro-basic.md",
      notePath: "Flashcards/repro-basic.md",
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

    useFlashcardStore.setState({
      cards: new Map([[card.notePath, card]]),
      currentSession: {
        deckId: "Default",
        cards: [card],
        currentIndex: 0,
        startTime: new Date().toISOString(),
        reviewed: 0,
        correct: 0,
        incorrect: 0,
      },
      error: null,
    });

    render(<FlashcardReview />);

    fireEvent.click(screen.getByText("Question"));

    await screen.findByText("困难");
    expect(screen.queryByText(/-\d+天/)).not.toBeInTheDocument();
  });

  it("shows reviewed statistics after completing the last card", async () => {
    const card: Flashcard = {
      id: "Flashcards/repro-finish.md",
      notePath: "Flashcards/repro-finish.md",
      type: "basic",
      deck: "Default",
      front: "Final Question",
      back: "Final Answer",
      ease: 2.5,
      interval: 0,
      repetitions: 0,
      due: "2026-01-30",
      created: "2026-01-30",
    };

    useFileStore.setState({ vaultPath: "/vault" });
    useFlashcardStore.setState({
      cards: new Map([[card.notePath, card]]),
      currentSession: {
        deckId: "Default",
        cards: [card],
        currentIndex: 0,
        startTime: new Date().toISOString(),
        reviewed: 0,
        correct: 0,
        incorrect: 0,
      },
      error: null,
    });

    render(<FlashcardReview />);

    fireEvent.click(screen.getByText("Final Question"));
    await screen.findByText("良好");
    fireEvent.click(screen.getByText("良好"));

    await screen.findByText("复习完成！");
    expect(screen.getByText(/已复习 1 张卡片/)).toBeInTheDocument();
    expect(screen.getByText(/正确率 100%/)).toBeInTheDocument();
  });

  it("renders KaTeX content for math formulas in flashcards", async () => {
    const card: Flashcard = {
      id: "Flashcards/math.md",
      notePath: "Flashcards/math.md",
      type: "basic",
      deck: "Default",
      front: "求导：$x^2$",
      back: "答案：$2x$",
      ease: 2.5,
      interval: 0,
      repetitions: 0,
      due: "2026-01-30",
      created: "2026-01-30",
    };

    useFlashcardStore.setState({
      cards: new Map([[card.notePath, card]]),
      currentSession: {
        deckId: "Default",
        cards: [card],
        currentIndex: 0,
        startTime: new Date().toISOString(),
        reviewed: 0,
        correct: 0,
        incorrect: 0,
      },
      error: null,
    });

    const { container } = render(<FlashcardReview />);
    await screen.findByText(/求导/);
    expect(container.querySelector(".katex")).toBeTruthy();

    const flipTarget = container.querySelector(".perspective-1000");
    expect(flipTarget).toBeTruthy();
    fireEvent.click(flipTarget as Element);
    await screen.findByText(/答案/);
    expect(container.querySelectorAll(".katex").length).toBeGreaterThan(0);
  });
});
