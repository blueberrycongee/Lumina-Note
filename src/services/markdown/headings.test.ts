import { describe, expect, it } from "vitest";

import { extractMarkdownHeadings } from "./headings";

describe("extractMarkdownHeadings", () => {
  it("extracts ATX headings with level, line, and source position", () => {
    const content = "# Title\n\n## Section";

    expect(extractMarkdownHeadings(content)).toEqual([
      { level: 1, text: "Title", line: 1, from: 0, to: 7 },
      { level: 2, text: "Section", line: 3, from: 9, to: 19 },
    ]);
  });

  it("ignores heading-like text inside fenced code blocks", () => {
    const content = "```md\n# fake heading\n```\n\n# real heading";

    expect(extractMarkdownHeadings(content)).toEqual([
      { level: 1, text: "real heading", line: 5, from: 26, to: 40 },
    ]);
  });

  it("extracts setext headings and keeps the first content line as the anchor line", () => {
    const content = "Title line\n=========\n\nSub title\n---------";

    expect(extractMarkdownHeadings(content)).toEqual([
      { level: 1, text: "Title line", line: 1, from: 0, to: 20 },
      { level: 2, text: "Sub title", line: 4, from: 22, to: 41 },
    ]);
  });

  it("normalizes ATX headings with leading spaces and closing hashes", () => {
    const content = "   ### Spaced title ###\n";

    expect(extractMarkdownHeadings(content)).toEqual([
      { level: 3, text: "Spaced title", line: 1, from: 3, to: 23 },
    ]);
  });
});
