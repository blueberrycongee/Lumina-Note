import { useMemo, useState } from "react";
import { AlertTriangle, Copy, X } from "lucide-react";
import { useErrorStore, type AppErrorNotice } from "@/stores/useErrorStore";

const buildIssuePayload = (notice: AppErrorNotice): string =>
  [
    `time: ${new Date(notice.lastSeenAt).toISOString()}`,
    `level: ${notice.level}`,
    notice.source ? `source: ${notice.source}` : "",
    notice.action ? `action: ${notice.action}` : "",
    `title: ${notice.title}`,
    `message: ${notice.message}`,
    notice.detail ? `detail:\n${notice.detail}` : "",
  ]
    .filter(Boolean)
    .join("\n");

export function ErrorNotifications() {
  const { notices, dismissNotice, clearNotices } = useErrorStore((state) => ({
    notices: state.notices,
    dismissNotice: state.dismissNotice,
    clearNotices: state.clearNotices,
  }));
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...notices].sort((a, b) => b.lastSeenAt - a.lastSeenAt),
    [notices],
  );

  if (sorted.length === 0) return null;

  const handleCopy = async (notice: AppErrorNotice) => {
    try {
      await navigator.clipboard.writeText(buildIssuePayload(notice));
      setCopiedId(notice.id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === notice.id ? null : current));
      }, 1200);
    } catch {
      // keep UI non-blocking even if clipboard is unavailable
    }
  };

  return (
    <div className="fixed right-4 top-14 z-[300] flex w-full max-w-md flex-col gap-2">
      {sorted.map((notice) => (
        <div
          key={notice.id}
          className={`rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur-sm ${
            notice.level === "warning"
              ? "border-yellow-500/40 text-yellow-500"
              : "border-red-500/40 text-red-500"
          }`}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">
                {notice.title}
                {notice.count > 1 ? ` (${notice.count})` : ""}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-xs text-foreground/90">
                {notice.message}
              </p>
              <div className="mt-2 flex items-center gap-1">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-foreground/80 hover:bg-muted"
                  onClick={() => handleCopy(notice)}
                >
                  <Copy className="h-3 w-3" />
                  {copiedId === notice.id ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-foreground/80 hover:bg-muted"
                  onClick={() => dismissNotice(notice.id)}
                >
                  <X className="h-3 w-3" />
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
      {sorted.length > 1 && (
        <div className="self-end">
          <button
            type="button"
            className="rounded border border-border bg-background/90 px-2 py-1 text-[11px] text-foreground/80 hover:bg-muted"
            onClick={clearNotices}
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
