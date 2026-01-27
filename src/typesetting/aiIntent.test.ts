import { describe, expect, it } from "vitest";
import { applyAiPromptToStyles } from "./aiIntent";
import { defaultAiInstruction } from "./aiPromptParser";
import { TypesettingStyleConfig } from "./aiStyleMapper";

const defaultBaseStyles = (): TypesettingStyleConfig => ({
  page: {
    ...defaultAiInstruction.page,
    footerHeight: defaultAiInstruction.page.footerHeight ?? "12mm",
  },
  typography: {
    zh: { ...defaultAiInstruction.typography.zh },
    en: { ...defaultAiInstruction.typography.en },
  },
  paragraph: { ...defaultAiInstruction.paragraph },
});

describe("applyAiPromptToStyles", () => {
  it("parses the prompt and returns merged styles", () => {
    const base = defaultBaseStyles();
    const prompt =
      "Use A4 margin 30mm header 10mm footer 8mm. " +
      "Chinese font Source Han Serif 11pt. English font Times New Roman 10pt. " +
      "line height 1.6 first-line indent 2em justify.";

    const result = applyAiPromptToStyles(prompt, base);

    expect(result.instruction.page.margin).toBe("30mm");
    expect(result.styles.page.margin).toBe("30mm");
    expect(result.styles.page.footerHeight).toBe("8mm");
    expect(result.styles.typography.zh.font).toBe("Source Han Serif");
    expect(result.styles.typography.en.size).toBe("10pt");
    expect(result.styles.paragraph.lineHeight).toBe(1.6);
    expect(result.styles.paragraph.align).toBe("justify");
  });

  it("returns defaults when the prompt is empty", () => {
    const base = defaultBaseStyles();

    const result = applyAiPromptToStyles("", base);

    expect(result.instruction).toEqual(defaultAiInstruction);
    expect(result.styles).toEqual(base);
  });
});
