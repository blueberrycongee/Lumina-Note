import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sidebarSource = readFileSync(path.resolve(__dirname, "Sidebar.tsx"), "utf8");

describe("Sidebar warm color hierarchy", () => {
  it("uses amber folder icons and warmer favorites accents", () => {
    expect(sidebarSource).toContain("bg-amber-500/5");
    expect(sidebarSource).toContain("text-amber-500/80");
    expect(sidebarSource).toContain("text-yellow-500");
    expect(sidebarSource).toContain("text-amber-500/70");
    expect(sidebarSource).toContain("text-amber-500/80 shrink-0 pointer-events-none");
  });

  it("uses colored default file and database icons instead of gray fallbacks", () => {
    expect(sidebarSource).toContain('<Database className="w-4 h-4 text-indigo-500 shrink-0" />');
    expect(sidebarSource).toContain('<File className="w-4 h-4 text-primary/50 shrink-0" />');
  });
});
