import { create } from "zustand";
import { FileEntry, readFile } from "@/lib/tauri";

// Extract [[wikilinks]] from content
export function extractWikiLinks(content: string): string[] {
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  const links: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1].trim());
  }
  return [...new Set(links)];
}

// Extract #tags from content
export function extractTags(content: string): string[] {
  // Match #tag but not inside code blocks or URLs
  const regex = /(?:^|\s)#([a-zA-Z\u4e00-\u9fa5][a-zA-Z0-9\u4e00-\u9fa5_-]*)/g;
  const tags: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    tags.push(match[1].toLowerCase());
  }
  return [...new Set(tags)];
}

// Note metadata for indexing
export interface NoteIndex {
  path: string;
  name: string;
  outgoingLinks: string[]; // [[links]] this note contains
  tags: string[];
  lastModified: number;
}

// Backlink entry
export interface Backlink {
  path: string;
  name: string;
  context: string; // Line containing the link
  line: number;
}

// Tag with count
export interface TagInfo {
  tag: string;
  count: number;
  files: string[];
}

interface NoteIndexState {
  // Index of all notes
  noteIndex: Map<string, NoteIndex>;

  // Backlinks cache: targetName -> backlinks[]
  backlinksCache: Map<string, Backlink[]>;

  // All tags
  allTags: TagInfo[];

  // Loading state
  isIndexing: boolean;
  lastIndexTime: number;

  // Actions
  buildIndex: (fileTree: FileEntry[]) => Promise<void>;
  getBacklinks: (noteName: string) => Backlink[];
  getTagFiles: (tag: string) => string[];
  searchContent: (query: string, files: FileEntry[]) => Promise<SearchResult[]>;
}

export interface SearchResult {
  path: string;
  name: string;
  matches: SearchMatch[];
  score: number;
}

export interface SearchMatch {
  line: number;
  content: string;
  matchStart: number;
  matchEnd: number;
}

export const useNoteIndexStore = create<NoteIndexState>((set, get) => ({
  noteIndex: new Map(),
  backlinksCache: new Map(),
  allTags: [],
  isIndexing: false,
  lastIndexTime: 0,

  buildIndex: async (fileTree: FileEntry[]) => {
    set({ isIndexing: true });

    const noteIndex = new Map<string, NoteIndex>();
    const backlinksMap = new Map<string, Backlink[]>();
    const tagsMap = new Map<string, { count: number; files: string[] }>();

    // Flatten file tree
    const allFiles: { path: string; name: string }[] = [];
    const flattenTree = (entries: FileEntry[]) => {
      for (const entry of entries) {
        if (entry.is_dir && entry.children) {
          flattenTree(entry.children);
        } else if (!entry.is_dir && entry.name.endsWith(".md")) {
          allFiles.push({
            path: entry.path,
            name: entry.name.replace(".md", "")
          });
        }
      }
    };
    flattenTree(fileTree);

    // Build note name to path map for resolving links
    const nameToPath = new Map<string, string>();
    allFiles.forEach(f => {
      nameToPath.set(f.name.toLowerCase(), f.path);
    });

    // Index each file
    for (const file of allFiles) {
      try {
        const content = await readFile(file.path);
        const outgoingLinks = extractWikiLinks(content);
        const tags = extractTags(content);

        // Store note index
        noteIndex.set(file.path, {
          path: file.path,
          name: file.name,
          outgoingLinks,
          tags,
          lastModified: Date.now(),
        });

        // Build backlinks
        const lines = content.split("\n");
        for (const linkName of outgoingLinks) {
          // Find the line containing this link
          let contextLine = "";
          let lineNum = 0;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(`[[${linkName}`) ||
              lines[i].toLowerCase().includes(`[[${linkName.toLowerCase()}`)) {
              contextLine = lines[i].trim();
              lineNum = i + 1;
              break;
            }
          }

          const backlink: Backlink = {
            path: file.path,
            name: file.name,
            context: contextLine,
            line: lineNum,
          };

          const normalizedLinkName = linkName.toLowerCase();
          if (!backlinksMap.has(normalizedLinkName)) {
            backlinksMap.set(normalizedLinkName, []);
          }
          backlinksMap.get(normalizedLinkName)!.push(backlink);
        }

        // Build tags index
        for (const tag of tags) {
          if (!tagsMap.has(tag)) {
            tagsMap.set(tag, { count: 0, files: [] });
          }
          const tagInfo = tagsMap.get(tag)!;
          tagInfo.count++;
          tagInfo.files.push(file.path);
        }
      } catch (error) {
        console.error(`Failed to index ${file.path}:`, error);
      }
    }

    // Convert tags map to sorted array
    const allTags: TagInfo[] = Array.from(tagsMap.entries())
      .map(([tag, info]) => ({ tag, count: info.count, files: info.files }))
      .sort((a, b) => b.count - a.count);

    set({
      noteIndex,
      backlinksCache: backlinksMap,
      allTags,
      isIndexing: false,
      lastIndexTime: Date.now(),
    });

    // Debug log only in development
    if (import.meta.env.DEV) {
      console.log(`[Index] Built index for ${noteIndex.size} notes, ${allTags.length} tags`);
    }
  },

  getBacklinks: (noteName: string) => {
    const { backlinksCache } = get();
    return backlinksCache.get(noteName.toLowerCase()) || [];
  },

  getTagFiles: (tag: string) => {
    const { allTags } = get();
    const tagInfo = allTags.find(t => t.tag === tag.toLowerCase());
    return tagInfo?.files || [];
  },

  searchContent: async (query: string, files: FileEntry[]) => {
    if (!query.trim()) return [];

    const results: SearchResult[] = [];
    const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");

    const allFiles: { path: string; name: string }[] = [];
    const flattenTree = (entries: FileEntry[]) => {
      for (const entry of entries) {
        if (entry.is_dir && entry.children) {
          flattenTree(entry.children);
        } else if (!entry.is_dir) {
          allFiles.push({ path: entry.path, name: entry.name.replace(".md", "") });
        }
      }
    };
    flattenTree(files);

    for (const file of allFiles) {
      try {
        const content = await readFile(file.path);
        const lines = content.split("\n");
        const matches: SearchMatch[] = [];

        lines.forEach((line, lineIndex) => {
          let match;
          pattern.lastIndex = 0;
          while ((match = pattern.exec(line)) !== null) {
            matches.push({
              line: lineIndex + 1,
              content: line.trim(),
              matchStart: match.index,
              matchEnd: match.index + match[0].length,
            });
            if (match[0].length === 0) break;
          }
        });

        if (matches.length > 0) {
          // Score based on matches in title and content
          const titleMatch = file.name.toLowerCase().includes(query.toLowerCase());
          const score = (titleMatch ? 100 : 0) + matches.length;

          results.push({
            path: file.path,
            name: file.name,
            matches,
            score,
          });
        }
      } catch (error) {
        // Skip unreadable files
      }
    }

    // Sort by score
    return results.sort((a, b) => b.score - a.score);
  },
}));
