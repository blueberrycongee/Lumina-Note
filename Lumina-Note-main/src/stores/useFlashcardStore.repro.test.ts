import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fsPlugin from "@tauri-apps/plugin-fs";
import * as pathApi from "@tauri-apps/api/path";
import * as tauriLib from "@/lib/tauri";
import { useFileStore } from "@/stores/useFileStore";
import { useFlashcardStore } from "./useFlashcardStore";
import type { Flashcard } from "@/types/flashcard";

function resetStores() {
  useFileStore.setState({
    vaultPath: "/vault",
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

const basicCardMarkdown = `---
db: "flashcards"
type: "basic"
deck: "Default"
front: "Q"
back: "A"
---

## 问：Q
A`;

describe("useFlashcardStore regression", () => {
  const readDirMock = vi.mocked(fsPlugin.readDir);
  const readTextFileMock = vi.mocked(fsPlugin.readTextFile);
  const joinMock = vi.mocked(pathApi.join);

  beforeEach(() => {
    resetStores();
    joinMock.mockImplementation(async (...parts: string[]) => parts.join("/"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads nested markdown cards from Flashcards subfolders", async () => {
    readDirMock.mockImplementation(async (targetPath: string | URL) => {
      const pathString = String(targetPath);
      if (pathString.endsWith("/Flashcards")) {
        return [{ name: "Topic", isDirectory: true } as never];
      }
      return [{ name: "nested.md", isDirectory: false } as never];
    });
    readTextFileMock.mockResolvedValue(basicCardMarkdown);

    await useFlashcardStore.getState().loadCards();

    expect(useFlashcardStore.getState().cards.size).toBe(1);
    expect(useFlashcardStore.getState().cards.has("Flashcards/Topic/nested.md")).toBe(true);
  });

  it("surfaces parse failures while still loading healthy cards", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    readDirMock.mockResolvedValue([
      { name: "broken.md", isDirectory: false } as never,
      { name: "ok.md", isDirectory: false } as never,
    ]);

    readTextFileMock.mockImplementation(async (filePath: string | URL) => {
      if (String(filePath).endsWith("broken.md")) {
        throw new Error("mock read failed");
      }
      return basicCardMarkdown;
    });

    await useFlashcardStore.getState().loadCards();

    expect(useFlashcardStore.getState().error).toBeTruthy();
    expect(useFlashcardStore.getState().cards.size).toBe(1);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("preserves cloze multiline text after load + review update", async () => {
    const saveFileSpy = vi.spyOn(tauriLib, "saveFile").mockResolvedValue(undefined);
    const clozeMarkdown = `---
db: "flashcards"
type: "cloze"
deck: "Default"
text: |
  The capital of France is {{c1::Paris}}.
  The Seine runs through it.
---

## 填空

The capital of France is {{c1::Paris}}.`;

    readDirMock.mockResolvedValue([{ name: "cloze.md", isDirectory: false } as never]);
    readTextFileMock.mockResolvedValue(clozeMarkdown);

    await useFlashcardStore.getState().loadCards();

    const notePath = "Flashcards/cloze.md";
    const loaded = useFlashcardStore.getState().cards.get(notePath);
    expect(loaded).toBeTruthy();
    expect(loaded?.text).toContain("{{c1::Paris}}");
    expect(loaded?.text).toContain("The Seine runs through it.");

    await useFlashcardStore.getState().updateCard(notePath, { ease: 2.6 });

    expect(saveFileSpy).toHaveBeenCalledTimes(1);
    const writtenContent = saveFileSpy.mock.calls[0][1];
    expect(writtenContent).toContain("{{c1::Paris}}");
    expect(writtenContent).toContain("The Seine runs through it.");
  });

  it("allows ahead review when deck has no due cards", () => {
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
      currentSession: null,
      error: null,
    });

    const dueOnly = useFlashcardStore.getState().startReview("Default");
    expect(dueOnly).toBe(false);

    const ahead = useFlashcardStore.getState().startReview("Default", { allowAhead: true });
    expect(ahead).toBe(true);
    expect(useFlashcardStore.getState().currentSession?.cards.length).toBe(1);
    expect(useFlashcardStore.getState().currentSession?.cards[0]?.notePath).toBe("Flashcards/future.md");
  });
});
