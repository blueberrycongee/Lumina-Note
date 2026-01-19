import { describe, expect, it } from "vitest";
import { TypesettingAiInstruction } from "./aiSchema";
import { applyAiInstructionToStyles, TypesettingStyleConfig } from "./aiStyleMapper";

describe("applyAiInstructionToStyles", () => {
  it("overrides fields while preserving base footerHeight when missing", () => {
    const base: TypesettingStyleConfig = {
      page: {
        size: "A4",
        margin: "25mm",
        headerHeight: "12mm",
        footerHeight: "8mm",
      },
      typography: {
        zh: { font: "SimSun", size: "12pt" },
        en: { font: "Times New Roman", size: "12pt" },
      },
      paragraph: {
        lineHeight: 1.5,
        indent: "2em",
        align: "justify",
      },
    };

    const instruction: TypesettingAiInstruction = {
      page: {
        size: "Letter",
        margin: "30mm",
        headerHeight: "10mm",
      },
      typography: {
        zh: { font: "Source Han Serif", size: "11pt" },
        en: { font: "Times New Roman", size: "12pt" },
      },
      paragraph: {
        lineHeight: 1.6,
        indent: "1.5em",
        align: "left",
      },
    };

    const result = applyAiInstructionToStyles(base, instruction);

    expect(result.page.size).toBe("Letter");
    expect(result.page.margin).toBe("30mm");
    expect(result.page.headerHeight).toBe("10mm");
    expect(result.page.footerHeight).toBe("8mm");
    expect(result.typography.zh.font).toBe("Source Han Serif");
    expect(result.paragraph.align).toBe("left");
  });

  it("does not mutate the base styles", () => {
    const base: TypesettingStyleConfig = {
      page: {
        size: "A4",
        margin: "25mm",
        headerHeight: "12mm",
        footerHeight: "12mm",
      },
      typography: {
        zh: { font: "SimSun", size: "12pt" },
        en: { font: "Times New Roman", size: "12pt" },
      },
      paragraph: {
        lineHeight: 1.5,
        indent: "2em",
        align: "justify",
      },
    };
    const snapshot = JSON.parse(JSON.stringify(base)) as TypesettingStyleConfig;

    const instruction: TypesettingAiInstruction = {
      page: {
        size: "Letter",
        margin: "20mm",
        headerHeight: "9mm",
        footerHeight: "9mm",
      },
      typography: {
        zh: { font: "SimSun", size: "10pt" },
        en: { font: "Times New Roman", size: "10pt" },
      },
      paragraph: {
        lineHeight: 1.4,
        indent: "1em",
        align: "right",
      },
    };

    const result = applyAiInstructionToStyles(base, instruction);

    expect(base).toEqual(snapshot);
    expect(result).not.toBe(base);
  });
});
