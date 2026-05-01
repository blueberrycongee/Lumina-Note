import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(path.resolve(__dirname, "App.tsx"), "utf8");
const globalsSource = readFileSync(
  path.resolve(__dirname, "styles/globals.css"),
  "utf8",
);

describe("App sidebar motion", () => {
  it("keeps specialized tab panes stretched across the main content area", () => {
    expect(appSource).toContain(
      'const MAIN_CONTENT_PANE_CLASS =\n  "flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-popover dark:bg-background";',
    );
    const plainPaneUses =
      appSource.match(/<div className=\{MAIN_CONTENT_PANE_CLASS\}>/g) ?? [];
    const extendedPaneUses =
      appSource.match(/<div\s+className=\{`?\$\{MAIN_CONTENT_PANE_CLASS\}/g) ?? [];
    expect(plainPaneUses.length + extendedPaneUses.length).toBe(5);
  });

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

  it("keeps sidebar toggles reachable when the main pane is collapsed", () => {
    expect(appSource).toContain("function CollapsedMainSidebarControls");
    expect(appSource).toContain(
      'data-testid="collapsed-main-sidebar-controls"',
    );
    expect(appSource).toContain(
      'data-testid="collapsed-main-toggle-left-sidebar"',
    );
    expect(appSource).toContain(
      'data-testid="collapsed-main-toggle-right-sidebar"',
    );
    expect(appSource).toContain("{isMainCollapsed ? (");
  });

  it("keeps the right resize handle directly against the right sidebar", () => {
    const controlsIndex = appSource.indexOf(
      "<CollapsedMainSidebarControls",
    );
    const rightResizeIndex = appSource.indexOf(
      'direction="right"',
      controlsIndex,
    );
    const rightSidebarIndex = appSource.indexOf(
      "{/* Right Sidebar */}",
      rightResizeIndex,
    );

    expect(controlsIndex).toBeGreaterThan(-1);
    expect(rightResizeIndex).toBeGreaterThan(controlsIndex);
    expect(rightSidebarIndex).toBeGreaterThan(rightResizeIndex);
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
