import { describe, expect, it } from 'vitest';
import { SIDEBAR_SURFACE_CLASSNAME } from './sidebarSurface';

describe('SIDEBAR_SURFACE_CLASSNAME', () => {
  it('keeps the glass surface without painting its own right-side divider', () => {
    expect(SIDEBAR_SURFACE_CLASSNAME).toContain('bg-background/55');
    expect(SIDEBAR_SURFACE_CLASSNAME).toContain('backdrop-blur-md');
    expect(SIDEBAR_SURFACE_CLASSNAME).not.toContain('after:');
    expect(SIDEBAR_SURFACE_CLASSNAME).toContain('hover:bg-background/60');
    expect(SIDEBAR_SURFACE_CLASSNAME).not.toContain('border-r');
    expect(SIDEBAR_SURFACE_CLASSNAME).not.toContain('shadow-[inset_-1px_0_0');
  });
});
