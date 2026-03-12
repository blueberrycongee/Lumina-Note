import { describe, expect, it } from 'vitest';
import {
  getResizeHandleIndicatorClassName,
  RESIZE_HANDLE_WRAPPER_CLASSNAME,
} from './resizeHandleStyles';

describe('resize handle styles', () => {
  it('keeps the handle visible at rest without adding decorative glow classes', () => {
    expect(RESIZE_HANDLE_WRAPPER_CLASSNAME).toContain('cursor-col-resize');

    const idle = getResizeHandleIndicatorClassName(false);
    const active = getResizeHandleIndicatorClassName(true);

    expect(idle).not.toContain('bg-gradient');
    expect(idle).not.toContain('shadow-[0_0_8px');
    expect(idle).toContain('bg-border/55');
    expect(idle).toContain('opacity-55');
    expect(idle).toContain('group-hover:bg-border/75');
    expect(idle).toContain('group-hover:opacity-75');

    expect(active).not.toContain('from-primary');
    expect(active).not.toContain('shadow-[0_0_12px');
    expect(active).toContain('bg-border/80');
    expect(active).toContain('opacity-85');
  });

  it('renders the visible divider from top to bottom without vertical inset gaps', () => {
    const idle = getResizeHandleIndicatorClassName(false);

    expect(idle).not.toContain('inset-y-3');
    expect(idle).toContain('inset-y-0');
  });
});
