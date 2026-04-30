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
 * Density:
 *   - default:  px-3 py-2, gap-2.5, 16px icon slot — sidebars, settings rows
 *   - compact:  px-2.5 py-1.5, gap-2, 14px icon slot — popovers, menus
 *
 * Typography (Apple/OpenAI-aligned):
 *   - title is 13px regular by default; 13px medium when `selected`.
 *     Weight is the selection signal — paired with bg-accent — so we don't
 *     need a left accent bar fighting for the user's eye.
 *   - description is 12px muted.
 *
 * States (never stack — pick one):
 *   - default
 *   - hovered       (bg-foreground/5, very quiet)
 *   - selected      (bg-accent + medium-weight title)
 *   - disabled      (opacity 50, pointer-events none)
 *
 * Motion: hover transitions at 100ms. Keyboard-driven selection is
 * INSTANT (no animation) — see docs/design-system.md.
 */

export interface RowProps {
  /** Optional left icon. Pass a 16px lucide icon (default density) or 14px (compact). */
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
  /**
   * Density — `default` for sidebars/settings rows, `compact` for popovers
   * and menu surfaces where the parent container is intrinsically small.
   */
  density?: "default" | "compact";
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
    density = "default",
    "data-selected": dataSelected,
  },
  ref,
) {
  const compact = density === "compact";
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
        "group relative w-full text-left",
        "flex items-center rounded-ui-md",
        "[clip-path:inset(0_round_var(--ui-radius-md))]",
        "text-foreground",
        "transition-colors duration-fast ease-out-subtle",
        compact ? "gap-2 px-2.5 py-1.5" : "gap-2.5 px-3 py-2",
        "hover:bg-foreground/5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
        selected && "bg-accent hover:bg-accent",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      {icon ? (
        <span
          className={cn(
            "shrink-0 flex items-center justify-center text-muted-foreground",
            compact ? "h-3.5 w-3.5" : "h-4 w-4",
          )}
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[13px] text-foreground",
            selected ? "font-medium" : "font-normal",
          )}
        >
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
