import { create } from "zustand";
import {
  deleteDurableMemoryEntry,
  gcDurableMemory,
  reverifyDurableMemoryEntry,
  upsertDurableMemoryEntry,
  type DurableMemorySnapshot,
  type MemoryEntry,
  type MemoryEntryInput,
  type MemoryMergeResult,
} from "@/services/memory/durableMemory";

interface MemoryStoreState {
  pendingReviewIds: string[];
  conflictIds: string[];
  duplicateIds: string[];
  recentDurableIds: string[];
  recentMergeResults: MemoryMergeResult[];
  busyEntryId: string | null;
  error: string | null;

  hydrateFromSnapshot: (snapshot: DurableMemorySnapshot | null) => void;
  clearError: () => void;
  confirmEntry: (workspacePath: string, entryId: string) => Promise<DurableMemorySnapshot | null>;
  rejectEntry: (workspacePath: string, entryId: string) => Promise<DurableMemorySnapshot | null>;
  gcWorkspaceMemory: (workspacePath: string) => Promise<DurableMemorySnapshot | null>;
  correctEntry: (
    workspacePath: string,
    entry: MemoryEntry,
    patch: Partial<Pick<MemoryEntryInput, "title" | "summary" | "details" | "confidence" | "tags" | "visibility">>,
  ) => Promise<DurableMemorySnapshot | null>;
}

const UNRESOLVED_HINT_RE = /\?|unresolved|open question|tension|conflict|待确认|不确定/i;

function detectConflictIds(entries: MemoryEntry[]) {
  const byTitle = new Map<string, MemoryEntry[]>();
  for (const entry of entries) {
    const key = entry.title.trim().toLowerCase();
    if (!key) continue;
    const list = byTitle.get(key) ?? [];
    list.push(entry);
    byTitle.set(key, list);
  }

  const ids = new Set<string>();
  for (const siblings of byTitle.values()) {
    if (siblings.length < 2) continue;
    const summaries = new Set(siblings.map((item) => item.summary.trim().toLowerCase()));
    if (summaries.size > 1) {
      siblings.forEach((item) => ids.add(item.id));
    }
  }

  for (const entry of entries) {
    if (UNRESOLVED_HINT_RE.test(entry.summary) || UNRESOLVED_HINT_RE.test(entry.details)) {
      ids.add(entry.id);
    }
  }

  return Array.from(ids);
}

export const useMemoryStore = create<MemoryStoreState>((set) => ({
  pendingReviewIds: [],
  conflictIds: [],
  duplicateIds: [],
  recentDurableIds: [],
  recentMergeResults: [],
  busyEntryId: null,
  error: null,

  hydrateFromSnapshot: (snapshot) => {
    if (!snapshot) {
      set({
        pendingReviewIds: [],
        conflictIds: [],
        duplicateIds: [],
        recentDurableIds: [],
        recentMergeResults: [],
      });
      return;
    }

    const staleSet = new Set(snapshot.staleEntryIds);
    const pendingReviewIds = snapshot.entries
      .filter((entry) => {
        const isIdentity = entry.scope === "user_identity";
        const isLowConfidence = entry.confidence === "low";
        const unresolved = UNRESOLVED_HINT_RE.test(entry.summary) || UNRESOLVED_HINT_RE.test(entry.details);
        return isIdentity || isLowConfidence || staleSet.has(entry.id) || unresolved;
      })
      .map((entry) => entry.id);

    const pendingSet = new Set([...pendingReviewIds, ...snapshot.conflictEntryIds, ...snapshot.duplicateEntryIds]);

    const mergeEntryIds = snapshot.mergeResults
      .map((result) => result.entryId)
      .filter((entryId): entryId is string => Boolean(entryId));

    const recentDurableIds = (mergeEntryIds.length > 0 ? mergeEntryIds : snapshot.entries.map((entry) => entry.id))
      .slice(0, 8);

    set({
      pendingReviewIds: Array.from(pendingSet),
      conflictIds: Array.from(new Set([...detectConflictIds(snapshot.entries), ...snapshot.conflictEntryIds])),
      duplicateIds: snapshot.duplicateEntryIds,
      recentDurableIds,
      recentMergeResults: snapshot.mergeResults.slice(-8).reverse(),
    });
  },

  clearError: () => set({ error: null }),

  confirmEntry: async (workspacePath, entryId) => {
    if (!workspacePath || !entryId) return null;
    set({ busyEntryId: entryId, error: null });
    try {
      const snapshot = await reverifyDurableMemoryEntry(workspacePath, entryId);
      return snapshot;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      return null;
    } finally {
      set({ busyEntryId: null });
    }
  },

  rejectEntry: async (workspacePath, entryId) => {
    if (!workspacePath || !entryId) return null;
    set({ busyEntryId: entryId, error: null });
    try {
      const snapshot = await deleteDurableMemoryEntry(workspacePath, entryId);
      return snapshot;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      return null;
    } finally {
      set({ busyEntryId: null });
    }
  },

  correctEntry: async (workspacePath, entry, patch) => {
    if (!workspacePath) return null;

    const nextConfidence = patch.confidence ?? entry.confidence;
    if (entry.scope === "user_identity" && nextConfidence === "low") {
      set({ error: "Identity memories require medium or high confidence before saving." });
      return null;
    }


  gcWorkspaceMemory: async (workspacePath) => {
    if (!workspacePath) return null;
    set({ busyEntryId: "gc", error: null });
    try {
      const snapshot = await gcDurableMemory(workspacePath);
      return snapshot;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      return null;
    } finally {
      set({ busyEntryId: null });
    }
  },
    set({ busyEntryId: entry.id, error: null });
    try {
      const snapshot = await upsertDurableMemoryEntry(workspacePath, {
        id: entry.id,
        scope: entry.scope,
        visibility: patch.visibility ?? entry.visibility,
        title: patch.title ?? entry.title,
        summary: patch.summary ?? entry.summary,
        details: patch.details ?? entry.details,
        confidence: nextConfidence,
        tags: patch.tags ?? entry.tags,
      });
      return snapshot;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      return null;
    } finally {
      set({ busyEntryId: null });
    }
  },
}));
