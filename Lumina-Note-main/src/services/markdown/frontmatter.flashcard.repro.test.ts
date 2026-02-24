import { describe, expect, it } from "vitest";
import { parseFrontmatter, updateFrontmatter } from "./frontmatter";

describe("flashcard frontmatter regression", () => {
  it("preserves multiline block payload while adding noteId", () => {
    const original = `---
db: "flashcards"
type: "cloze"
deck: "Default"
text: |
  The capital of France is {{c1::Paris}}.
  The Seine runs through it.
---

## 填空

The capital of France is {{c1::Paris}}.`;

    const rewritten = updateFrontmatter(original, { noteId: "note-123" });
    const parsed = parseFrontmatter(rewritten);

    expect(parsed.frontmatter.noteId).toBe("note-123");
    expect(rewritten).toContain("The Seine runs through it.");
    expect(rewritten).toContain("text: |");
  });
});
