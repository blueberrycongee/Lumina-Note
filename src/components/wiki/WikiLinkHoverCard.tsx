import { useEffect, useRef, useState } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { resolveWikiLinkPath, getWikiPreview } from "@/lib/wikiLinks";
import { Loader2, FileQuestion } from "lucide-react";

interface WikiLinkHoverCardProps {
  anchor: HTMLElement | null;
  linkName: string | null;
  onClose: () => void;
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading"; linkName: string }
  | { kind: "ready"; linkName: string; html: string; title: string }
  | { kind: "missing"; linkName: string };

/**
 * Floating preview card for [[wiki-links]]. Lives once per host surface
 * (ReadingView, the live-editor wrapper) — useWikiLinkHover decides when
 * to show it. Loading / ready / missing states are explicit so the
 * popover never collapses-and-reopens when content arrives.
 *
 * The popover anchors against a synthetic ref that mirrors the live
 * `anchor` element. When the user moves to an adjacent link, we update
 * the ref in place so framer-motion's positioning re-runs without an
 * exit animation.
 */
export function WikiLinkHoverCard({ anchor, linkName, onClose }: WikiLinkHoverCardProps) {
  const fileTree = useFileStore((s) => s.fileTree);
  const { t } = useLocaleStore();

  const anchorRef = useRef<HTMLElement | null>(null);
  anchorRef.current = anchor;

  const [load, setLoad] = useState<LoadState>({ kind: "idle" });
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!linkName) {
      setLoad({ kind: "idle" });
      return;
    }

    const myRequestId = ++requestIdRef.current;
    const path = resolveWikiLinkPath(fileTree, linkName);
    if (!path) {
      setLoad({ kind: "missing", linkName });
      return;
    }

    setLoad({ kind: "loading", linkName });
    getWikiPreview(path)
      .then((html) => {
        if (requestIdRef.current !== myRequestId) return;
        setLoad({ kind: "ready", linkName, html, title: linkName });
      })
      .catch(() => {
        if (requestIdRef.current !== myRequestId) return;
        setLoad({ kind: "missing", linkName });
      });
  }, [linkName, fileTree]);

  const isOpen = anchor !== null && linkName !== null;

  return (
    <Popover open={isOpen} onOpenChange={(o) => { if (!o) onClose(); }} anchor={anchorRef as React.RefObject<HTMLElement | null>}>
      <PopoverContent placement="top-start" width={360} data-wiki-hover-card>
        <div className="px-3 py-2.5 max-h-64 overflow-y-auto">
          {load.kind === "loading" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 size={12} className="animate-spin" />
              <span>{linkName}</span>
            </div>
          )}
          {load.kind === "missing" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
              <FileQuestion size={14} className="shrink-0" />
              <span>
                {t.wikiPreview.notFound.replace("{name}", linkName ?? "")}
              </span>
            </div>
          )}
          {load.kind === "ready" && (
            <>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80 mb-1">
                {load.title}
              </div>
              <div
                className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed wiki-preview-body"
                // The HTML comes from parseMarkdown over a truncated plaintext
                // slice — same renderer ReadingView uses for the page body.
                dangerouslySetInnerHTML={{ __html: load.html }}
              />
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
