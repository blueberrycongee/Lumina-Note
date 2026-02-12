import type { FileEntry } from "@/lib/tauri";
import type { ReferencedFile } from "@/hooks/useChatSend";

export function flattenFileTreeToReferences(
  entries: FileEntry[],
  result: ReferencedFile[] = [],
): ReferencedFile[] {
  for (const entry of entries) {
    result.push({
      path: entry.path,
      name: entry.name,
      isFolder: entry.is_dir,
    });
    if (entry.is_dir && entry.children) {
      flattenFileTreeToReferences(entry.children, result);
    }
  }
  return result;
}

export function parseMentionQueryAtCursor(value: string, cursorPos: number): string | null {
  const textBeforeCursor = value.slice(0, cursorPos);
  const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);
  if (!atMatch) return null;
  return atMatch[1] ?? "";
}

export function filterMentionFiles(files: ReferencedFile[], mentionQuery: string): ReferencedFile[] {
  const filesOnly = files.filter((f) => !f.isFolder);
  const query = mentionQuery.trim().toLowerCase();
  if (!query) {
    return filesOnly;
  }
  return filesOnly.filter((f) =>
    f.name.toLowerCase().includes(query) || f.path.toLowerCase().includes(query),
  );
}
