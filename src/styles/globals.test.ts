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

    expect(darkBlock).toContain("--background: 222 7% 10%;");
    expect(darkBlock).toContain("--foreground: 220 6% 94%;");
    expect(darkBlock).toContain("--muted: 222 7% 13%;");
    expect(darkBlock).toContain("--muted-foreground: 220 6% 68%;");
    expect(darkBlock).toContain("--accent: 222 7% 17%;");
    expect(darkBlock).toContain("--border: 222 6% 24%;");
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

describe("Selectable content regions", () => {
  it("allows PDF text layer content to override the app-wide no-selection rule", () => {
    expect(globalsCss).toContain(".react-pdf__Page");
    expect(globalsCss).toContain(".react-pdf__Page__textContent");
    expect(globalsCss).toContain(".react-pdf__Page__textContent :is(span, br)");
  });
});

describe("App background skin", () => {
  it("remaps app color tokens for preset skins", () => {
    expect(globalsCss).toContain('html[data-lumina-skin="preset"]');
    expect(globalsCss).toContain(
      "--background: var(--lumina-skin-background) !important;",
    );
    expect(globalsCss).toContain(
      "--ui-ribbon: var(--lumina-skin-ribbon) !important;",
    );
  });

  it("makes opaque layout shells translucent for image skins", () => {
    expect(globalsCss).toContain(
      "--foreground: var(--lumina-skin-foreground) !important;",
    );
    expect(globalsCss).toContain(
      "--primary: var(--lumina-skin-primary) !important;",
    );
    expect(globalsCss).toContain(
      "--muted-foreground: var(--lumina-skin-muted-foreground) !important;",
    );
    expect(globalsCss).toContain(
      "--md-table-border: var(--lumina-skin-border) !important;",
    );
    expect(globalsCss).toContain(
      "--lumina-floating-overlay: hsl(0 0% 0% / 0.5);",
    );
    expect(globalsCss).toContain(
      "--foreground: var(--lumina-skin-floating-foreground);",
    );
    expect(globalsCss).toContain(
      "--popover: var(--lumina-skin-floating-background);",
    );
    expect(globalsCss).toContain(
      "--primary: var(--lumina-skin-floating-primary);",
    );
    expect(globalsCss).toContain(
      'html[data-lumina-skin="image"] .lumina-floating-surface',
    );
    expect(globalsCss).toContain(
      'html[data-lumina-skin="image"] .lumina-floating-surface [class*="bg-background/"]',
    );
    expect(globalsCss).toContain(
      'html[data-lumina-skin="image"] .lumina-floating-surface [class*="bg-popover/"]',
    );
    expect(globalsCss).toContain("background-image: none !important;");
    expect(globalsCss).toContain(
      'html[data-lumina-skin="image"] [data-sonner-toast][data-styled="true"]',
    );
    expect(globalsCss).toContain(
      'html[data-lumina-skin="image"] .lumina-tooltip',
    );
    expect(globalsCss).toContain(
      'html[data-lumina-skin="image"] .lumina-app-shell .app-sidebar-shell',
    );
    expect(globalsCss).toContain(
      'html[data-lumina-skin="image"] .lumina-app-shell .bg-ribbon',
    );
    expect(globalsCss).toContain(
      'html[data-lumina-skin="image"] .lumina-app-shell .lumina-tabbar',
    );
    expect(globalsCss).toContain(
      'html[data-lumina-skin="image"] .lumina-app-shell [class*="bg-background/"]',
    );
    expect(globalsCss).toContain(
      "--tab-active-fill: transparent !important;",
    );
    expect(globalsCss).toContain("hsl(var(--background) / 0.84)");
    expect(globalsCss).toContain(
      "--lumina-skin-surface: hsl(var(--popover) / 0.9);",
    );
    expect(globalsCss).toContain(
      "--lumina-skin-surface: hsl(var(--muted) / 0.82);",
    );
    expect(globalsCss).toContain("var(--lumina-skin-image) !important;");
    expect(globalsCss).toContain("background-attachment: scroll, fixed !important;");
    expect(globalsCss).toContain(
      'html[data-lumina-skin="image"] .lumina-app-shell .codemirror-wrapper .cm-editor',
    );
  });
});
