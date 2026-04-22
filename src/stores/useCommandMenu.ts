// Global Cmd+K command palette state.
//
// The command palette is a single app-wide overlay. Callers open it by
// pressing Cmd/Ctrl+K (wired in <CommandMenuProvider/> at the App root).
// Individual features register commands via registerCommands().

import { create } from "zustand";
import type { ReactNode } from "react";

export type CommandGroupId =
  | "actions"
  | "sessions"
  | "navigation"
  | "skills"
  | "files";

export interface CommandItem {
  id: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  /** Optional keyboard shortcut hint, rendered as Kbd in the trailing slot. */
  shortcut?: string;
  /** One of the semantic group ids; controls section ordering + header. */
  group: CommandGroupId;
  /** Keywords to boost fuzzy match beyond the title. */
  keywords?: string[];
  run: () => void | Promise<void>;
}

type State = {
  open: boolean;
  query: string;
  /** Each feature owns a "source" id — calling register replaces the
   *  commands for that source, so it's safe to call on every render. */
  sources: Record<string, CommandItem[]>;
};

type Actions = {
  setOpen: (next: boolean) => void;
  toggle: () => void;
  setQuery: (next: string) => void;
  registerSource: (sourceId: string, items: CommandItem[]) => void;
  unregisterSource: (sourceId: string) => void;
};

export type CommandMenuStore = State & Actions;

export const useCommandMenu = create<CommandMenuStore>((set) => ({
  open: false,
  query: "",
  sources: {},

  setOpen: (open) => set({ open, ...(open ? {} : { query: "" }) }),
  toggle: () => set((s) => ({ open: !s.open, query: s.open ? s.query : "" })),
  setQuery: (query) => set({ query }),
  registerSource: (sourceId, items) =>
    set((s) => ({ sources: { ...s.sources, [sourceId]: items } })),
  unregisterSource: (sourceId) =>
    set((s) => {
      const next = { ...s.sources };
      delete next[sourceId];
      return { sources: next };
    }),
}));

// ── Helpers ────────────────────────────────────────────────────────────

export function getAllCommands(store: CommandMenuStore): CommandItem[] {
  return Object.values(store.sources).flat();
}

/**
 * Simple fuzzy-ish match: all query characters must appear in order in
 * either title or keywords. Case-insensitive. Returns a score (lower =
 * better). Full word match beats partial.
 */
export function scoreCommand(
  command: CommandItem,
  query: string,
): number | null {
  if (!query) return 0;
  const q = query.toLowerCase().trim();
  const haystacks = [command.title.toLowerCase(), ...(command.keywords ?? []).map((k) => k.toLowerCase())];
  let best: number | null = null;
  for (const hay of haystacks) {
    if (hay === q) return -100; // exact match wins
    if (hay.startsWith(q)) {
      best = best !== null ? Math.min(best, -50) : -50;
      continue;
    }
    if (hay.includes(q)) {
      best = best !== null ? Math.min(best, -20) : -20;
      continue;
    }
    // subsequence
    let qi = 0;
    for (let i = 0; i < hay.length && qi < q.length; i++) {
      if (hay[i] === q[qi]) qi++;
    }
    if (qi === q.length) {
      best = best !== null ? Math.min(best, 0) : 0;
    }
  }
  return best;
}

export function filterAndRankCommands(
  commands: CommandItem[],
  query: string,
): CommandItem[] {
  if (!query) return commands;
  const scored: Array<{ command: CommandItem; score: number }> = [];
  for (const command of commands) {
    const score = scoreCommand(command, query);
    if (score !== null) scored.push({ command, score });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.map((s) => s.command);
}
