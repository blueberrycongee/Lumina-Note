import { describe, it, expect } from "vitest";
import { typesettingAiSchema } from "./aiSchema";

const validSpec = {
  page: {
    size: "A4",
    margin: "25mm",
    headerHeight: "12mm",
  },
  typography: {
    zh: { font: "SimSun", size: "12pt" },
    en: { font: "Times New Roman", size: "12pt" },
  },
  paragraph: {
    lineHeight: 1.6,
    indent: "2em",
    align: "justify",
  },
};

describe("typesettingAiSchema", () => {
  it("accepts the baseline AI typesetting payload", () => {
    const result = typesettingAiSchema.safeParse(validSpec);
    expect(result.success).toBe(true);
  });

  it("rejects missing units in lengths", () => {
    const result = typesettingAiSchema.safeParse({
      ...validSpec,
      page: {
        ...validSpec.page,
        margin: "25",
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects unsupported paragraph alignment", () => {
    const result = typesettingAiSchema.safeParse({
      ...validSpec,
      paragraph: {
        ...validSpec.paragraph,
        align: "middle",
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-positive line height", () => {
    const result = typesettingAiSchema.safeParse({
      ...validSpec,
      paragraph: {
        ...validSpec.paragraph,
        lineHeight: 0,
      },
    });
    expect(result.success).toBe(false);
  });
});
