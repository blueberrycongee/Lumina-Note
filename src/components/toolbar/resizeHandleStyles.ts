import { cn } from '@/lib/utils';

export const RESIZE_HANDLE_WRAPPER_CLASSNAME =
  'group relative h-full w-2 flex-shrink-0 cursor-col-resize select-none z-20';

export function getResizeHandleIndicatorClassName(isActive: boolean, direction: 'left' | 'right') {
  return cn(
    'absolute inset-y-0 w-[3px] rounded-full pointer-events-none',
    // Align with the sidebar border edge
    direction === 'left' ? '-left-px' : '-right-px',
    'bg-border/20 shadow-[0_0_5px_hsl(var(--border)/0.25)]',
    'transition-opacity duration-200 ease-out',
    isActive ? 'opacity-100' : 'opacity-0',
  );
}
