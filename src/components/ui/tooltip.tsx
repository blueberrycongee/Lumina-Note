import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

// Lumina's hover tooltip is event-delegated rather than per-button so we
// don't have to wrap every <button> with a Tooltip primitive. Mount one
// AutoTooltipHost at the app root and any element that satisfies
// TOOLTIP_TRIGGER_SELECTOR + has aria-label or data-tooltip gets a tooltip
// on hover and on keyboard focus.
const TOOLTIP_TRIGGER_SELECTOR = "button, [role='button'], a[href]";
const SHOW_DELAY_MS = 350;
const HIDE_DELAY_MS = 60;
const TOOLTIP_OFFSET_PX = 6;
const VIEWPORT_FLIP_MARGIN_PX = 40;

interface TooltipState {
  text: string;
  x: number;
  y: number;
  side: "top" | "bottom";
}

function getTooltipText(el: HTMLElement): string | null {
  const aria = el.getAttribute("aria-label")?.trim();
  if (aria) return aria;
  const data = el.getAttribute("data-tooltip")?.trim();
  if (data) return data;
  // Fallback to title attribute so existing buttons that already declare
  // their hover string the legacy way keep working until they're migrated
  // to aria-label or data-tooltip.
  const title = el.getAttribute("title")?.trim();
  if (title) return title;
  return null;
}

function hasVisibleTextLabel(el: HTMLElement): boolean {
  const clone = el.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(".sr-only, [aria-hidden='true'], [hidden]")
    .forEach((node) => node.remove());
  const text = clone.textContent?.trim() ?? "";
  return /\p{L}/u.test(text);
}

/**
 * Decide whether to actually surface a tooltip on this trigger. We suppress
 * for buttons that already render a word-character label inline — repeating
 * "Send" on hover of a "Send" button is noise, and that's the bulk of the
 * tooltips a user notices as visual clutter. Single-glyph buttons (▶ × +)
 * fall through and still get tooltips because a glyph alone isn't a label.
 *
 * Two explicit overrides:
 *   - `data-tooltip-force="true"`    — always show (for buttons whose
 *                                      visible text is a value, not a label,
 *                                      e.g. a "100%" zoom chip).
 *   - `data-tooltip-suppress="true"` — never show (escape hatch for cases
 *                                      where a glyph button still wants
 *                                      no tooltip, e.g. inside a busy UI
 *                                      where the glyph is contextual).
 */
function shouldShowTooltip(el: HTMLElement): boolean {
  if (el.dataset.tooltipForce === "true") return true;
  if (el.dataset.tooltipSuppress === "true") return false;
  // \p{L} matches any unicode letter — Latin, CJK, Cyrillic, Greek, etc.
  // Symbols like ▶ × + don't match, so iconic glyph buttons keep their
  // tooltips while real text labels suppress theirs.
  return !hasVisibleTextLabel(el);
}

function computePosition(el: HTMLElement, text: string): TooltipState {
  const rect = el.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const belowY = rect.bottom + TOOLTIP_OFFSET_PX;
  const flip = belowY > window.innerHeight - VIEWPORT_FLIP_MARGIN_PX;
  return {
    text,
    x: centerX,
    y: flip ? rect.top - TOOLTIP_OFFSET_PX : belowY,
    side: flip ? "top" : "bottom",
  };
}

export function AutoTooltipHost() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  // `clampedX` lags one render behind `tooltip.x`: the first commit lays the
  // tooltip out at the naive (centered-on-trigger) position, useLayoutEffect
  // measures the rendered width, then a second commit shifts it to keep both
  // edges inside the viewport. Both commits land before the next paint so the
  // user never sees the unclamped frame.
  const [clampedX, setClampedX] = useState<number | null>(null);
  const currentRef = useRef<HTMLElement | null>(null);
  const tooltipElRef = useRef<HTMLDivElement | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearShow = () => {
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };
    const clearHide = () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };

    const showImmediate = (el: HTMLElement, text: string) => {
      clearShow();
      clearHide();
      currentRef.current = el;
      setTooltip(computePosition(el, text));
    };

    const showDelayed = (el: HTMLElement, text: string) => {
      clearHide();
      if (currentRef.current === el && tooltip) return;
      clearShow();
      currentRef.current = el;
      showTimerRef.current = setTimeout(() => {
        // Only commit if the same element is still the active candidate
        if (currentRef.current === el) {
          setTooltip(computePosition(el, text));
        }
      }, SHOW_DELAY_MS);
    };

    const hideSoon = () => {
      clearShow();
      currentRef.current = null;
      clearHide();
      hideTimerRef.current = setTimeout(() => {
        setTooltip(null);
      }, HIDE_DELAY_MS);
    };

    const findTrigger = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof Element)) return null;
      const trigger = target.closest(TOOLTIP_TRIGGER_SELECTOR);
      return trigger instanceof HTMLElement ? trigger : null;
    };

    const onMouseOver = (e: MouseEvent) => {
      const trigger = findTrigger(e.target);
      if (!trigger) return;
      const text = getTooltipText(trigger);
      if (!text || !shouldShowTooltip(trigger)) {
        if (currentRef.current) hideSoon();
        return;
      }
      showDelayed(trigger, text);
    };

    const onMouseOut = (e: MouseEvent) => {
      const trigger = findTrigger(e.target);
      if (!trigger || trigger !== currentRef.current) return;
      const related = e.relatedTarget;
      if (related instanceof Node && trigger.contains(related)) return;
      hideSoon();
    };

    const onFocusIn = (e: FocusEvent) => {
      const trigger = findTrigger(e.target);
      if (!trigger) return;
      const text = getTooltipText(trigger);
      if (!text || !shouldShowTooltip(trigger)) return;
      showImmediate(trigger, text);
    };

    const onFocusOut = (e: FocusEvent) => {
      const trigger = findTrigger(e.target);
      if (!trigger || trigger !== currentRef.current) return;
      hideSoon();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && tooltip) {
        clearShow();
        currentRef.current = null;
        setTooltip(null);
      }
    };

    const onScrollOrResize = () => {
      // Rather than reposition, just hide — typical hover tooltips don't follow
      // moving anchors and recomputing every frame is wasteful.
      if (tooltip) {
        clearShow();
        currentRef.current = null;
        setTooltip(null);
      }
    };

    document.addEventListener("mouseover", onMouseOver);
    document.addEventListener("mouseout", onMouseOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("mouseout", onMouseOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      clearShow();
      clearHide();
    };
  }, [tooltip]);

  // Reset clamp state whenever the tooltip target changes so measurement
  // re-runs against the new content's width.
  useLayoutEffect(() => {
    setClampedX(null);
  }, [tooltip]);

  // Clamp the tooltip's horizontal position so it can't escape the viewport
  // on left- or right-edge triggers (e.g. the chat send button or the leftmost
  // ribbon icon). The tooltip uses `translateX(-50%)`, so we measure its
  // rendered width and constrain `x` to [margin + half, vw - margin - half].
  useLayoutEffect(() => {
    if (!tooltip || clampedX !== null) return;
    const el = tooltipElRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    if (w === 0) return;
    const margin = 8;
    const half = w / 2;
    const minX = margin + half;
    const maxX = window.innerWidth - margin - half;
    // If the viewport is narrower than the tooltip + margins, prefer the
    // left edge (minX wins) — the tooltip will overflow right but stays
    // anchored to a sensible side.
    setClampedX(Math.max(minX, Math.min(tooltip.x, maxX)));
  }, [tooltip, clampedX]);

  if (!tooltip || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={tooltipElRef}
      role="tooltip"
      data-testid="auto-tooltip"
      style={{
        position: "fixed",
        left: clampedX ?? tooltip.x,
        top: tooltip.y,
        transform:
          tooltip.side === "top"
            ? "translate(-50%, -100%)"
            : "translateX(-50%)",
        zIndex: 9999,
        pointerEvents: "none",
      }}
      className={cn(
        "px-2 py-1 text-ui-meta leading-tight rounded-md border border-border",
        "bg-foreground text-background shadow-elev-2",
        "max-w-[260px] whitespace-normal",
      )}
    >
      {tooltip.text}
    </div>,
    document.body,
  );
}
