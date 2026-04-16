import { parser } from "@lezer/markdown";

export interface MarkdownHeading {
  level: number;
  text: string;
  line: number;
  from: number;
  to: number;
}

const HEADING_LEVEL_BY_NODE = new Map<string, number>([
  ["ATXHeading1", 1],
  ["ATXHeading2", 2],
  ["ATXHeading3", 3],
  ["ATXHeading4", 4],
  ["ATXHeading5", 5],
  ["ATXHeading6", 6],
  ["SetextHeading1", 1],
  ["SetextHeading2", 2],
]);

function buildLineStarts(content: string) {
  const starts = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) === 10) {
      starts.push(index + 1);
    }
  }
  return starts;
}

function extractAtxHeadingText(source: string) {
  const firstLine = source.split(/\r?\n/, 1)[0] ?? source;
  return firstLine
    .replace(/^[ \t]{0,3}#{1,6}(?:[ \t]+|$)/, "")
    .replace(/[ \t]+#+[ \t]*$/, "")
    .trim();
}

function extractSetextHeadingText(source: string) {
  const lines = source.split(/\r?\n/);
  if (lines.length <= 1) return source.trim();
  return lines
    .slice(0, -1)
    .map((line) => line.trim())
    .join(" ")
    .trim();
}

export function extractMarkdownHeadings(content: string): MarkdownHeading[] {
  if (!content) return [];

  const headings: MarkdownHeading[] = [];
  const lineStarts = buildLineStarts(content);
  let lineIndex = 0;

  parser.parse(content).iterate({
    enter(node) {
      const level = HEADING_LEVEL_BY_NODE.get(node.name);
      if (!level) return;

      while (
        lineIndex + 1 < lineStarts.length &&
        lineStarts[lineIndex + 1] <= node.from
      ) {
        lineIndex += 1;
      }

      const source = content.slice(node.from, node.to);
      const text = node.name.startsWith("ATXHeading")
        ? extractAtxHeadingText(source)
        : extractSetextHeadingText(source);

      headings.push({
        level,
        text,
        line: lineIndex + 1,
        from: node.from,
        to: node.to,
      });
    },
  });

  return headings;
}
