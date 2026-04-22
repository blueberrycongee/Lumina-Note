import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(path.resolve(__dirname, "App.tsx"), "utf8");
const globalsSource = readFileSync(
  path.resolve(__dirname, "styles/globals.css"),
  "utf8",
);

describe("App sidebar motion", () => {
  it("wraps both sidebars in animated shells with fixed-width inner content", () => {
    expect(appSource).toContain('data-side="left"');
    expect(appSource).toContain('data-side="right"');
    expect(appSource).toContain("className={`app-sidebar-shell flex-shrink-0");
    expect(appSource).toContain('className="app-sidebar-inner"');
    expect(appSource).toContain("style={{ width: leftSidebarWidth }}");
    expect(appSource).toContain(
      'isMainCollapsed && rightSidebarOpen',
    );
    expect(appSource).toContain(
      '? "100%"',
    );
    expect(appSource).toContain(
      ": rightSidebarWidth",
    );
  });

  it("defines directional sidebar motion tokens and nudge states", () => {
    expect(globalsSource).toContain("--ui-motion-sidebar: 220ms;");
    expect(globalsSource).toContain(".app-sidebar-shell[data-open=\"false\"]");
    expect(globalsSource).toContain(
      '.app-sidebar-shell[data-open="false"][data-side="left"] .app-sidebar-inner',
    );
    expect(globalsSource).toContain(
      '.app-sidebar-shell[data-open="false"][data-side="right"] .app-sidebar-inner',
    );
    expect(globalsSource).toContain("transform: translateX(calc(var(--ui-sidebar-nudge) * -1));");
    expect(globalsSource).toContain("transform: translateX(var(--ui-sidebar-nudge));");
  });
});
