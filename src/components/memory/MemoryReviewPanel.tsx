import { useMemo } from "react";
import { ShieldCheck, ShieldX, Pencil, AlertTriangle, Sparkles } from "lucide-react";
import type { DurableMemorySnapshot } from "@/services/memory/durableMemory";
import type { SessionMemorySnapshot } from "@/services/memory/sessionMemory";
import { useMemoryStore } from "@/stores/useMemoryStore";

interface MemoryReviewPanelProps {
  workspacePath: string | null;
  snapshot: DurableMemorySnapshot | null;
  sessionSnapshot: SessionMemorySnapshot | null;
  onSnapshotChanged: (snapshot: DurableMemorySnapshot | null) => void;
}

function toRelativeTime(timestamp: number | null) {
  if (!timestamp) return "unknown";
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function MemoryReviewPanel({
  workspacePath,
  snapshot,
  sessionSnapshot,
  onSnapshotChanged,
}: MemoryReviewPanelProps) {
  const {
    pendingReviewIds,
    conflictIds,
    duplicateIds,
    recentDurableIds,
    recentMergeResults,
    busyEntryId,
    error,
    confirmEntry,
    rejectEntry,
    gcWorkspaceMemory,
    correctEntry,
    clearError,
  } = useMemoryStore();

  const entriesById = useMemo(() => {
    const map = new Map<string, DurableMemorySnapshot["entries"][number]>();
    for (const entry of snapshot?.entries ?? []) {
      map.set(entry.id, entry);
    }
    return map;
  }, [snapshot]);

  const pendingEntries = pendingReviewIds
    .map((id) => entriesById.get(id))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .slice(0, 6);

  const conflictEntries = conflictIds
    .map((id) => entriesById.get(id))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .slice(0, 6);

  const recentDurableEntries = recentDurableIds
    .map((id) => entriesById.get(id))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .slice(0, 6);

  const handleConfirm = async (entryId: string) => {
    if (!workspacePath) return;
    clearError();
    const nextSnapshot = await confirmEntry(workspacePath, entryId);
    if (nextSnapshot) {
      onSnapshotChanged(nextSnapshot);
    }
  };

  const handleReject = async (entryId: string) => {
    if (!workspacePath) return;
    clearError();
    const nextSnapshot = await rejectEntry(workspacePath, entryId);
    if (nextSnapshot) {
      onSnapshotChanged(nextSnapshot);
    }
  };

  const handleCorrect = async (entryId: string) => {
    if (!workspacePath) return;
    const entry = entriesById.get(entryId);
    if (!entry) return;
    clearError();

    const nextSummary = window.prompt("修正摘要（留空则取消）", entry.summary);
    if (!nextSummary || !nextSummary.trim()) return;

    const nextSnapshot = await correctEntry(workspacePath, entry, {
      summary: nextSummary.trim(),
      confidence: entry.scope === "user_identity" && entry.confidence === "low" ? "medium" : entry.confidence,
    });
    if (nextSnapshot) {
      onSnapshotChanged(nextSnapshot);
    }
  };

  return (
    <div className="bg-muted/40 border border-border/60 rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          Memory Review
        </span>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>pending {pendingEntries.length} · conflicts {conflictEntries.length} · duplicates {duplicateIds.length}</span>
          <button
            onClick={() => void gcWorkspaceMemory(workspacePath || "")}
            disabled={!workspacePath || busyEntryId !== null}
            className="rounded border border-border/60 px-2 py-0.5 text-[10px] text-foreground hover:bg-accent disabled:opacity-60"
          >
            GC
          </button>
        </div>
      </div>

      <div className="rounded-md border border-border/60 bg-background/50 px-2.5 py-2">
        <p className="text-[11px] font-medium text-foreground">Recent session memory</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {sessionSnapshot?.exists
            ? `updated ${toRelativeTime(sessionSnapshot.lastUpdatedAt)} · ${sessionSnapshot.messageCountAtLastUpdate} messages`
            : "No extracted session memory yet"}
        </p>
      </div>

      <div className="rounded-md border border-border/60 bg-background/50 px-2.5 py-2">
        <p className="text-[11px] font-medium text-foreground">New durable memories</p>
        {recentDurableEntries.length > 0 ? (
          <div className="mt-1.5 space-y-1">
            {recentDurableEntries.map((entry) => (
              <div key={entry.id} className="text-[11px] text-muted-foreground truncate">
                {entry.title} · {entry.scope} · {entry.confidence}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground mt-0.5">No recent durable memory updates.</p>
        )}
      </div>

      <div className="rounded-md border border-border/60 bg-background/50 px-2.5 py-2">
        <p className="text-[11px] font-medium text-foreground">Pending confirmation</p>
        {pendingEntries.length > 0 ? (
          <div className="mt-1.5 space-y-1.5">
            {pendingEntries.map((entry) => (
              <div key={entry.id} className="rounded border border-border/50 px-2 py-1">
                <p className="text-[11px] text-foreground truncate">{entry.title}</p>
                <p className="text-[10px] text-muted-foreground truncate">{entry.scope} · {entry.confidence}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <button
                    onClick={() => void handleConfirm(entry.id)}
                    disabled={!workspacePath || busyEntryId !== null}
                    className="inline-flex items-center gap-1 rounded border border-border/60 px-1.5 py-0.5 text-[10px] hover:bg-accent disabled:opacity-60"
                  >
                    <ShieldCheck className="w-3 h-3" /> Confirm
                  </button>
                  <button
                    onClick={() => void handleCorrect(entry.id)}
                    disabled={!workspacePath || busyEntryId !== null}
                    className="inline-flex items-center gap-1 rounded border border-border/60 px-1.5 py-0.5 text-[10px] hover:bg-accent disabled:opacity-60"
                  >
                    <Pencil className="w-3 h-3" /> Correct
                  </button>
                  <button
                    onClick={() => void handleReject(entry.id)}
                    disabled={!workspacePath || busyEntryId !== null}
                    className="inline-flex items-center gap-1 rounded border border-border/60 px-1.5 py-0.5 text-[10px] hover:bg-accent disabled:opacity-60"
                  >
                    <ShieldX className="w-3 h-3" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground mt-0.5">No pending memories.</p>
        )}
      </div>

      <div className="rounded-md border border-border/60 bg-background/50 px-2.5 py-2">
        <p className="text-[11px] font-medium text-foreground">Conflict memories</p>
        {conflictEntries.length > 0 ? (
          <div className="mt-1.5 space-y-1">
            {conflictEntries.map((entry) => (
              <div key={entry.id} className="text-[11px] text-warning truncate">
                {entry.title} · {entry.summary}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground mt-0.5">No obvious conflicts detected.</p>
        )}
      </div>

      <div className="rounded-md border border-border/60 bg-background/50 px-2.5 py-2">
        <p className="text-[11px] font-medium text-foreground">Duplicate memories</p>
        {duplicateIds.length > 0 ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Backend duplicate detection found {duplicateIds.length} entry(s) that can be cleaned up with GC.
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground mt-0.5">No duplicate entries detected.</p>
        )}
      </div>

      {recentMergeResults.length > 0 && (
        <div className="rounded-md border border-border/60 bg-background/50 px-2.5 py-2">
          <p className="text-[11px] font-medium text-foreground">Memory extraction report</p>
          <div className="mt-1.5 space-y-1">
            {recentMergeResults.slice(0, 5).map((result, idx) => (
              <div key={`${result.title}-${idx}`} className="text-[11px] text-muted-foreground truncate">
                {result.action} · {result.title}
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
