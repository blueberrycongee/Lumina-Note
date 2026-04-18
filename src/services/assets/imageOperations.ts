import type { FileEntry } from "@/lib/host";
import { createDir, exists, readFile, renameFile, saveFile } from "@/lib/host";
import { basename, dirname, extname } from "@/lib/path";
import { useFileStore } from "@/stores/useFileStore";

import {
  type AssetPathChange,
  type NoteContentSource,
  type PlannedNoteAssetUpdate,
  buildImageLibraryIndex,
  isImagePath,
  listMarkdownNotePaths,
  planAssetReferenceUpdates,
} from "./imageManager";

export interface ImageAssetPreview {
  changes: AssetPathChange[];
  noteUpdates: PlannedNoteAssetUpdate[];
  notePaths: string[];
}

export interface ExecuteImageAssetChangesOptions {
  changes: AssetPathChange[];
  noteUpdates: PlannedNoteAssetUpdate[];
  renameFileFn?: typeof renameFile;
  saveFileFn?: typeof saveFile;
  createDirFn?: typeof createDir;
  refreshFileTree?: () => Promise<void>;
  reloadFileIfOpen?: (path: string) => Promise<void>;
}

const normalizePath = (path: string): string => path.replace(/\\/g, "/");

const getOpenNoteContent = (path: string): string | null => {
  const state = useFileStore.getState();
  const normalizedPath = normalizePath(path);

  if (state.currentFile && normalizePath(state.currentFile) === normalizedPath) {
    return state.currentContent;
  }

  const tab = state.tabs.find(
    (item) =>
      item.type === "file" &&
      item.path &&
      normalizePath(item.path) === normalizedPath,
  );
  return tab?.content ?? null;
};

export const loadWorkspaceNoteSources = async (
  fileTree: FileEntry[],
  readNoteFn: typeof readFile = readFile,
): Promise<NoteContentSource[]> => {
  const notePaths = listMarkdownNotePaths(fileTree);
  return Promise.all(
    notePaths.map(async (path) => ({
      path,
      content: getOpenNoteContent(path) ?? (await readNoteFn(path)),
    })),
  );
};

export const buildImageRenameTargetPath = (imagePath: string, nextName: string): string => {
  const trimmed = nextName.trim();
  if (!trimmed) {
    throw new Error("Image name cannot be empty");
  }
  const extension = extname(imagePath);
  const normalizedName = trimmed.toLowerCase().endsWith(extension.toLowerCase())
    ? trimmed
    : `${trimmed}${extension}`;
  return `${dirname(imagePath)}/${normalizedName}`.replace(/\\/g, "/");
};

export const buildImageMoveChanges = (imagePaths: string[], targetFolder: string): AssetPathChange[] =>
  imagePaths.map((imagePath) => ({
    from: normalizePath(imagePath),
    to: `${normalizePath(targetFolder)}/${basename(imagePath)}`,
  }));

export const previewImageAssetChanges = async (
  fileTree: FileEntry[],
  changes: AssetPathChange[],
  readNoteFn: typeof readFile = readFile,
  existsFn: typeof exists = exists,
): Promise<ImageAssetPreview> => {
  validateImageAssetPaths(changes);
  for (const change of changes) {
    if (await existsFn(change.to)) {
      throw new Error(`Target already exists: ${basename(change.to)}`);
    }
  }
  const noteSources = await loadWorkspaceNoteSources(fileTree, readNoteFn);
  const noteUpdates = planAssetReferenceUpdates(noteSources, changes);
  return {
    changes,
    noteUpdates,
    notePaths: noteSources.map((note) => note.path),
  };
};

async function rollbackSavedNotes(
  savedNotes: PlannedNoteAssetUpdate[],
  saveFileFn: typeof saveFile,
): Promise<void> {
  for (const note of [...savedNotes].reverse()) {
    await saveFileFn(note.notePath, note.originalContent);
  }
}

async function rollbackPathChanges(
  changes: AssetPathChange[],
  renameFileFn: typeof renameFile,
): Promise<void> {
  for (const change of [...changes].reverse()) {
    await renameFileFn(change.to, change.from);
  }
}

export const executeImageAssetChanges = async ({
  changes,
  noteUpdates,
  renameFileFn = renameFile,
  saveFileFn = saveFile,
  createDirFn = createDir,
  refreshFileTree = useFileStore.getState().refreshFileTree,
  reloadFileIfOpen = useFileStore.getState().reloadFileIfOpen,
}: ExecuteImageAssetChangesOptions): Promise<void> => {
  validateImageAssetPaths(changes);
  const completedChanges: AssetPathChange[] = [];
  const savedNotes: PlannedNoteAssetUpdate[] = [];

  try {
    for (const change of changes) {
      const targetDir = dirname(change.to);
      if (targetDir !== dirname(change.from)) {
        await createDirFn(targetDir);
      }
      await renameFileFn(change.from, change.to);
      completedChanges.push(change);
    }

    for (const note of noteUpdates) {
      await saveFileFn(note.notePath, note.updatedContent);
      savedNotes.push(note);
    }
  } catch (error) {
    const rollbackErrors: string[] = [];

    try {
      await rollbackSavedNotes(savedNotes, saveFileFn);
    } catch (rollbackError) {
      rollbackErrors.push(
        `note rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
      );
    }

    try {
      await rollbackPathChanges(completedChanges, renameFileFn);
    } catch (rollbackError) {
      rollbackErrors.push(
        `file rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
      );
    }

    const baseMessage = error instanceof Error ? error.message : String(error);
    if (rollbackErrors.length > 0) {
      throw new Error(`${baseMessage} (${rollbackErrors.join("; ")})`);
    }
    throw error;
  }

  await refreshFileTree();
  await Promise.all(noteUpdates.map((note) => reloadFileIfOpen(note.notePath)));
};

export const previewImageRename = async (
  fileTree: FileEntry[],
  imagePath: string,
  nextName: string,
  readNoteFn: typeof readFile = readFile,
  existsFn: typeof exists = exists,
): Promise<ImageAssetPreview> => {
  const targetPath = buildImageRenameTargetPath(imagePath, nextName);
  return previewImageAssetChanges(fileTree, [{ from: normalizePath(imagePath), to: targetPath }], readNoteFn, existsFn);
};

export const previewImageMove = async (
  fileTree: FileEntry[],
  imagePaths: string[],
  targetFolder: string,
  readNoteFn: typeof readFile = readFile,
  existsFn: typeof exists = exists,
): Promise<ImageAssetPreview> =>
  previewImageAssetChanges(fileTree, buildImageMoveChanges(imagePaths, targetFolder), readNoteFn, existsFn);

export const executeImageRename = async (
  fileTree: FileEntry[],
  imagePath: string,
  nextName: string,
  readNoteFn: typeof readFile = readFile,
): Promise<ImageAssetPreview> => {
  const preview = await previewImageRename(fileTree, imagePath, nextName, readNoteFn);
  await executeImageAssetChanges(preview);
  return preview;
};

export const executeImageMove = async (
  fileTree: FileEntry[],
  imagePaths: string[],
  targetFolder: string,
  readNoteFn: typeof readFile = readFile,
): Promise<ImageAssetPreview> => {
  const preview = await previewImageMove(fileTree, imagePaths, targetFolder, readNoteFn);
  await executeImageAssetChanges(preview);
  return preview;
};

export const validateImageAssetPaths = (changes: AssetPathChange[]): void => {
  const nextPaths = new Set<string>();
  for (const change of changes) {
    if (!isImagePath(change.from) || !isImagePath(change.to)) {
      throw new Error("Only image files can be managed here");
    }
    if (normalizePath(change.from) === normalizePath(change.to)) {
      throw new Error("Source and target image paths must be different");
    }
    if (nextPaths.has(normalizePath(change.to))) {
      throw new Error("Target image paths must be unique");
    }
    nextPaths.add(normalizePath(change.to));
  }
};

export const buildImagePreviewIndex = async (
  fileTree: FileEntry[],
  vaultPath: string,
  readNoteFn: typeof readFile = readFile,
) => buildImageLibraryIndex(fileTree, vaultPath, readNoteFn);
