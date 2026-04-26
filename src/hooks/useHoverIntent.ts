import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hover-with-delay intent for a chip-triggered popover.
 *
 * Why not pure hover: rapid mouse drift over a row of chips would otherwise
 * thrash open/close. The 300ms open delay filters incidental glances; the
 * 200ms close delay forgives the brief gap between trigger and popover content
 * when the user moves the mouse to interact.
 *
 * Click still opens immediately and is the only path that works on touch.
 *
 * Usage:
 *   const { open, setOpen, triggerHandlers, contentHandlers } = useHoverIntent();
 *   <button {...triggerHandlers} ref={triggerRef} />
 *   <Popover open={open} onOpenChange={setOpen} anchor={triggerRef}>
 *     <PopoverContent {...contentHandlers}>...</PopoverContent>
 *   </Popover>
 *
 * For mutually exclusive chip groups (e.g. ModelEffortPicker's
 * model / mode / effort triplet) hand-roll the timers around a shared
 * `which-chip-is-open` state instead — see ModelEffortPicker for the pattern
 * that lets the user smoothly slide between sibling chips without a blink.
 */
export interface HoverIntentOptions {
  /** ms the mouse must dwell on the trigger before the popover opens (default 300). */
  openDelay?: number;
  /** ms after mouse leaves trigger + content before the popover closes (default 200). */
  closeDelay?: number;
}

export interface HoverIntent {
  open: boolean;
  setOpen: (next: boolean) => void;
  triggerHandlers: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onClick: () => void;
  };
  contentHandlers: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };
}

export function useHoverIntent(opts: HoverIntentOptions = {}): HoverIntent {
  const { openDelay = 300, closeDelay = 200 } = opts;
  const [open, setOpenState] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearOpen = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  }, []);
  const clearClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const setOpen = useCallback(
    (next: boolean) => {
      clearOpen();
      clearClose();
      setOpenState(next);
    },
    [clearOpen, clearClose],
  );

  const triggerHandlers = {
    onMouseEnter: () => {
      // Mouse came back to trigger → cancel any pending close.
      clearClose();
      if (open) return;
      clearOpen();
      openTimer.current = setTimeout(() => {
        openTimer.current = null;
        setOpenState(true);
      }, openDelay);
    },
    onMouseLeave: () => {
      // Cancel any pending open from this hover (e.g. brief drift over the chip).
      clearOpen();
      // If popover is open, schedule close — gives the user time to cross the
      // gap into the popover content.
      clearClose();
      closeTimer.current = setTimeout(() => {
        closeTimer.current = null;
        setOpenState(false);
      }, closeDelay);
    },
    onClick: () => {
      clearOpen();
      clearClose();
      setOpenState((prev) => !prev);
    },
  };

  const contentHandlers = {
    // Entering the popover surface cancels any pending close — keeps it open
    // while the user interacts.
    onMouseEnter: () => {
      clearClose();
    },
    onMouseLeave: () => {
      clearOpen();
      clearClose();
      closeTimer.current = setTimeout(() => {
        closeTimer.current = null;
        setOpenState(false);
      }, closeDelay);
    },
  };

  // Cleanup pending timers when the consumer unmounts.
  useEffect(() => {
    return () => {
      clearOpen();
      clearClose();
    };
  }, [clearOpen, clearClose]);

  return { open, setOpen, triggerHandlers, contentHandlers };
}
