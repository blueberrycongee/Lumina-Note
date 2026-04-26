import { forwardRef, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/stores/useLocaleStore";

/**
 * Dialog — modal overlay with backdrop, focus trap, ESC dismissal.
 *
 * Design-system contract:
 *   - backdrop: black at 40% (light) / 60% (dark); 120ms fade
 *   - panel: bg-popover, rounded-ui-xl (14px), shadow-elev-3, max-w-md
 *     default (pass width for wider modals)
 *   - ESC dismisses; outside click does NOT dismiss (intentional — dialogs
 *     demand an explicit decision, popovers don't)
 *   - respects prefers-reduced-motion
 *
 * Anatomy:
 *
 *   <Dialog open onOpenChange={…}>
 *     <DialogHeader title="…" description="…" />
 *     <DialogBody>…</DialogBody>
 *     <DialogFooter>
 *       <Button variant="ghost">Cancel</Button>
 *       <Button variant="primary">Save</Button>
 *     </DialogFooter>
 *   </Dialog>
 */

export interface DialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Dialog panel width. Default 480 (max-w-md). */
  width?: number | string;
  /** Override panel className — avoid unless absolutely needed. */
  className?: string;
  /** When true, clicking the backdrop closes the dialog. Default false. */
  dismissOnBackdropClick?: boolean;
  /** Hide the top-right close button. Default false. */
  hideCloseButton?: boolean;
  children: ReactNode;
}

export const Dialog = forwardRef<HTMLDivElement, DialogProps>(function Dialog(
  {
    open,
    onOpenChange,
    width = 480,
    className,
    dismissOnBackdropClick = false,
    hideCloseButton = false,
    children,
  },
  ref,
) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const { t } = useLocaleStore();

  // ESC + focus restoration
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previouslyFocused.current?.focus();
    };
  }, [open, onOpenChange]);

  // Initial focus — first focusable inside the panel.
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const focusable = panelRef.current.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
  }, [open]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div
          ref={ref}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-foreground/40"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onClick={dismissOnBackdropClick ? () => onOpenChange(false) : undefined}
          />
          {/* Panel */}
          <motion.div
            ref={panelRef}
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 8, scale: 0.97 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 4, scale: 0.98 }
            }
            transition={{
              duration: 0.16,
              ease: [0.2, 0.9, 0.1, 1],
            }}
            style={{ width }}
            className={cn(
              "relative max-w-[calc(100vw-2rem)]",
              "rounded-ui-xl border border-border bg-popover text-popover-foreground",
              "shadow-elev-3",
              "flex max-h-[calc(100vh-4rem)] flex-col",
              className,
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {!hideCloseButton ? (
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className={cn(
                  "absolute right-3 top-3 z-10",
                  "flex h-7 w-7 items-center justify-center rounded-ui-sm",
                  "text-muted-foreground",
                  "transition-colors duration-fast ease-out-subtle",
                  "hover:bg-accent hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
                )}
                aria-label={t.common.close}
              >
                <X size={14} />
              </button>
            ) : null}
            {children}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
});

export interface DialogHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Optional slot right of the title (e.g. a badge). Avoid buttons. */
  badge?: ReactNode;
  className?: string;
}

export function DialogHeader({
  title,
  description,
  badge,
  className,
}: DialogHeaderProps) {
  return (
    <div
      className={cn(
        "shrink-0 border-b border-border/60 px-6 pt-5 pb-4",
        className,
      )}
    >
      <div className="flex items-center gap-2 pr-8">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {badge ? <span className="shrink-0">{badge}</span> : null}
      </div>
      {description ? (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

export function DialogBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex-1 overflow-y-auto px-6 py-5",
        "[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DialogFooter({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "shrink-0 border-t border-border/60 px-6 py-4",
        "flex items-center justify-end gap-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
