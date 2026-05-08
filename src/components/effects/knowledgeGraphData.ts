import type { NoteIndex } from "@/stores/useNoteIndexStore";

export interface GraphNode {
  id: string;
  label: string;
  path: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  connections: number;
  isDragging?: boolean;
  isFolder?: boolean;
  parentId?: string;
  color?: string;
  depth?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: "link" | "hierarchy";
}

export interface KnowledgeGraphStatus {
  totalNotes: number;
  displayedNotes: number;
  hiddenNotes: number;
  cappedByDisplayLimit: boolean;
}

export interface KnowledgeGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  status: KnowledgeGraphStatus;
}

export const DEFAULT_GRAPH_NOTE_LIMIT = 1200;

const FOLDER_COLORS = [
  "hsl(210, 65%, 50%)",
  "hsl(350, 60%, 55%)",
  "hsl(160, 55%, 42%)",
  "hsl(270, 55%, 55%)",
  "hsl(30, 70%, 50%)",
  "hsl(185, 55%, 45%)",
  "hsl(50, 65%, 48%)",
  "hsl(320, 55%, 52%)",
  "hsl(95, 50%, 45%)",
  "hsl(225, 60%, 55%)",
];

const FILE_COLORS = [
  "hsl(210, 40%, 70%)",
  "hsl(350, 35%, 72%)",
  "hsl(160, 30%, 62%)",
  "hsl(270, 30%, 70%)",
  "hsl(30, 45%, 68%)",
  "hsl(185, 30%, 62%)",
  "hsl(50, 40%, 65%)",
  "hsl(320, 30%, 68%)",
  "hsl(95, 25%, 62%)",
  "hsl(225, 35%, 72%)",
];

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/g, "");
}

function relativePath(vaultPath: string | null | undefined, filePath: string): string {
  const normalizedFile = normalizePath(filePath);
  if (!vaultPath) return normalizedFile;
  const normalizedVault = normalizePath(vaultPath);
  if (normalizedFile === normalizedVault) return "";
  if (normalizedFile.startsWith(`${normalizedVault}/`)) {
    return normalizedFile.slice(normalizedVault.length + 1);
  }
  return normalizedFile;
}

function folderPathFromParts(vaultPath: string | null | undefined, parts: string[]): string {
  if (!vaultPath) return parts.join("/");
  return `${normalizePath(vaultPath)}/${parts.join("/")}`;
}

function compareNotes(vaultPath: string | null | undefined, a: NoteIndex, b: NoteIndex): number {
  return relativePath(vaultPath, a.path).localeCompare(relativePath(vaultPath, b.path));
}

export function buildKnowledgeGraphData(
  notes: NoteIndex[],
  options: {
    vaultPath?: string | null;
    currentFile?: string | null;
    noteLimit?: number;
  } = {},
): KnowledgeGraphData {
  const noteLimit = options.noteLimit ?? DEFAULT_GRAPH_NOTE_LIMIT;
  const sortedNotes = notes
    .filter((note) => note.path.toLowerCase().endsWith(".md"))
    .slice()
    .sort((a, b) => compareNotes(options.vaultPath, a, b));

  const noteByName = new Map<string, NoteIndex>();
  const noteByPath = new Map<string, NoteIndex>();
  for (const note of sortedNotes) {
    noteByPath.set(note.path, note);
    const key = note.name.toLowerCase();
    if (!noteByName.has(key)) noteByName.set(key, note);
  }

  const allLinkEdges: GraphEdge[] = [];
  const linkEdgeSet = new Set<string>();
  const connectionCounts = new Map<string, number>();

  for (const note of sortedNotes) {
    for (const linkName of note.outgoingLinks) {
      const target = noteByName.get(linkName.trim().toLowerCase());
      if (!target || target.path === note.path) continue;

      const edgeKey =
        note.path < target.path
          ? `${note.path}\u0000${target.path}`
          : `${target.path}\u0000${note.path}`;
      if (linkEdgeSet.has(edgeKey)) continue;

      linkEdgeSet.add(edgeKey);
      allLinkEdges.push({ source: note.path, target: target.path, type: "link" });
      connectionCounts.set(note.path, (connectionCounts.get(note.path) ?? 0) + 1);
      connectionCounts.set(target.path, (connectionCounts.get(target.path) ?? 0) + 1);
    }
  }

  let displayedNotes = sortedNotes;
  if (sortedNotes.length > noteLimit) {
    const currentPath = options.currentFile ? normalizePath(options.currentFile) : null;
    displayedNotes = sortedNotes
      .slice()
      .sort((a, b) => {
        const aCurrent = currentPath && normalizePath(a.path) === currentPath ? 1 : 0;
        const bCurrent = currentPath && normalizePath(b.path) === currentPath ? 1 : 0;
        if (aCurrent !== bCurrent) return bCurrent - aCurrent;

        const byConnections = (connectionCounts.get(b.path) ?? 0) - (connectionCounts.get(a.path) ?? 0);
        if (byConnections !== 0) return byConnections;
        return compareNotes(options.vaultPath, a, b);
      })
      .slice(0, noteLimit)
      .sort((a, b) => compareNotes(options.vaultPath, a, b));
  }

  const displayedPathSet = new Set(displayedNotes.map((note) => note.path));
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const folderNodes = new Map<string, GraphNode>();
  const folderFileColors = new Map<string, string>();
  const hierarchyEdgeSet = new Set<string>();
  let colorIndex = 0;

  function addHierarchyEdge(source: string, target: string): void {
    const key = `${source}\u0000${target}`;
    if (hierarchyEdgeSet.has(key)) return;
    hierarchyEdgeSet.add(key);
    edges.push({ source, target, type: "hierarchy" });
  }

  function ensureFolder(parts: string[], depth: number): GraphNode {
    const folderPath = folderPathFromParts(options.vaultPath, parts);
    const folderId = `folder:${folderPath}`;
    const existing = folderNodes.get(folderId);
    if (existing) return existing;

    const idx = colorIndex % FOLDER_COLORS.length;
    colorIndex++;
    const parentParts = parts.slice(0, -1);
    const parentId =
      parentParts.length > 0
        ? `folder:${folderPathFromParts(options.vaultPath, parentParts)}`
        : undefined;

    const node: GraphNode = {
      id: folderId,
      label: parts[parts.length - 1] ?? folderPath,
      path: folderPath,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      connections: 0,
      isFolder: true,
      parentId,
      color: FOLDER_COLORS[idx],
      depth,
    };
    folderNodes.set(folderId, node);
    folderFileColors.set(folderId, FILE_COLORS[idx]);
    nodes.push(node);

    if (parentId) addHierarchyEdge(parentId, folderId);
    return node;
  }

  for (const note of displayedNotes) {
    const rel = relativePath(options.vaultPath, note.path);
    const pathParts = rel.split("/").filter(Boolean);
    const folderParts = pathParts.slice(0, -1);
    let parentFolder: GraphNode | null = null;

    for (let i = 0; i < folderParts.length; i++) {
      parentFolder = ensureFolder(folderParts.slice(0, i + 1), i);
    }

    let nodeColor = "hsl(var(--muted-foreground))";
    if (parentFolder) {
      nodeColor = folderFileColors.get(parentFolder.id) ?? nodeColor;
    }

    const fileNode: GraphNode = {
      id: note.path,
      label: note.name,
      path: note.path,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      connections: connectionCounts.get(note.path) ?? 0,
      isFolder: false,
      parentId: parentFolder?.id,
      color: parentFolder?.color ? nodeColor : "hsl(var(--muted-foreground))",
      depth: folderParts.length,
    };
    nodes.push(fileNode);
    if (parentFolder) addHierarchyEdge(parentFolder.id, fileNode.id);
  }

  for (const edge of allLinkEdges) {
    if (displayedPathSet.has(edge.source) && displayedPathSet.has(edge.target)) {
      edges.push(edge);
    }
  }

  return {
    nodes,
    edges,
    status: {
      totalNotes: sortedNotes.length,
      displayedNotes: displayedNotes.length,
      hiddenNotes: Math.max(0, sortedNotes.length - displayedNotes.length),
      cappedByDisplayLimit: sortedNotes.length > displayedNotes.length,
    },
  };
}
