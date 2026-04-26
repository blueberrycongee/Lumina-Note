import { useEffect, useRef, useState } from "react";
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
  return null;
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
  const currentRef = useRef<HTMLElement | null>(null);
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
      if (!text) {
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
      if (!text) return;
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

  if (!tooltip || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="tooltip"
      data-testid="auto-tooltip"
      style={{
        position: "fixed",
        left: tooltip.x,
        top: tooltip.y,
        transform:
          tooltip.side === "top"
            ? "translate(-50%, -100%)"
            : "translateX(-50%)",
        zIndex: 9999,
        pointerEvents: "none",
      }}
      className={cn(
        "px-2 py-1 text-[12px] leading-tight rounded-md border border-border",
        "bg-foreground text-background shadow-md",
        "max-w-[260px] whitespace-normal",
        "animate-in fade-in-0 zoom-in-95 duration-100"
      )}
    >
      {tooltip.text}
    </div>,
    document.body,
  );
}
