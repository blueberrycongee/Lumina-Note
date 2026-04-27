import { useCallback, useEffect, useRef, useState } from "react";

const HOVER_INTENT_MS = 250;
const HOVER_LEAVE_GRACE_MS = 100;

interface HoverState {
  anchor: HTMLElement | null;
  linkName: string | null;
}

/**
 * Hover-intent hook for wiki-link preview popovers.
 *
 * Attaches a single delegated pointerover/pointerout pair to the host
 * element, watches for `[data-wikilink]` targets, and commits to a
 * preview after `HOVER_INTENT_MS`. When the pointer leaves a link, we
 * wait `HOVER_LEAVE_GRACE_MS` before closing — long enough that
 * crossing into an adjacent link cancels the close and switches target
 * without flicker.
 *
 * Coarse pointers (touch) are bailed out at the event level so the hook
 * doesn't fire on tap-and-hold.
 *
 * Returns the current hover state plus an `anchorRef` consumers can pass
 * to <Popover anchor={anchorRef}>; the ref is kept in sync with the
 * committed anchor.
 */
export function useWikiLinkHover(
  hostRef: React.RefObject<HTMLElement | null>,
) {
  const [state, setState] = useState<HoverState>({ anchor: null, linkName: null });
  const anchorRef = useRef<HTMLElement | null>(null);
  const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep anchorRef pointing at the same element the popover anchors against.
  useEffect(() => {
    anchorRef.current = state.anchor;
  }, [state.anchor]);

  const clearTimers = useCallback(() => {
    if (enterTimerRef.current) {
      clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    clearTimers();
    setState({ anchor: null, linkName: null });
  }, [clearTimers]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const findLink = (el: EventTarget | null): HTMLElement | null => {
      if (!(el instanceof HTMLElement)) return null;
      const link = el.closest<HTMLElement>("[data-wikilink]");
      return link ?? null;
    };

    const handlePointerOver = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const link = findLink(e.target);
      if (!link) return;

      const linkName = (link.getAttribute("data-wikilink") || "").trim();
      if (!linkName) return;

      // Cancel any pending close — pointer is still over a link.
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }

      // If we're already showing this link, nothing to do.
      if (anchorRef.current === link) return;

      // Switching from one link to an adjacent one inside the same host:
      // commit immediately, no re-intent delay.
      if (anchorRef.current && state.anchor) {
        clearTimers();
        setState({ anchor: link, linkName });
        return;
      }

      // First entry — wait for hover intent to commit.
      if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
      enterTimerRef.current = setTimeout(() => {
        enterTimerRef.current = null;
        setState({ anchor: link, linkName });
      }, HOVER_INTENT_MS);
    };

    const handlePointerOut = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const leaving = findLink(e.target);
      if (!leaving) return;

      // Going to another link inside the host? Don't close — pointerover
      // on the new link will swap targets. Ignore moves into descendants
      // of the same link.
      const related = findLink(e.relatedTarget);
      if (related === leaving) return;

      // If a hover-intent timer is pending and we leave before it fires,
      // cancel it — user just brushed past.
      if (enterTimerRef.current) {
        clearTimeout(enterTimerRef.current);
        enterTimerRef.current = null;
      }

      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = setTimeout(() => {
        leaveTimerRef.current = null;
        setState({ anchor: null, linkName: null });
      }, HOVER_LEAVE_GRACE_MS);
    };

    host.addEventListener("pointerover", handlePointerOver);
    host.addEventListener("pointerout", handlePointerOut);
    return () => {
      host.removeEventListener("pointerover", handlePointerOver);
      host.removeEventListener("pointerout", handlePointerOut);
      clearTimers();
    };
  }, [hostRef, clearTimers, state.anchor]);

  return {
    anchor: state.anchor,
    linkName: state.linkName,
    anchorRef,
    close,
  };
}
