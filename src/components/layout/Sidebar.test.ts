import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sidebarSource = readFileSync(
  path.resolve(__dirname, "Sidebar.tsx"),
  "utf8",
);

describe("Sidebar warm color hierarchy", () => {
  it("uses muted folder icons and yellow star accents in favorites", () => {
    expect(sidebarSource).toContain("text-yellow-500");
    expect(sidebarSource).toContain(
      "text-muted-foreground shrink-0 pointer-events-none",
    );
  });

  it("uses muted-foreground default file icons", () => {
    expect(sidebarSource).toContain(
      '<File className="w-4 h-4 text-muted-foreground shrink-0" />',
    );
  });
});
