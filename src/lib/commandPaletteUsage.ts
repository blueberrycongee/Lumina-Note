// Shared local-storage-backed usage state for the command palette.
// Used by CommandPalette to render Discover/Recent sections, and by the
// Ribbon's palette trigger to render an "unseen featured" dot.

export const COMMAND_USAGE_KEY = "lumina:commandPaletteUsage";
export const COMMAND_USAGE_EVENT = "lumina-command-palette-usage-updated";

export const FEATURED_COMMAND_IDS = [
  "show-graph",
  "global-search",
  "toggle-theme",
] as const;

export type UsageEntry = { count: number; lastUsed: number };
export type UsageMap = Record<string, UsageEntry>;

export function readUsage(): UsageMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(COMMAND_USAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function writeUsage(map: UsageMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COMMAND_USAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(COMMAND_USAGE_EVENT));
  } catch {
    // ignore (private mode, quota)
  }
}

export function countUnseenFeatured(usage: UsageMap): number {
  return FEATURED_COMMAND_IDS.reduce(
    (acc, id) => (usage[id] ? acc : acc + 1),
    0,
  );
}
