import { bench, describe } from "vitest";
import { Text } from "@codemirror/state";
import { buildSyntheticMarkdown } from "../startupPerfScenarios";

/* ------------------------------------------------------------------ */
/*  CodeMirror Text.toString()                                        */
/* ------------------------------------------------------------------ */
describe("CodeMirror Text.toString()", () => {
  const sizes = [10, 50, 200, 500] as const;
  for (const kb of sizes) {
    const raw = buildSyntheticMarkdown(kb);
    const text = Text.of(raw.split("\n"));
    bench(`${kb}KB Text.toString()`, () => {
      const _s = text.toString();
      void _s;
    });
  }
});

/* ------------------------------------------------------------------ */
/*  applyChangesToContent — incremental update                        */
/* ------------------------------------------------------------------ */

/** Mirrors the function in CodeMirrorEditor.tsx (lines 894-908) */
function applyChangesToContent(
  base: string,
  changes: Array<{ from: number; to: number; insert: string }>,
): string {
  let next = "";
  let cursor = 0;
  for (const { from, to, insert } of changes) {
    if (from > cursor) {
      next += base.slice(cursor, from);
    }
    next += insert;
    cursor = to;
  }
  if (cursor < base.length) {
    next += base.slice(cursor);
  }
  return next;
}

describe("applyChangesToContent", () => {
  const doc50 = buildSyntheticMarkdown(50);
  const doc200 = buildSyntheticMarkdown(200);

  bench("incremental insert @ 50KB", () => {
    applyChangesToContent(doc50, [
      { from: doc50.length, to: doc50.length, insert: "\nnew line\n" },
    ]);
  });

  bench("incremental insert @ 200KB", () => {
    applyChangesToContent(doc200, [
      { from: doc200.length, to: doc200.length, insert: "\nnew line\n" },
    ]);
  });

  bench("multi-change @ 50KB", () => {
    applyChangesToContent(doc50, [
      { from: 100, to: 110, insert: "REPLACED" },
      { from: 500, to: 510, insert: "REPLACED" },
      { from: 1000, to: 1010, insert: "REPLACED" },
    ]);
  });

  bench("full replace @ 200KB (baseline)", () => {
    // Simulates the naive approach: just assign the whole string
    const _copy = doc200.slice(0);
    void _copy;
  });
});

/* ------------------------------------------------------------------ */
/*  KaTeX renderToString                                              */
/* ------------------------------------------------------------------ */
describe("KaTeX renderToString", () => {
  let katex: typeof import("katex");

  // Lazy-load katex once
  const ensureKatex = async () => {
    if (!katex) {
      katex = await import("katex");
    }
  };

  bench(
    "simple formula: E=mc^2",
    async () => {
      await ensureKatex();
      katex.default.renderToString("E = mc^2", { throwOnError: false });
    },
  );

  bench(
    "complex formula: integral",
    async () => {
      await ensureKatex();
      katex.default.renderToString(
        "\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}",
        { throwOnError: false },
      );
    },
  );

  bench(
    "batch: 20 formulas",
    async () => {
      await ensureKatex();
      const formulas = [
        "x^2", "\\alpha + \\beta", "\\frac{a}{b}", "\\sum_{i=0}^{n} i",
        "\\sqrt{x}", "\\lim_{x \\to 0}", "\\binom{n}{k}", "\\vec{v}",
        "\\hat{x}", "\\bar{y}", "\\dot{z}", "\\ddot{w}",
        "\\sin(\\theta)", "\\cos(\\phi)", "\\tan(\\psi)", "\\log_2(n)",
        "\\prod_{i=1}^{n}", "\\coprod", "\\bigcup", "\\bigcap",
      ];
      for (const f of formulas) {
        katex.default.renderToString(f, { throwOnError: false });
      }
    },
  );
});
