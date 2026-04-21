import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const rightPanelSource = readFileSync(path.resolve(__dirname, "RightPanel.tsx"), "utf8");

describe("RightPanel accent styling", () => {
  it("owns its left-side border for divider continuity", () => {
    expect(rightPanelSource).toContain("border-l border-border/50 bg-background flex flex-col");
    expect(rightPanelSource).not.toContain("backdrop-blur-md");
    expect(rightPanelSource).not.toContain("shadow-[inset_1px_0_0_hsl(var(--border)/0.6)]");
  });

  it("strengthens active tab styling with solid primary borders and a tinted background", () => {
    expect(rightPanelSource).toContain("text-primary border-b-2 border-primary bg-primary/5");
    expect(rightPanelSource).not.toContain("text-primary border-b-2 border-primary/80 bg-background/60");
  });

  it("uses low-opacity primary empty-state icons", () => {
    expect(rightPanelSource).toContain('className="text-primary/25 mb-2"');
    expect(rightPanelSource).not.toContain('className="opacity-30 mb-2"');
  });
});
