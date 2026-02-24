/**
 * Skeleton - 骨架屏组件
 */

import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-ui-md bg-muted/50",
        "before:absolute before:inset-0",
        "before:translate-x-[-120%]",
        "before:bg-[linear-gradient(90deg,transparent,hsl(var(--foreground)/0.08),transparent)]",
        "before:animate-[ui-shimmer_1.1s_ease-in-out_infinite]",
        className
      )}
      {...props}
    />
  );
}
