import { cn } from '@/lib/utils';

export const RESIZE_HANDLE_WRAPPER_CLASSNAME =
  'group relative h-full w-2 -mx-[1px] flex-shrink-0 cursor-col-resize select-none z-20';

export function getResizeHandleIndicatorClassName(isActive: boolean) {
  return cn(
    'absolute inset-y-0 left-1/2 -translate-x-1/2 w-px rounded-full pointer-events-none',
    'bg-border/45 opacity-35 transition-[opacity,background-color] duration-200 ease-out',
    'group-hover:opacity-60 group-hover:bg-border/70',
    isActive && 'opacity-70 bg-border/75'
  );
}
