import { describe, expect, it } from 'vitest';
import { SIDEBAR_SURFACE_CLASSNAME } from './sidebarSurface';

describe('SIDEBAR_SURFACE_CLASSNAME', () => {
  it('shares the canvas tone with content + right panel for cohesion', () => {
    // Sidebar previously sat on `bg-muted` — one tier above the canvas.
    // That read as a hard tonal split between left and the rest of the
    // app, especially in dark mode. The new contract: same canvas tone
    // (`bg-background`) as content + right panel, separated only by a
    // 1px inset right hairline.
    expect(SIDEBAR_SURFACE_CLASSNAME).toContain('bg-background');
    expect(SIDEBAR_SURFACE_CLASSNAME).not.toContain('bg-muted');
    expect(SIDEBAR_SURFACE_CLASSNAME).not.toContain('backdrop-blur-md');
    expect(SIDEBAR_SURFACE_CLASSNAME).not.toContain('after:');
    expect(SIDEBAR_SURFACE_CLASSNAME).not.toContain('hover:bg-background/60');
    expect(SIDEBAR_SURFACE_CLASSNAME).toContain(
      'shadow-[inset_-1px_0_0_hsl(var(--border)/0.7)]',
    );
  });
});
