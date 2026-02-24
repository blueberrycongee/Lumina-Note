// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("flashcard router prompt wiring regression", () => {
  it("wires router prompt into flashcard intent system prompt branch", () => {
    const aiServicePath = path.join(process.cwd(), "src/services/ai/ai.ts");
    const content = fs.readFileSync(aiServicePath, "utf8");

    expect(content).toContain("const chatPrompt = t.prompts.chat");
    expect(content).toContain("const editPrompt = t.prompts.edit");
    expect(content).toContain("const routerPrompt = t.prompts.router");
    expect(content).toContain('if (intent === "flashcard")');
  });
});
