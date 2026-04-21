import { describe, expect, it } from 'vitest';
import {
  getResizeHandleIndicatorClassName,
  RESIZE_HANDLE_WRAPPER_CLASSNAME,
} from './resizeHandleStyles';

describe('resize handle styles', () => {
  it('shows indicator only when active', () => {
    expect(RESIZE_HANDLE_WRAPPER_CLASSNAME).toContain('cursor-col-resize');

    const idle = getResizeHandleIndicatorClassName(false, 'left');
    const active = getResizeHandleIndicatorClassName(true, 'left');

    expect(idle).toContain('opacity-0');
    expect(idle).not.toContain('opacity-100');

    expect(active).toContain('opacity-100');
    expect(active).not.toContain('opacity-0');
  });

  it('positions indicator at the sidebar-facing edge based on direction', () => {
    const left = getResizeHandleIndicatorClassName(false, 'left');
    const right = getResizeHandleIndicatorClassName(false, 'right');

    expect(left).toContain('-left-px');
    expect(left).not.toContain('-right-px');

    expect(right).toContain('-right-px');
    expect(right).not.toContain('-left-px');
  });

  it('renders the visible divider from top to bottom without vertical inset gaps', () => {
    const idle = getResizeHandleIndicatorClassName(false, 'left');

    expect(idle).not.toContain('inset-y-3');
    expect(idle).toContain('inset-y-0');
  });
});
