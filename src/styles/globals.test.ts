import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(path.resolve(__dirname, "globals.css"), "utf8");

const extractBlock = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = globalsCss.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n  \\}`, "m"));
  return match?.[1] ?? "";
};

describe("fallback theme tokens", () => {
  it("warms the light and dark default palette without changing theme override mechanics", () => {
    const rootBlock = extractBlock(":root");
    const darkBlock = extractBlock(".dark");

    expect(rootBlock).toContain("--background: 210 18% 97%;");
    expect(rootBlock).toContain("--foreground: 215 20% 11%;");
    expect(rootBlock).toContain("--muted: 210 14% 93%;");
    expect(rootBlock).toContain("--muted-foreground: 210 8% 42%;");
    expect(rootBlock).toContain("--accent: 210 12% 91%;");
    expect(rootBlock).toContain("--border: 210 12% 83%;");
    expect(rootBlock).toContain("--md-heading: 200 50% 28%;");

    expect(darkBlock).toContain("--background: 215 25% 10%;");
    expect(darkBlock).toContain("--foreground: 210 16% 93%;");
    expect(darkBlock).toContain("--muted: 215 18% 16%;");
    expect(darkBlock).toContain("--muted-foreground: 210 10% 56%;");
    expect(darkBlock).toContain("--accent: 215 14% 19%;");
    expect(darkBlock).toContain("--border: 210 12% 27%;");
    expect(darkBlock).toContain("--md-heading: 200 40% 78%;");
  });
});

describe("ui-app-bg", () => {
  it("uses subtle primary glow layers in light and dark mode", () => {
    const lightBlock = extractBlock(".ui-app-bg");
    const darkBlock = extractBlock(".dark .ui-app-bg");

    expect(lightBlock).toContain("hsl(var(--primary) / 0.05)");
    expect(darkBlock).toContain("hsl(var(--primary) / 0.07)");
  });
});
