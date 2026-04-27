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

    expect(rootBlock).toContain("--background: 220 16% 99%;");
    expect(rootBlock).toContain("--foreground: 222 16% 11%;");
    expect(rootBlock).toContain("--muted: 220 14% 96%;");
    expect(rootBlock).toContain("--muted-foreground: 220 9% 46%;");
    expect(rootBlock).toContain("--accent: 220 14% 93%;");
    expect(rootBlock).toContain("--border: 220 13% 88%;");
    expect(rootBlock).toContain("--md-heading: 0 0% 9%;");

    expect(darkBlock).toContain("--background: 222 6% 9%;");
    expect(darkBlock).toContain("--foreground: 220 5% 96%;");
    expect(darkBlock).toContain("--muted: 222 6% 14%;");
    expect(darkBlock).toContain("--muted-foreground: 220 5% 66%;");
    expect(darkBlock).toContain("--accent: 222 6% 19%;");
    expect(darkBlock).toContain("--border: 222 5% 28%;");
    expect(darkBlock).toContain("--md-heading: 0 0% 96%;");
  });
});

describe("Electron drag regions", () => {
  it("maps legacy drag-region markers to Electron app-region CSS", () => {
    const dragRegionBlock = extractBlock("[data-tauri-drag-region]");
    const noDragRegionBlock = extractBlock('[data-tauri-drag-region="false"]');

    expect(dragRegionBlock).toContain("-webkit-app-region: drag;");
    expect(noDragRegionBlock).toContain("-webkit-app-region: no-drag;");
  });
});
