/**
 * Shared helpers for resolving and previewing [[wiki-links]].
 *
 * Both ReadingView and CodeMirrorEditor used to inline a recursive walk
 * across `fileTree` to turn a wiki-link target string into a path, then
 * open it. The walk is identical in both surfaces — we hoist it here so
 * the click path and the new hover-preview path agree.
 *
 * Preview content is fetched via `readFile` and cached in a small bounded
 * map keyed by file path. The cache stops repeated previews of the same
 * note from re-reading from disk while the popover is being moved between
 * adjacent links; entries fall out FIFO when the cap is hit.
 */

import { readFile } from "@/lib/host";
import { parseMarkdown } from "@/services/markdown/markdown";
import type { FileEntry } from "@/lib/host";

const PREVIEW_CACHE_LIMIT = 64;
const PREVIEW_PLAIN_CHARS = 220;

const previewCache = new Map<string, string>();

export function resolveWikiLinkPath(
  fileTree: FileEntry[],
  linkName: string,
): string | null {
  const target = linkName.trim().toLowerCase();
  if (!target) return null;

  const walk = (entries: FileEntry[]): string | null => {
    for (const entry of entries) {
      if (entry.is_dir && entry.children) {
        const found = walk(entry.children);
        if (found) return found;
      } else if (!entry.is_dir && entry.name.toLowerCase().endsWith(".md")) {
        const stem = entry.name.replace(/\.md$/i, "").toLowerCase();
        if (stem === target) return entry.path;
      }
    }
    return null;
  };

  return walk(fileTree);
}

function stripFrontmatter(raw: string): string {
  if (!raw.startsWith("---")) return raw;
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return raw;
  return raw.slice(end + 4).replace(/^\s+/, "");
}

function truncatePlain(text: string, max: number): string {
  if (text.length <= max) return text;
  // Don't cut mid-word if we can avoid it.
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > max - 40 ? slice.slice(0, lastSpace) : slice) + "…";
}

/**
 * Read the target note, strip frontmatter, truncate the plaintext, then
 * re-render through parseMarkdown so basic formatting (bold/italic/links)
 * survives in the hover card. Plugin post-processing is intentionally
 * skipped — previews must not run user plugins.
 */
export async function getWikiPreview(path: string): Promise<string> {
  const cached = previewCache.get(path);
  if (cached !== undefined) return cached;

  const raw = await readFile(path);
  const body = stripFrontmatter(raw);
  const truncated = truncatePlain(body, PREVIEW_PLAIN_CHARS);
  const html = parseMarkdown(truncated);

  if (previewCache.size >= PREVIEW_CACHE_LIMIT) {
    // FIFO eviction — pop the oldest entry.
    const firstKey = previewCache.keys().next().value;
    if (firstKey !== undefined) previewCache.delete(firstKey);
  }
  previewCache.set(path, html);
  return html;
}

/** Drop the cached preview for a path (e.g. after the user edits the file). */
export function invalidateWikiPreview(path: string): void {
  previewCache.delete(path);
}
