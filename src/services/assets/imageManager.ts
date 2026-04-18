import type { FileEntry } from "@/lib/host";
import { basename, dirname, extname, relative } from "@/lib/path";
import { getRelativePath } from "@/lib/utils";
import { extractAssetLinks, resolveAssetSourcePath, rewriteMarkdownAssetLinks } from "@/services/publish/assets";

export const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".avif",
  ".tif",
  ".tiff",
  ".ico",
]);

export const LARGE_IMAGE_THRESHOLD_BYTES = 5 * 1024 * 1024;
export const RECENT_IMAGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface ImageNoteReference {
  notePath: string;
  noteName: string;
  noteRelativePath: string;
  occurrenceCount: number;
}

export interface ImageAssetRecord {
  path: string;
  name: string;
  relativePath: string;
  folderPath: string;
  folderRelativePath: string;
  extension: string;
  sizeBytes: number | null;
  modifiedAt: number | null;
  createdAt: number | null;
  referenceCount: number;
  referencedBy: ImageNoteReference[];
  orphan: boolean;
  multiReferenced: boolean;
  recent: boolean;
  large: boolean;
}

export interface ImageLibrarySummary {
  totalImages: number;
  referencedImages: number;
  orphanImages: number;
  multiReferencedImages: number;
  recentImages: number;
  largeImages: number;
  totalBytes: number;
}

export interface ImageLibraryIndex {
  images: ImageAssetRecord[];
  summary: ImageLibrarySummary;
  notePaths: string[];
}

export interface NoteContentSource {
  path: string;
  content: string;
}

export interface AssetPathChange {
  from: string;
  to: string;
}

export interface PlannedNoteAssetChange {
  from: string;
  to: string;
  occurrenceCount: number;
}

export interface PlannedNoteAssetUpdate {
  notePath: string;
  originalContent: string;
  updatedContent: string;
  changes: PlannedNoteAssetChange[];
}

const normalizeFilePath = (path: string): string => path.replace(/\\/g, "/");

export const isMarkdownPath = (path: string): boolean => normalizeFilePath(path).toLowerCase().endsWith(".md");

export const isImagePath = (path: string): boolean => {
  const extension = extname(normalizeFilePath(path)).toLowerCase();
  return IMAGE_EXTENSIONS.has(extension);
};

export const flattenFileTree = (entries: FileEntry[]): FileEntry[] => {
  const files: FileEntry[] = [];
  const walk = (items: FileEntry[]) => {
    for (const entry of items) {
      if (entry.is_dir && entry.children?.length) {
        walk(entry.children);
      } else if (!entry.is_dir) {
        files.push(entry);
      }
    }
  };
  walk(entries);
  return files;
};

export const listMarkdownNotePaths = (fileTree: FileEntry[]): string[] =>
  flattenFileTree(fileTree)
    .map((entry) => normalizeFilePath(entry.path))
    .filter((path) => isMarkdownPath(path));

const buildImageReferenceMap = (
  noteSources: NoteContentSource[],
  imagePaths: Set<string>,
): Map<string, Map<string, number>> => {
  const references = new Map<string, Map<string, number>>();

  for (const note of noteSources) {
    const links = extractAssetLinks(note.content);
    for (const link of links) {
      const resolved = resolveAssetSourcePath(note.path, link);
      if (!resolved) continue;
      const imagePath = normalizeFilePath(resolved.sourcePath);
      if (!imagePaths.has(imagePath)) continue;
      if (!references.has(imagePath)) {
        references.set(imagePath, new Map());
      }
      const noteMap = references.get(imagePath)!;
      noteMap.set(note.path, (noteMap.get(note.path) ?? 0) + 1);
    }
  }

  return references;
};

export const buildImageLibraryIndex = async (
  fileTree: FileEntry[],
  vaultPath: string,
  readNote: (path: string) => Promise<string>,
  now: number = Date.now(),
): Promise<ImageLibraryIndex> => {
  const allFiles = flattenFileTree(fileTree);
  const imageFiles = allFiles
    .filter((entry) => isImagePath(entry.path))
    .map((entry) => ({
      ...entry,
      path: normalizeFilePath(entry.path),
    }));
  const notePaths = allFiles
    .map((entry) => normalizeFilePath(entry.path))
    .filter((path) => isMarkdownPath(path));
  const noteSources = await Promise.all(
    notePaths.map(async (path) => ({
      path,
      content: await readNote(path),
    })),
  );
  const imagePaths = new Set(imageFiles.map((entry) => entry.path));
  const referenceMap = buildImageReferenceMap(noteSources, imagePaths);

  const images = imageFiles
    .map<ImageAssetRecord>((entry) => {
      const path = entry.path;
      const directory = normalizeFilePath(dirname(path));
      const noteRefs = Array.from(referenceMap.get(path)?.entries() ?? [])
        .map(([notePath, occurrenceCount]) => ({
          notePath,
          noteName: basename(notePath, ".md"),
          noteRelativePath: getRelativePath(notePath, vaultPath),
          occurrenceCount,
        }))
        .sort((a, b) => a.noteRelativePath.localeCompare(b.noteRelativePath));
      const referenceCount = noteRefs.reduce((total, ref) => total + ref.occurrenceCount, 0);
      const modifiedAt = entry.modified_at ?? null;
      const createdAt = entry.created_at ?? null;
      const sizeBytes = entry.size ?? null;
      return {
        path,
        name: basename(path),
        relativePath: getRelativePath(path, vaultPath),
        folderPath: directory,
        folderRelativePath: directory === normalizeFilePath(vaultPath) ? "." : getRelativePath(directory, vaultPath),
        extension: extname(path).toLowerCase(),
        sizeBytes,
        modifiedAt,
        createdAt,
        referenceCount,
        referencedBy: noteRefs,
        orphan: noteRefs.length === 0,
        multiReferenced: noteRefs.length > 1 || referenceCount > 1,
        recent: modifiedAt !== null && now - modifiedAt <= RECENT_IMAGE_WINDOW_MS,
        large: sizeBytes !== null && sizeBytes >= LARGE_IMAGE_THRESHOLD_BYTES,
      };
    })
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const totalBytes = images.reduce((total, image) => total + (image.sizeBytes ?? 0), 0);
  const summary: ImageLibrarySummary = {
    totalImages: images.length,
    referencedImages: images.filter((image) => !image.orphan).length,
    orphanImages: images.filter((image) => image.orphan).length,
    multiReferencedImages: images.filter((image) => image.multiReferenced).length,
    recentImages: images.filter((image) => image.recent).length,
    largeImages: images.filter((image) => image.large).length,
    totalBytes,
  };

  return {
    images,
    summary,
    notePaths,
  };
};

export const buildRelativeAssetReference = (
  notePath: string,
  assetPath: string,
  suffix: string = "",
): string => {
  const nextPath = relative(dirname(notePath), assetPath).replace(/\\/g, "/");
  return `${nextPath}${suffix}`;
};

export const planAssetReferenceUpdates = (
  noteSources: NoteContentSource[],
  changes: AssetPathChange[],
): PlannedNoteAssetUpdate[] => {
  if (changes.length === 0) return [];

  const changeMap = new Map(
    changes.map((change) => [normalizeFilePath(change.from), normalizeFilePath(change.to)]),
  );

  const updates: PlannedNoteAssetUpdate[] = [];

  for (const note of noteSources) {
    const occurrenceMap = new Map<string, number>();
    const updatedContent = rewriteMarkdownAssetLinks(note.content, (url) => {
      const resolved = resolveAssetSourcePath(note.path, url);
      if (!resolved) return null;
      const currentPath = normalizeFilePath(resolved.sourcePath);
      const nextPath = changeMap.get(currentPath);
      if (!nextPath) return null;
      occurrenceMap.set(currentPath, (occurrenceMap.get(currentPath) ?? 0) + 1);
      return buildRelativeAssetReference(note.path, nextPath, resolved.suffix);
    });

    if (updatedContent === note.content || occurrenceMap.size === 0) continue;

    updates.push({
      notePath: note.path,
      originalContent: note.content,
      updatedContent,
      changes: Array.from(occurrenceMap.entries()).map(([from, occurrenceCount]) => ({
        from,
        to: changeMap.get(from)!,
        occurrenceCount,
      })),
    });
  }

  return updates.sort((a, b) => a.notePath.localeCompare(b.notePath));
};
