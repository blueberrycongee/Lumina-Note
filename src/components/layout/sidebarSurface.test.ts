import { describe, expect, it } from 'vitest';
import { SIDEBAR_SURFACE_CLASSNAME } from './sidebarSurface';

describe('SIDEBAR_SURFACE_CLASSNAME', () => {
  it('owns its right-side border for divider continuity', () => {
    expect(SIDEBAR_SURFACE_CLASSNAME).toContain('bg-background');
    expect(SIDEBAR_SURFACE_CLASSNAME).not.toContain('backdrop-blur-md');
    expect(SIDEBAR_SURFACE_CLASSNAME).not.toContain('after:');
    expect(SIDEBAR_SURFACE_CLASSNAME).not.toContain('hover:bg-background/60');
    expect(SIDEBAR_SURFACE_CLASSNAME).toContain('border-r');
    expect(SIDEBAR_SURFACE_CLASSNAME).toContain('border-border');
    expect(SIDEBAR_SURFACE_CLASSNAME).not.toContain('shadow-[inset_-1px_0_0');
  });
});
