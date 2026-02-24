import { describe, it, expect } from "vitest";
import { parseAiPromptToSchema, defaultAiInstruction } from "./aiPromptParser";

describe("parseAiPromptToSchema", () => {
  it("parses common English prompt hints into schema", () => {
    const prompt =
      "Use A4 page, margin 25mm, header 12mm, footer 12mm, Chinese font SimSun 12pt, English font Times New Roman 12pt, line height 1.5, first-line indent 2 characters, justify.";

    const result = parseAiPromptToSchema(prompt);

    expect(result.page.size).toBe("A4");
    expect(result.page.margin).toBe("25mm");
    expect(result.page.headerHeight).toBe("12mm");
    expect(result.page.footerHeight).toBe("12mm");
    expect(result.typography.zh.font).toBe("SimSun");
    expect(result.typography.en.font).toBe("Times New Roman");
    expect(result.typography.zh.size).toBe("12pt");
    expect(result.typography.en.size).toBe("12pt");
    expect(result.paragraph.lineHeight).toBe(1.5);
    expect(result.paragraph.indent).toBe("2em");
    expect(result.paragraph.align).toBe("justify");
  });

  it("fills defaults when only a subset of hints are present", () => {
    const prompt = "Use Letter page, margin 1in, header 0.5in, line height 1.2, center.";

    const result = parseAiPromptToSchema(prompt);

    expect(result.page.size).toBe("Letter");
    expect(result.page.margin).toBe("1in");
    expect(result.page.headerHeight).toBe("0.5in");
    expect(result.page.footerHeight).toBe(defaultAiInstruction.page.footerHeight);
    expect(result.typography).toEqual(defaultAiInstruction.typography);
    expect(result.paragraph.lineHeight).toBe(1.2);
    expect(result.paragraph.indent).toBe(defaultAiInstruction.paragraph.indent);
    expect(result.paragraph.align).toBe("center");
  });

  it("parses hyphenated line-height and mixed indent units", () => {
    const prompt =
      "Use A4 page, line-height 1.4, first-line indent 18pt, left.";

    const result = parseAiPromptToSchema(prompt);

    expect(result.paragraph.lineHeight).toBe(1.4);
    expect(result.paragraph.indent).toBe("18pt");
    expect(result.paragraph.align).toBe("left");
  });
});
