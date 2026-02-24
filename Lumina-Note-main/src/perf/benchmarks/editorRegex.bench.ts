import { bench, describe } from "vitest";
import { buildSyntheticMarkdown } from "../startupPerfScenarios";
import { EDITOR_PATTERNS, countRegexMatches } from "../editorPatterns";

/* Pre-generate documents of various sizes */
const docs = {
  "10KB": buildSyntheticMarkdown(10),
  "50KB": buildSyntheticMarkdown(50),
  "200KB": buildSyntheticMarkdown(200),
  "500KB": buildSyntheticMarkdown(500),
};

/* ------------------------------------------------------------------ */
/*  doc.toString() allocation overhead                                */
/* ------------------------------------------------------------------ */
describe("doc.toString() 分配开销", () => {
  for (const [label, content] of Object.entries(docs)) {
    bench(`string copy ${label}`, () => {
      // Simulate what CodeMirror's state.doc.toString() does:
      // allocate a new string from the document content.
      const _copy = content.slice(0);
      void _copy;
    });
  }
});

/* ------------------------------------------------------------------ */
/*  Individual regex pattern scanning                                 */
/* ------------------------------------------------------------------ */
describe("单个正则模式", () => {
  const sizes = ["50KB", "200KB", "500KB"] as const;
  for (const pattern of EDITOR_PATTERNS) {
    for (const size of sizes) {
      bench(`${pattern.key} @ ${size}`, () => {
        countRegexMatches(docs[size], pattern.regex);
      });
    }
  }
});

/* ------------------------------------------------------------------ */
/*  Full regex scan — all patterns on one toString copy               */
/* ------------------------------------------------------------------ */
describe("全量正则扫描 (single toString)", () => {
  const sizes = ["50KB", "200KB", "500KB"] as const;
  for (const size of sizes) {
    bench(`all patterns @ ${size}`, () => {
      const content = docs[size].slice(0);
      for (const pattern of EDITOR_PATTERNS) {
        countRegexMatches(content, pattern.regex);
      }
    });
  }
});

/* ------------------------------------------------------------------ */
/*  Realistic scenario: 4 builders each call toString + scan          */
/* ------------------------------------------------------------------ */
describe("多次 toString + 扫描 (4 builders)", () => {
  const sizes = ["50KB", "200KB", "500KB"] as const;
  for (const size of sizes) {
    bench(`4× toString + scan @ ${size}`, () => {
      for (let i = 0; i < 4; i++) {
        const content = docs[size].slice(0);
        for (const pattern of EDITOR_PATTERNS) {
          countRegexMatches(content, pattern.regex);
        }
      }
    });
  }
});
