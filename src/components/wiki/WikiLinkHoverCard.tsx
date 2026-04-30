import { useEffect, useRef, useState } from "react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { getWikiPreview } from "@/lib/wikiLinks";
import { Loader2, FileQuestion } from "lucide-react";

interface NoteHoverPreviewProps {
  anchor: HTMLElement | null;
  /** File path to render, or null when the trigger is unresolved. */
  path: string | null;
  /** Display name shown as the card header. */
  label: string | null;
  onClose: () => void;
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading"; path: string }
  | { kind: "ready"; path: string; html: string }
  | { kind: "missing"; label: string };

/**
 * Floating preview card for note references — wiki-links in the
 * editor / reading view, file-tree rows in the sidebar, and other
 * surfaces that opt in by emitting `data-note-path` or
 * `data-wikilink`. The hook resolves to a unified
 * `{ anchor, path, label }`; this component just renders.
 *
 * Three explicit load states (loading / ready / missing) so the card
 * never collapses-and-reopens when content arrives. Uses the existing
 * Popover primitive — inherits viewport clamping, ESC, outside-click
 * dismissal, and the iter 12 elev-2 inner-top-highlight for free.
 */
export function NoteHoverPreview({ anchor, path, label, onClose }: NoteHoverPreviewProps) {
  const { t } = useLocaleStore();

  const anchorRef = useRef<HTMLElement | null>(null);
  anchorRef.current = anchor;

  const [load, setLoad] = useState<LoadState>({ kind: "idle" });
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!anchor || !label) {
      setLoad({ kind: "idle" });
      return;
    }
    const myRequestId = ++requestIdRef.current;
    if (!path) {
      setLoad({ kind: "missing", label });
      return;
    }

    setLoad({ kind: "loading", path });
    getWikiPreview(path)
      .then((html) => {
        if (requestIdRef.current !== myRequestId) return;
        setLoad({ kind: "ready", path, html });
      })
      .catch(() => {
        if (requestIdRef.current !== myRequestId) return;
        setLoad({ kind: "missing", label });
      });
  }, [anchor, path, label]);

  const isOpen = anchor !== null && label !== null;

  return (
    <Popover
      open={isOpen}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      anchor={anchorRef as React.RefObject<HTMLElement | null>}
    >
      <PopoverContent placement="top-start" width={360} data-wiki-hover-card>
        <div className="px-3 py-2.5 max-h-64 overflow-y-auto">
          {load.kind === "loading" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 size={12} className="animate-spin" />
              <span>{label}</span>
            </div>
          )}
          {load.kind === "missing" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
              <FileQuestion size={14} className="shrink-0" />
              <span>
                {t.wikiPreview.notFound.replace("{name}", load.label)}
              </span>
            </div>
          )}
          {load.kind === "ready" && (
            <>
              <div className="text-ui-caption uppercase tracking-wider text-muted-foreground/80 mb-1">
                {label}
              </div>
              <div
                className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed wiki-preview-body"
                // The HTML comes from parseMarkdown over a leading-
                // heading-stripped, truncated plaintext slice — same
                // renderer ReadingView uses for the page body.
                dangerouslySetInnerHTML={{ __html: load.html }}
              />
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Back-compat alias — old name kept for in-flight imports. */
export const WikiLinkHoverCard = NoteHoverPreview;
