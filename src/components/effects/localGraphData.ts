import type { Backlink, NoteIndex } from "@/stores/useNoteIndexStore";

export interface LocalNode {
  id: string;
  label: string;
  path: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  isCurrent: boolean;
  isBacklink: boolean;
}

export interface LocalEdge {
  source: string;
  target: string;
}

export interface LocalGraphStatus {
  totalRelated: number;
  displayedRelated: number;
  hiddenRelated: number;
  cappedByDisplayLimit: boolean;
}

export interface LocalGraphData {
  nodes: LocalNode[];
  edges: LocalEdge[];
  status: LocalGraphStatus;
}

export const DEFAULT_LOCAL_GRAPH_RELATED_LIMIT = 80;

function basenameWithoutMd(path: string): string {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const base = slash >= 0 ? path.slice(slash + 1) : path;
  return base.replace(/\.md$/i, "");
}

function compareNotes(a: NoteIndex, b: NoteIndex): number {
  return a.path.localeCompare(b.path);
}

function extractWikiLinks(content: string): string[] {
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  const links: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1].trim());
  }
  return [...new Set(links)];
}

export function buildLocalGraphData({
  currentFile,
  currentContent,
  notes,
  backlinks,
  relatedLimit = DEFAULT_LOCAL_GRAPH_RELATED_LIMIT,
}: {
  currentFile: string;
  currentContent: string;
  notes: NoteIndex[];
  backlinks: Backlink[];
  relatedLimit?: number;
}): LocalGraphData {
  const currentName = basenameWithoutMd(currentFile);
  const sortedNotes = notes.slice().sort(compareNotes);
  const noteByName = new Map<string, NoteIndex>();
  for (const note of sortedNotes) {
    const key = note.name.toLowerCase();
    if (!noteByName.has(key)) noteByName.set(key, note);
  }

  const currentNode: LocalNode = {
    id: currentFile,
    label: currentName,
    path: currentFile,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    isCurrent: true,
    isBacklink: false,
  };

  const related = new Map<string, LocalNode>();
  const edges: LocalEdge[] = [];

  for (const linkName of extractWikiLinks(currentContent || "")) {
    const target = noteByName.get(linkName.toLowerCase());
    if (!target || target.path === currentFile) continue;
    if (!related.has(target.path)) {
      related.set(target.path, {
        id: target.path,
        label: target.name,
        path: target.path,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        isCurrent: false,
        isBacklink: false,
      });
    }
    edges.push({ source: currentFile, target: target.path });
  }

  for (const backlink of backlinks) {
    if (backlink.path === currentFile) continue;
    const existing = related.get(backlink.path);
    if (existing) {
      existing.isBacklink = true;
    } else {
      related.set(backlink.path, {
        id: backlink.path,
        label: backlink.name,
        path: backlink.path,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        isCurrent: false,
        isBacklink: true,
      });
    }
    if (!edges.some((edge) => edge.source === backlink.path && edge.target === currentFile)) {
      edges.push({ source: backlink.path, target: currentFile });
    }
  }

  const allRelated = Array.from(related.values());
  const displayedRelated = allRelated.slice(0, relatedLimit);
  const displayedIds = new Set([currentFile, ...displayedRelated.map((node) => node.id)]);

  return {
    nodes: [currentNode, ...displayedRelated],
    edges: edges.filter((edge) => displayedIds.has(edge.source) && displayedIds.has(edge.target)),
    status: {
      totalRelated: allRelated.length,
      displayedRelated: displayedRelated.length,
      hiddenRelated: Math.max(0, allRelated.length - displayedRelated.length),
      cappedByDisplayLimit: allRelated.length > displayedRelated.length,
    },
  };
}
