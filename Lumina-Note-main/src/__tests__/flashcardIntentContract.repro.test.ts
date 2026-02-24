// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("flashcard intent contract regression", () => {
  it("keeps frontend/backend intent enums aligned for flashcard", () => {
    const root = process.cwd();
    const tsIntentPath = path.join(root, "src/services/llm/types.ts");
    const rustIntentPath = path.join(root, "src-tauri/src/agent/types.rs");

    const tsIntent = fs.readFileSync(tsIntentPath, "utf8");
    const rustIntent = fs.readFileSync(rustIntentPath, "utf8");

    expect(tsIntent).toContain('"flashcard"');
    expect(rustIntent).toContain("pub enum TaskIntent");
    expect(rustIntent).toContain("Flashcard");
  });
});
