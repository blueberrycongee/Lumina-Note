import { useCallback, useEffect, useRef, useState } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { resolveWikiLinkPath } from "@/lib/wikiLinks";

const HOVER_INTENT_MS = 250;
const HOVER_LEAVE_GRACE_MS = 100;

interface HoverState {
  anchor: HTMLElement | null;
  path: string | null;
  label: string | null;
}

/**
 * Hover-intent hook for note preview popovers.
 *
 * The hook used to listen only for `[data-wikilink]` (the attribute
 * parseMarkdown / CodeMirror's wikilink decoration emit). Now it also
 * recognises `[data-note-path]` — a direct file-path anchor any
 * surface can use to participate in the hover-preview affordance
 * without going through wikilink resolution: file-tree rows, search
 * results, command-palette file-mode rows, backlinks lists.
 *
 * Both attributes resolve to a unified `{ anchor, path, label }`
 * shape so consumers don't have to know which kind of trigger was
 * hovered.
 *
 * 250ms intent before commit, 100ms grace on leave so the popover
 * survives moving between adjacent links. Bails out on coarse
 * pointers (touch).
 */
export function useNoteHoverPreview(
  hostRef: React.RefObject<HTMLElement | null>,
) {
  const fileTree = useFileStore((s) => s.fileTree);
  const fileTreeRef = useRef(fileTree);
  fileTreeRef.current = fileTree;

  const [state, setState] = useState<HoverState>({
    anchor: null,
    path: null,
    label: null,
  });
  const anchorRef = useRef<HTMLElement | null>(null);
  const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setState({ anchor: null, path: null, label: null });
  }, [clearTimers]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const findTrigger = (el: EventTarget | null): HTMLElement | null => {
      if (!(el instanceof HTMLElement)) return null;
      return el.closest<HTMLElement>(
        "[data-wikilink], [data-note-path]",
      );
    };

    const resolve = (
      el: HTMLElement,
    ): { path: string | null; label: string } | null => {
      const directPath = el.getAttribute("data-note-path");
      if (directPath) {
        const filename = directPath.split(/[\/\\]/).pop() || directPath;
        return { path: directPath, label: filename.replace(/\.md$/i, "") };
      }
      const wikiName = (el.getAttribute("data-wikilink") || "").trim();
      if (wikiName) {
        const path = resolveWikiLinkPath(fileTreeRef.current, wikiName);
        return { path, label: wikiName };
      }
      return null;
    };

    const handlePointerOver = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const trigger = findTrigger(e.target);
      if (!trigger) return;

      const resolved = resolve(trigger);
      if (!resolved || !resolved.label) return;

      // Pointer is over a link → cancel any pending close.
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }

      // Already showing this anchor.
      if (anchorRef.current === trigger) return;

      // Switching from one trigger to an adjacent one inside the same
      // host: commit immediately, no re-intent delay.
      if (anchorRef.current && state.anchor) {
        clearTimers();
        setState({
          anchor: trigger,
          path: resolved.path,
          label: resolved.label,
        });
        return;
      }

      // First entry — wait for hover intent to commit.
      if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
      enterTimerRef.current = setTimeout(() => {
        enterTimerRef.current = null;
        setState({
          anchor: trigger,
          path: resolved.path,
          label: resolved.label,
        });
      }, HOVER_INTENT_MS);
    };

    const handlePointerOut = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const leaving = findTrigger(e.target);
      if (!leaving) return;

      // Moving to another trigger inside the host? pointerover on the
      // new trigger will swap targets; ignore moves into descendants.
      const related = findTrigger(e.relatedTarget);
      if (related === leaving) return;

      if (enterTimerRef.current) {
        clearTimeout(enterTimerRef.current);
        enterTimerRef.current = null;
      }

      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = setTimeout(() => {
        leaveTimerRef.current = null;
        setState({ anchor: null, path: null, label: null });
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
    path: state.path,
    label: state.label,
    close,
  };
}

/** Back-compat alias — old name kept for in-flight imports. */
export const useWikiLinkHover = useNoteHoverPreview;
