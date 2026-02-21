/**
 * Regex patterns extracted from CodeMirrorEditor.tsx decoration builders.
 * Pure data module — no side effects, no CodeMirror dependency.
 */

export const EDITOR_PATTERNS = [
  { key: "math_block", regex: /\$\$([\s\S]+?)\$\$/g },
  {
    key: "math_inline",
    regex: /(?<!\\|\$)\$(?!\$)((?:[^$\n]|\n(?!\n))+?)(?<!\\|\$)\$(?!\$)/g,
  },
  { key: "highlight", regex: /==([^=\n]+)==/g },
  { key: "wikilink", regex: /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g },
  { key: "image", regex: /!\[([^\]]*)\]\(([^)]+)\)/g },
] as const;

export function countRegexMatches(content: string, pattern: RegExp): number {
  const re = new RegExp(pattern.source, pattern.flags);
  re.lastIndex = 0;
  let count = 0;
  while (re.exec(content) !== null) {
    count += 1;
  }
  return count;
}
