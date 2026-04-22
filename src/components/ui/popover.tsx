import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type HTMLMotionProps,
} from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Popover — lightweight floating panel primitive.
 *
 * Design-system contract (docs/design-system.md):
 *   - open 140ms ease-spring, close 100ms ease-out-subtle
 *   - content surface: bg-popover, shadow-elev-2, rounded-ui-lg
 *   - focus management: traps arrow keys on list items, ESC closes,
 *     outside click closes, focus returns to the trigger on close
 *   - keyboard navigation is NOT animated (selection jumps instantly)
 *
 * Composition:
 *
 *   <Popover open={open} onOpenChange={setOpen} anchor={anchorRef}>
 *     <PopoverContent placement="top-start">
 *       <PopoverHeader>…optional</PopoverHeader>
 *       <PopoverList>
 *         <Row … />
 *         <Row … />
 *       </PopoverList>
 *     </PopoverContent>
 *   </Popover>
 *
 * This is intentionally simple — no virtualization, no floating-ui-dom, no
 * portals. Callers that need the popover above an existing absolute ancestor
 * pass `placement` to anchor relative to `anchor`. For app-level overlays
 * (command palette), use <Dialog> instead.
 */

type Placement =
  | "bottom-start"
  | "bottom-end"
  | "top-start"
  | "top-end";

interface PopoverContextValue {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  anchorRef: React.RefObject<HTMLElement | null> | undefined;
  contentId: string;
}

const PopoverContext = createContext<PopoverContextValue | null>(null);

function usePopover() {
  const ctx = useContext(PopoverContext);
  if (!ctx) throw new Error("Popover subcomponents must be inside <Popover>");
  return ctx;
}

export interface PopoverProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** The element the popover anchors to (for positioning + dismiss logic). */
  anchor?: React.RefObject<HTMLElement | null>;
  children: ReactNode;
}

export function Popover({ open, onOpenChange, anchor, children }: PopoverProps) {
  const contentId = useId();
  const value = useMemo(
    () => ({ open, onOpenChange, anchorRef: anchor, contentId }),
    [open, onOpenChange, anchor, contentId],
  );
  return <PopoverContext.Provider value={value}>{children}</PopoverContext.Provider>;
}

export interface PopoverContentProps
  extends Omit<HTMLMotionProps<"div">, "ref"> {
  placement?: Placement;
  /** Offset from the anchor edge in px. Default 8. */
  offset?: number;
  /** Override width. If omitted, content is natural-width. */
  width?: number | string;
  className?: string;
  children: ReactNode;
}

export const PopoverContent = forwardRef<HTMLDivElement, PopoverContentProps>(
  function PopoverContent(
    { placement = "bottom-start", offset = 8, width, className, children, ...motionProps },
    ref,
  ) {
    const { open, onOpenChange, anchorRef, contentId } = usePopover();
    const reduceMotion = useReducedMotion();
    const localRef = useRef<HTMLDivElement | null>(null);
    const mergedRef = useCallback(
      (node: HTMLDivElement | null) => {
        localRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref)
          (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      },
      [ref],
    );

    // Position based on anchor bounding box.
    const [style, setStyle] = useState<React.CSSProperties>({});
    useLayoutEffect(() => {
      if (!open) return;
      const anchor = anchorRef?.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const base: React.CSSProperties = {
        position: "fixed",
        zIndex: 50,
        ...(width !== undefined ? { width } : { minWidth: rect.width }),
      };
      switch (placement) {
        case "bottom-start":
          base.top = rect.bottom + offset;
          base.left = rect.left;
          break;
        case "bottom-end":
          base.top = rect.bottom + offset;
          base.right = window.innerWidth - rect.right;
          break;
        case "top-start":
          base.bottom = window.innerHeight - rect.top + offset;
          base.left = rect.left;
          break;
        case "top-end":
          base.bottom = window.innerHeight - rect.top + offset;
          base.right = window.innerWidth - rect.right;
          break;
      }
      setStyle(base);
    }, [open, anchorRef, placement, offset, width]);

    // Outside click + ESC dismissal.
    useEffect(() => {
      if (!open) return;
      const handleClick = (e: MouseEvent) => {
        const target = e.target as Node;
        const content = localRef.current;
        const anchor = anchorRef?.current ?? null;
        if (content?.contains(target)) return;
        if (anchor?.contains(target)) return;
        onOpenChange(false);
      };
      const handleKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onOpenChange(false);
          anchorRef?.current?.focus();
        }
      };
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("keydown", handleKey);
      return () => {
        document.removeEventListener("mousedown", handleClick);
        document.removeEventListener("keydown", handleKey);
      };
    }, [open, onOpenChange, anchorRef]);

    // Animation variants pinned to token CSS vars.
    const initial = reduceMotion
      ? { opacity: 0 }
      : {
          opacity: 0,
          y: placement.startsWith("top") ? 4 : -4,
          scale: 0.98,
        };
    const animate = reduceMotion
      ? { opacity: 1 }
      : { opacity: 1, y: 0, scale: 1 };
    const exit = reduceMotion
      ? { opacity: 0 }
      : { opacity: 0, y: placement.startsWith("top") ? 2 : -2, scale: 0.99 };

    if (typeof document === "undefined") return null;

    // IMPORTANT: portal into document.body so `position: fixed` is
    // interpreted relative to the viewport. Without this, any ancestor
    // with a `transform` (framer-motion <motion.div>, Tailwind
    // `transform` utility, CSS `will-change: transform`, etc.) changes
    // the fixed containing block and the popover floats to wrong
    // coordinates.
    return createPortal(
      <AnimatePresence>
        {open ? (
          <motion.div
            ref={mergedRef}
            id={contentId}
            role="dialog"
            aria-modal={false}
            initial={initial}
            animate={animate}
            exit={exit}
            transition={{
              duration: 0.14,
              ease: [0.2, 0.9, 0.1, 1],
            }}
            style={style}
            className={cn(
              "overflow-hidden rounded-ui-lg border border-border bg-popover text-popover-foreground shadow-elev-2",
              className,
            )}
            {...motionProps}
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>,
      document.body,
    );
  },
);

/**
 * Header — optional label strip above the list. Keep it to a single
 * line; if you need more chrome, you're probably building a Dialog.
 */
export function PopoverHeader({
  className,
  children,
  trailing,
  ...props
}: HTMLAttributes<HTMLDivElement> & { trailing?: ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2",
        "border-b border-border/60 px-3 py-2",
        "text-xs font-medium text-muted-foreground",
        className,
      )}
      {...props}
    >
      <span className="truncate">{children}</span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </div>
  );
}

/**
 * List — wraps Row children. Handles arrow-key navigation via event
 * delegation; caller is responsible for which key moves which focus.
 * Max height clamps at ~56 rows ≈ 14rem (h-56) with internal scroll.
 */
export function PopoverList({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="listbox"
      className={cn(
        "max-h-56 overflow-y-auto p-1",
        // Quiet scrollbar — matches popover surface
        "[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Empty state row inside a list.
 */
export function PopoverEmpty({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "px-3 py-6 text-center text-xs text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
