import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * SectionHeader — consistent in-dialog section title, replaces ad-hoc
 * emoji + text patterns (e.g. "🤖 Agent Settings" → <SectionHeader
 * icon={<Bot size={14} />} title="Agent Settings" />).
 *
 * Always renders at text-sm with font-medium — matches the typography
 * scale in docs/design-system.md. No emoji.
 */

export interface SectionHeaderProps {
  /** Lucide icon at 14px (or equivalent). Optional. */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned slot — tiny action button or link. */
  action?: ReactNode;
  className?: string;
}

export function SectionHeader({
  icon,
  title,
  description,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {icon ? (
            <span className="text-muted-foreground">{icon}</span>
          ) : null}
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
        </div>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
