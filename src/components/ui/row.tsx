import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Row — the single list-item primitive.
 *
 * Used for popover rows, sidebar items, settings rows, command palette
 * results. Forces visual parity across the app: deviations from this shape
 * are treated as a design bug, not a feature request.
 *
 * Anatomy (left → right):
 *   [icon] [title + optional description]          [trailing]
 *    16px           ───── grows ─────              auto
 *
 * States (never stack — pick one):
 *   - default
 *   - hovered       (bg-accent)
 *   - selected      (bg-accent + 2px accent bar inset on the left)
 *   - disabled      (opacity 50, pointer-events none)
 *
 * Motion: hover transitions at 100ms. Keyboard-driven selection is
 * INSTANT (no animation) — see docs/design-system.md.
 */

export interface RowProps {
  /** Optional left icon. Sized 16px — pass a 16px lucide icon. */
  icon?: ReactNode;
  /** Main label. */
  title: ReactNode;
  /** Secondary line. If absent, title vertically centers. */
  description?: ReactNode;
  /** Right-aligned slot: Kbd, chevron, badge, timestamp. */
  trailing?: ReactNode;
  /** Persistent selected state. Mutually exclusive with hover. */
  selected?: boolean;
  disabled?: boolean;
  /** Pass through for keyboard nav — sets data-selected for scrollIntoView. */
  "data-selected"?: boolean;
  onSelect?: () => void;
  /** Override class for the outer row. */
  className?: string;
  /**
   * Role — default is "button" (clickable). Set "option" inside listbox
   * popovers. Set "menuitem" inside menu-style popovers.
   */
  role?: "button" | "option" | "menuitem";
  id?: string;
}

export const Row = forwardRef<HTMLButtonElement, RowProps>(function Row(
  {
    icon,
    title,
    description,
    trailing,
    selected,
    disabled,
    onSelect,
    className,
    role = "button",
    id,
    "data-selected": dataSelected,
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      id={id}
      role={role}
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      data-selected={dataSelected ?? selected}
      onClick={onSelect}
      className={cn(
        // base — reset button default, grid layout
        "group relative w-full text-left",
        "flex items-center gap-2.5 px-3 py-2",
        "rounded-ui-md",
        // typography
        "text-sm",
        // color + transition (hover on background only, per design system)
        "text-foreground",
        "transition-colors duration-fast ease-out-subtle",
        // hover (when not disabled and not already selected — avoids jitter)
        "hover:bg-accent",
        // focus ring only on keyboard
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
        // selected — background + left accent bar (inset via ::before)
        selected &&
          "bg-accent before:absolute before:inset-y-1 before:left-1 before:w-[2px] before:rounded-full before:bg-primary",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      {icon ? (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground">
          {title}
        </span>
        {description ? (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      {trailing ? (
        <span className="ml-2 flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          {trailing}
        </span>
      ) : null}
    </button>
  );
});
