import { useEffect } from "react";

/**
 * Toggle `is-scroll-active` on a scrollable element while it's actively
 * being scrolled. The class clears after `idleMs` of no scroll events,
 * letting CSS transitions fade the scrollbar out.
 *
 * Pair with `.editor-scroll-shell` or `.sidebar-file-tree-scroll` styles
 * in globals.css which only render the thumb under `.is-scroll-active`.
 */
export function useScrollFade(
  getElement: () => HTMLElement | null,
  idleMs = 720,
): void {
  useEffect(() => {
    const el = getElement();
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      el.classList.add("is-scroll-active");
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        el.classList.remove("is-scroll-active");
        timer = null;
      }, idleMs);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (timer) clearTimeout(timer);
      el.classList.remove("is-scroll-active");
    };
  }, [getElement, idleMs]);
}
