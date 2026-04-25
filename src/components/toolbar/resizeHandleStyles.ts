import { cn } from '@/lib/utils';

export const RESIZE_HANDLE_WRAPPER_CLASSNAME =
  'group relative h-full w-0 flex-shrink-0 cursor-col-resize select-none z-20';

export function getResizeHandleIndicatorClassName(isActive: boolean, direction: 'left' | 'right') {
  return cn(
    'absolute inset-y-0 w-[3px] rounded-full pointer-events-none',
    // Align with the sidebar border edge
    direction === 'left' ? '-left-px' : '-right-px',
    'bg-border/30',
    'transition-opacity duration-200 ease-out',
    isActive ? 'opacity-100' : 'opacity-0',
  );
}
