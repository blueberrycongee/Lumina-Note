import { describe, expect, it } from 'vitest';
import {
  getResizeHandleIndicatorClassName,
  RESIZE_HANDLE_WRAPPER_CLASSNAME,
} from './resizeHandleStyles';

describe('resize handle styles', () => {
  it('keeps the handle subtle and avoids decorative glow classes', () => {
    expect(RESIZE_HANDLE_WRAPPER_CLASSNAME).toContain('cursor-col-resize');

    const idle = getResizeHandleIndicatorClassName(false);
    const active = getResizeHandleIndicatorClassName(true);

    expect(idle).not.toContain('bg-gradient');
    expect(idle).not.toContain('shadow-[0_0_8px');
    expect(idle).toContain('bg-border/45');
    expect(idle).toContain('group-hover:bg-border/70');

    expect(active).not.toContain('from-primary');
    expect(active).not.toContain('shadow-[0_0_12px');
    expect(active).toContain('bg-border/75');
  });

  it('renders the visible divider from top to bottom without vertical inset gaps', () => {
    const idle = getResizeHandleIndicatorClassName(false);

    expect(idle).not.toContain('inset-y-3');
    expect(idle).toContain('inset-y-0');
  });
});
