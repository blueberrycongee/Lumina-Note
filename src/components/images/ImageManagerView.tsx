import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Copy,
  ExternalLink,
  FolderOpen,
  Grid2X2,
  Image as ImageIcon,
  Layers3,
  List,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  ArrowUpDown,
  FolderTree,
  Images,
  ScanSearch,
  FileText,
  PencilLine,
  MoveRight,
  X,
  CheckSquare,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { showInExplorer } from "@/lib/tauri";
import { reportOperationError } from "@/lib/reportError";
import { useLocaleStore, getCurrentTranslations } from "@/stores/useLocaleStore";
import { useFileStore } from "@/stores/useFileStore";
import {
  type ImageAssetRecord,
  LARGE_IMAGE_THRESHOLD_BYTES,
  buildImageLibraryIndex,
} from "@/services/assets/imageManager";
import {
  type ImageAssetPreview,
  executeImageAssetChanges,
  previewImageMove,
  previewImageRename,
} from "@/services/assets/imageOperations";
import { readFile } from "@/lib/tauri";
import {
  type ImageManagerSortBy,
  type ImageManagerStatusFilter,
  useImageManagerStore,
} from "@/stores/useImageManagerStore";

import { ImageThumbnail } from "./ImageThumbnail";

type ActionDialogState =
  | {
      kind: "rename";
      path: string;
      value: string;
      preview: ImageAssetPreview | null;
      preparing: boolean;
      executing: boolean;
    }
  | {
      kind: "move";
      paths: string[];
      value: string;
      preview: ImageAssetPreview | null;
      preparing: boolean;
      executing: boolean;
    };

const getStatusLabels = (t: ReturnType<typeof getCurrentTranslations>): Record<ImageManagerStatusFilter, string> => ({
  all: t.imageManager.statusAll,
  referenced: t.imageManager.statusReferenced,
  orphan: t.imageManager.statusOrphans,
  multi: t.imageManager.statusMultiUsed,
  recent: t.imageManager.statusRecent,
  large: t.imageManager.statusLarge,
});

const getSortOptions = (t: ReturnType<typeof getCurrentTranslations>): Array<{ value: ImageManagerSortBy; label: string }> => [
  { value: "modified", label: t.imageManager.sortRecentlyChanged },
  { value: "name", label: t.imageManager.sortName },
  { value: "size", label: t.imageManager.sortFileSize },
  { value: "references", label: t.imageManager.sortReferenceCount },
];

const statusBadgeStyles = {
  orphan: "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  referenced: "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  multi: "border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  recent: "border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  large: "border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300",
} as const;

const formatBytes = (bytes: number | null): string => {
  if (bytes === null) return getCurrentTranslations().imageManager.unknown;
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
};

const formatDate = (timestamp: number | null): string => {
  if (!timestamp) return getCurrentTranslations().imageManager.unknown;
  return new Date(timestamp).toLocaleString();
};

const summarizeStatuses = (asset: ImageAssetRecord): string[] => {
  const statuses: string[] = [];
  if (asset.orphan) {
    statuses.push("orphan");
  } else {
    statuses.push("referenced");
  }
  if (asset.multiReferenced) statuses.push("multi");
  if (asset.recent) statuses.push("recent");
  if (asset.large) statuses.push("large");
  return statuses;
};

const matchesStatusFilter = (asset: ImageAssetRecord, filter: ImageManagerStatusFilter): boolean => {
  switch (filter) {
    case "referenced":
      return !asset.orphan;
    case "orphan":
      return asset.orphan;
    case "multi":
      return asset.multiReferenced;
    case "recent":
      return asset.recent;
    case "large":
      return asset.large;
    default:
      return true;
  }
};

const compareValues = (
  left: ImageAssetRecord,
  right: ImageAssetRecord,
  sortBy: ImageManagerSortBy,
): number => {
  switch (sortBy) {
    case "name":
      return left.name.localeCompare(right.name);
    case "size":
      return (left.sizeBytes ?? -1) - (right.sizeBytes ?? -1);
    case "references":
      return left.referenceCount - right.referenceCount;
    case "modified":
    default:
      return (left.modifiedAt ?? 0) - (right.modifiedAt ?? 0);
  }
};

const groupStatusLabel = (key: string): string => {
  const t = getCurrentTranslations();
  switch (key) {
    case "orphan":
      return t.imageManager.groupNeedsCleanup;
    case "multi":
      return t.imageManager.groupLinkedFromMultipleNotes;
    case "large":
      return t.imageManager.groupLargeFiles.replace("{threshold}", formatBytes(LARGE_IMAGE_THRESHOLD_BYTES));
    case "recent":
      return t.imageManager.groupRecentlyAdded;
    default:
      return t.imageManager.groupReferenced;
  }
};

const resolveVaultFolderInput = (vaultPath: string, value: string): string => {
  const trimmed = value.trim();
  if (!trimmed || trimmed === ".") return vaultPath;
  if (trimmed.startsWith("/") || /^[A-Za-z]:/.test(trimmed)) return trimmed;
  return `${vaultPath}/${trimmed}`.replace(/\/+/g, "/");
};

export function ImageManagerView() {
  const { t } = useLocaleStore();
  const STATUS_LABELS = useMemo(() => getStatusLabels(t), [t]);
  const SORT_OPTIONS = useMemo(() => getSortOptions(t), [t]);
  const { vaultPath, fileTree, openFile, refreshFileTree } = useFileStore(
    useShallow((state) => ({
      vaultPath: state.vaultPath,
      fileTree: state.fileTree,
      openFile: state.openFile,
      refreshFileTree: state.refreshFileTree,
    })),
  );
  const {
    viewMode,
    groupMode,
    statusFilter,
    folderFilter,
    searchQuery,
    sortBy,
    sortOrder,
    selectedPaths,
    focusedPath,
    setViewMode,
    setGroupMode,
    setStatusFilter,
    setFolderFilter,
    setSearchQuery,
    setSortBy,
    setSortOrder,
    setFocusedPath,
    toggleSelection,
    replaceSelection,
    clearSelection,
  } = useImageManagerStore(
    useShallow((state) => ({
      viewMode: state.viewMode,
      groupMode: state.groupMode,
      statusFilter: state.statusFilter,
      folderFilter: state.folderFilter,
      searchQuery: state.searchQuery,
      sortBy: state.sortBy,
      sortOrder: state.sortOrder,
      selectedPaths: state.selectedPaths,
      focusedPath: state.focusedPath,
      setViewMode: state.setViewMode,
      setGroupMode: state.setGroupMode,
      setStatusFilter: state.setStatusFilter,
      setFolderFilter: state.setFolderFilter,
      setSearchQuery: state.setSearchQuery,
      setSortBy: state.setSortBy,
      setSortOrder: state.setSortOrder,
      setFocusedPath: state.setFocusedPath,
      toggleSelection: state.toggleSelection,
      replaceSelection: state.replaceSelection,
      clearSelection: state.clearSelection,
    })),
  );
  const deferredSearch = useDeferredValue(searchQuery);
  const [dimensions, setDimensions] = useState<Record<string, { width: number; height: number }>>({});
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<ImageAssetRecord[]>([]);
  const [summary, setSummary] = useState({
    totalImages: 0,
    referencedImages: 0,
    orphanImages: 0,
    multiReferencedImages: 0,
    recentImages: 0,
    largeImages: 0,
    totalBytes: 0,
  });
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ActionDialogState | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    if (!successMessage) return undefined;
    const timer = window.setTimeout(() => setSuccessMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  useEffect(() => {
    let cancelled = false;
    if (!vaultPath) {
      setImages([]);
      setSummary({
        totalImages: 0,
        referencedImages: 0,
        orphanImages: 0,
        multiReferencedImages: 0,
        recentImages: 0,
        largeImages: 0,
        totalBytes: 0,
      });
      return undefined;
    }

    setLoading(true);
    buildImageLibraryIndex(fileTree, vaultPath, async (path) => {
      const active = useFileStore.getState();
      if (active.currentFile === path) return active.currentContent;
      const openTab = active.tabs.find((tab) => tab.type === "file" && tab.path === path);
      return openTab?.content ?? readFile(path);
    })
      .then((index) => {
        if (cancelled) return;
        setImages(index.images);
        setSummary(index.summary);
      })
      .catch((error) => {
        if (cancelled) return;
        reportOperationError({
          source: "ImageManagerView.useEffect",
          action: "Build image library index",
          error,
        });
        setImages([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fileTree, refreshNonce, vaultPath]);

  useEffect(() => {
    if (selectedPaths.length === 0) return;
    const existing = new Set(images.map((image) => image.path));
    const nextSelection = selectedPaths.filter((path) => existing.has(path));
    if (nextSelection.length !== selectedPaths.length) {
      replaceSelection(nextSelection);
    }
  }, [images, replaceSelection, selectedPaths]);

  const folderOptions = useMemo(() => {
    const folders = Array.from(new Set(images.map((image) => image.folderRelativePath))).sort((a, b) =>
      a.localeCompare(b),
    );
    return folders;
  }, [images]);

  const filteredImages = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    const next = images.filter((image) => {
      if (!matchesStatusFilter(image, statusFilter)) return false;
      if (folderFilter !== "all" && image.folderRelativePath !== folderFilter) return false;
      if (!query) return true;
      const haystacks = [
        image.name,
        image.relativePath,
        image.folderRelativePath,
        ...image.referencedBy.map((note) => note.noteName),
        ...image.referencedBy.map((note) => note.noteRelativePath),
      ];
      return haystacks.some((value) => value.toLowerCase().includes(query));
    });

    return next.sort((left, right) => {
      const diff = compareValues(left, right, sortBy);
      return sortOrder === "asc" ? diff : -diff;
    });
  }, [deferredSearch, folderFilter, images, sortBy, sortOrder, statusFilter]);

  const selectedImageSet = useMemo(() => new Set(selectedPaths), [selectedPaths]);
  const selectedImages = useMemo(
    () => images.filter((image) => selectedImageSet.has(image.path)),
    [images, selectedImageSet],
  );
  const primaryAsset =
    (focusedPath && filteredImages.find((image) => image.path === focusedPath)) ??
    (selectedImages.length === 1 ? selectedImages[0] : null) ??
    (selectedImages.length === 0 ? filteredImages[0] ?? null : null);

  const groupedImages = useMemo(() => {
    if (viewMode !== "group") return [];

    if (groupMode === "folder") {
      const groups = new Map<string, ImageAssetRecord[]>();
      for (const image of filteredImages) {
        const key = image.folderRelativePath;
        groups.set(key, [...(groups.get(key) ?? []), image]);
      }
      return Array.from(groups.entries()).map(([key, items]) => ({
        key,
        label: key === "." ? getCurrentTranslations().imageManager.vaultRoot : key,
        items,
      }));
    }

    const groups = new Map<string, ImageAssetRecord[]>();
    for (const image of filteredImages) {
      const key = image.orphan
        ? "orphan"
        : image.multiReferenced
          ? "multi"
          : image.large
            ? "large"
            : image.recent
              ? "recent"
              : "referenced";
      groups.set(key, [...(groups.get(key) ?? []), image]);
    }
    return ["orphan", "multi", "large", "recent", "referenced"]
      .filter((key) => groups.has(key))
      .map((key) => ({
        key,
        label: groupStatusLabel(key),
        items: groups.get(key) ?? [],
      }));
  }, [filteredImages, groupMode, viewMode]);

  const handleDimension = useCallback((path: string, width: number, height: number) => {
    if (!width || !height) return;
    setDimensions((current) => {
      const existing = current[path];
      if (existing?.width === width && existing?.height === height) {
        return current;
      }
      return {
        ...current,
        [path]: { width, height },
      };
    });
  }, []);

  const handleCardClick = useCallback(
    (path: string, event?: React.MouseEvent) => {
      const additive = Boolean(event?.metaKey || event?.ctrlKey);
      toggleSelection(path, additive);
      setFocusedPath(path);
    },
    [setFocusedPath, toggleSelection],
  );

  const handleOpenNote = useCallback(
    (path: string) => {
      openFile(path);
    },
    [openFile],
  );

  const handleCopyPath = useCallback(async (path: string | string[]) => {
    const payload = Array.isArray(path) ? path.join("\n") : path;
    try {
      await navigator.clipboard.writeText(payload);
      setSuccessMessage(Array.isArray(path) ? t.imageManager.copiedPaths : t.imageManager.copiedPath);
    } catch (error) {
      reportOperationError({
        source: "ImageManagerView.handleCopyPath",
        action: "Copy image path",
        error,
        level: "warning",
      });
    }
  }, []);

  const handleLocateInTree = useCallback((path: string) => {
    window.dispatchEvent(new CustomEvent("lumina-focus-file-tree-path", { detail: { path } }));
    setSuccessMessage(t.imageManager.focusedInTree);
  }, []);

  const handleReveal = useCallback(async (path: string) => {
    try {
      await showInExplorer(path);
    } catch (error) {
      reportOperationError({
        source: "ImageManagerView.handleReveal",
        action: "Reveal image in file manager",
        error,
        level: "warning",
      });
    }
  }, []);

  const openRenameDialog = useCallback((path: string) => {
    const asset = images.find((image) => image.path === path);
    if (!asset) return;
    setDialog({
      kind: "rename",
      path,
      value: asset.name.replace(asset.extension, ""),
      preview: null,
      preparing: false,
      executing: false,
    });
  }, [images]);

  const openMoveDialog = useCallback((paths: string[]) => {
    const first = images.find((image) => image.path === paths[0]);
    setDialog({
      kind: "move",
      paths,
      value: first?.folderRelativePath === "." ? "" : first?.folderRelativePath ?? "",
      preview: null,
      preparing: false,
      executing: false,
    });
  }, [images]);

  const closeDialog = useCallback(() => setDialog(null), []);

  const prepareDialogPreview = useCallback(async () => {
    if (!vaultPath || !dialog) return;
    setDialog((current) => (current ? { ...current, preparing: true } : current));

    try {
      const preview =
        dialog.kind === "rename"
          ? await previewImageRename(fileTree, dialog.path, dialog.value)
          : await previewImageMove(
              fileTree,
              dialog.paths,
              resolveVaultFolderInput(vaultPath, dialog.value),
            );

      setDialog((current) =>
        current
          ? {
              ...current,
              preview,
              preparing: false,
            }
          : current,
      );
    } catch (error) {
      setDialog((current) => (current ? { ...current, preparing: false } : current));
      reportOperationError({
        source: "ImageManagerView.prepareDialogPreview",
        action: dialog.kind === "rename" ? "Preview image rename" : "Preview image move",
        error,
      });
    }
  }, [dialog, fileTree, vaultPath]);

  const executeDialog = useCallback(async () => {
    if (!dialog?.preview) return;
    setDialog((current) => (current ? { ...current, executing: true } : current));

    try {
      await executeImageAssetChanges(dialog.preview);
      setRefreshNonce((value) => value + 1);
      clearSelection();
      setSuccessMessage(
        dialog.kind === "rename"
          ? t.imageManager.renamedSuccess.replace("{count}", String(dialog.preview.noteUpdates.length))
          : t.imageManager.movedSuccess
              .replace("{imageCount}", String(dialog.preview.changes.length))
              .replace("{noteCount}", String(dialog.preview.noteUpdates.length)),
      );
      setDialog(null);
    } catch (error) {
      setDialog((current) => (current ? { ...current, executing: false } : current));
      reportOperationError({
        source: "ImageManagerView.executeDialog",
        action: dialog.kind === "rename" ? "Rename image" : "Move image",
        error,
      });
    }
  }, [clearSelection, dialog]);

  const handleRefresh = useCallback(async () => {
    await refreshFileTree();
    setRefreshNonce((value) => value + 1);
    setSuccessMessage(t.imageManager.libraryRefreshed);
  }, [refreshFileTree]);

  const currentSelection = selectedImages.length > 0 ? selectedImages : primaryAsset ? [primaryAsset] : [];
  const orphanOnlyView = filteredImages.length > 0 && filteredImages.every((image) => image.orphan);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--background))_0%,hsl(var(--muted)/0.55)_100%)]">
        <div className="flex flex-col gap-5 px-5 py-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                {t.imageManager.badge}
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">{t.imageManager.title}</h1>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  {t.imageManager.description}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={handleRefresh} className="ui-icon-btn h-9 w-9" title={t.imageManager.refreshLibrary}>
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={cn("ui-icon-btn h-9 w-9", viewMode === "grid" && "border-primary/30 bg-primary/10 text-primary")}
                title={t.imageManager.gridView}
              >
                <Grid2X2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={cn("ui-icon-btn h-9 w-9", viewMode === "list" && "border-primary/30 bg-primary/10 text-primary")}
                title={t.imageManager.listView}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("group")}
                className={cn("ui-icon-btn h-9 w-9", viewMode === "group" && "border-primary/30 bg-primary/10 text-primary")}
                title={t.imageManager.groupedView}
              >
                <Layers3 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <SummaryCard icon={Images} label={t.imageManager.statusAll} value={summary.totalImages} detail={formatBytes(summary.totalBytes)} />
            <SummaryCard icon={ScanSearch} label={t.imageManager.statusReferenced} value={summary.referencedImages} detail={t.imageManager.connectedToNotes} />
            <SummaryCard icon={FolderTree} label={t.imageManager.statusOrphans} value={summary.orphanImages} detail={t.imageManager.safeCleanupCandidates} accent="amber" />
            <SummaryCard icon={Layers3} label={t.imageManager.statusMultiUsed} value={summary.multiReferencedImages} detail={t.imageManager.sharedAcrossNotes} accent="sky" />
            <SummaryCard icon={Sparkles} label={t.imageManager.statusRecent} value={summary.recentImages} detail={t.imageManager.changedInLast7Days} accent="violet" />
            <SummaryCard icon={ImageIcon} label={t.imageManager.statusLarge} value={summary.largeImages} detail={`>${formatBytes(LARGE_IMAGE_THRESHOLD_BYTES)}`} accent="rose" />
          </div>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border/60 bg-background/80 px-3 py-2 shadow-sm">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t.imageManager.searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as ImageManagerStatusFilter)}
                className="ui-input h-10 min-w-[148px] bg-background text-sm"
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>

              <select
                value={folderFilter}
                onChange={(event) => setFolderFilter(event.target.value)}
                className="ui-input h-10 min-w-[170px] bg-background text-sm"
              >
                <option value="all">{t.imageManager.allFolders}</option>
                {folderOptions.map((folder) => (
                  <option key={folder} value={folder}>
                    {folder === "." ? t.imageManager.vaultRoot : folder}
                  </option>
                ))}
              </select>

              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as ImageManagerSortBy)}
                className="ui-input h-10 min-w-[170px] bg-background text-sm"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <button
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                className="ui-icon-btn h-10 w-10"
                title={sortOrder === "asc" ? t.imageManager.sortDescending : t.imageManager.sortAscending}
              >
                <ArrowUpDown className="h-4 w-4" />
              </button>
            </div>
          </div>

          {viewMode === "group" ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setGroupMode("status")}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  groupMode === "status"
                    ? "border-primary/35 bg-primary/10 text-primary"
                    : "border-border/60 bg-background/80 text-muted-foreground hover:text-foreground",
                )}
              >
                {t.imageManager.groupByStatus}
              </button>
              <button
                onClick={() => setGroupMode("folder")}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  groupMode === "folder"
                    ? "border-primary/35 bg-primary/10 text-primary"
                    : "border-border/60 bg-background/80 text-muted-foreground hover:text-foreground",
                )}
              >
                {t.imageManager.groupByFolder}
              </button>
            </div>
          ) : null}

          {successMessage ? (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              {successMessage}
            </div>
          ) : null}

          {orphanOnlyView ? (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
              {t.imageManager.orphanOnlyWarning}
            </div>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full flex-col xl:flex-row">
          <div className="min-h-0 flex-1 overflow-hidden">
            {currentSelection.length > 1 ? (
              <div className="border-b border-border/60 bg-muted/25 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-sm font-medium">
                    <CheckSquare className="h-4 w-4 text-primary" />
                    {t.imageManager.imagesSelected.replace("{count}", String(currentSelection.length))}
                  </span>
                  <button
                    onClick={() => openMoveDialog(currentSelection.map((image) => image.path))}
                    className="rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm hover:bg-accent"
                  >
                    {t.imageManager.moveSelected}
                  </button>
                  <button
                    onClick={() => handleCopyPath(currentSelection.map((image) => image.path))}
                    className="rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm hover:bg-accent"
                  >
                    {t.imageManager.copyPaths}
                  </button>
                  <button
                    onClick={clearSelection}
                    className="rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm hover:bg-accent"
                  >
                    {t.imageManager.clearSelection}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="h-full overflow-auto px-4 py-4">
              {!vaultPath ? (
                <EmptyState
                  icon={FolderOpen}
                  title={t.imageManager.emptyVaultTitle}
                  description={t.imageManager.emptyVaultDescription}
                />
              ) : loading ? (
                <EmptyState
                  icon={Loader2}
                  title={t.imageManager.scanningTitle}
                  description={t.imageManager.scanningDescription}
                  spinning
                />
              ) : images.length === 0 ? (
                <EmptyState
                  icon={ImageIcon}
                  title={t.imageManager.noImagesTitle}
                  description={t.imageManager.noImagesDescription}
                />
              ) : filteredImages.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title={t.imageManager.noMatchTitle}
                  description={t.imageManager.noMatchDescription}
                />
              ) : viewMode === "list" ? (
                <div className="overflow-hidden rounded-2xl border border-border/60 bg-background shadow-sm">
                  <div className="grid grid-cols-[56px_minmax(0,1.4fr)_minmax(0,1.1fr)_110px_110px_190px_180px] gap-3 border-b border-border/60 px-4 py-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    <span>{t.imageManager.columnPreview}</span>
                    <span>{t.imageManager.columnFile}</span>
                    <span>{t.imageManager.columnLocation}</span>
                    <span>{t.imageManager.columnRefs}</span>
                    <span>{t.imageManager.columnSize}</span>
                    <span>{t.imageManager.columnChanged}</span>
                    <span>{t.imageManager.columnActions}</span>
                  </div>
                  {filteredImages.map((image) => (
                    <ImageListRow
                      key={image.path}
                      image={image}
                      dimensions={dimensions[image.path]}
                      selected={selectedImageSet.has(image.path)}
                      onDimension={(width, height) => handleDimension(image.path, width, height)}
                      onSelect={handleCardClick}
                      onOpenNote={handleOpenNote}
                      onCopyPath={handleCopyPath}
                      onLocate={handleLocateInTree}
                      onReveal={handleReveal}
                      onRename={openRenameDialog}
                      onMove={(path) => openMoveDialog([path])}
                    />
                  ))}
                </div>
              ) : viewMode === "group" ? (
                <div className="space-y-6">
                  {groupedImages.map((group) => (
                    <section key={group.key} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-sm font-semibold">{group.label}</h2>
                          <p className="text-xs text-muted-foreground">{t.imageManager.imageCount.replace("{count}", String(group.items.length))}</p>
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                        {group.items.map((image) => (
                          <ImageGridCard
                            key={image.path}
                            image={image}
                            dimensions={dimensions[image.path]}
                            selected={selectedImageSet.has(image.path)}
                            onDimension={(width, height) => handleDimension(image.path, width, height)}
                            onSelect={handleCardClick}
                            onCopyPath={handleCopyPath}
                            onLocate={handleLocateInTree}
                            onReveal={handleReveal}
                            onRename={openRenameDialog}
                            onMove={(path) => openMoveDialog([path])}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                  {filteredImages.map((image) => (
                    <ImageGridCard
                      key={image.path}
                      image={image}
                      dimensions={dimensions[image.path]}
                      selected={selectedImageSet.has(image.path)}
                      onDimension={(width, height) => handleDimension(image.path, width, height)}
                      onSelect={handleCardClick}
                      onCopyPath={handleCopyPath}
                      onLocate={handleLocateInTree}
                      onReveal={handleReveal}
                      onRename={openRenameDialog}
                      onMove={(path) => openMoveDialog([path])}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <aside className="w-full border-t border-border/60 bg-muted/15 xl:w-[360px] xl:border-l xl:border-t-0">
            {currentSelection.length > 1 ? (
              <MultiSelectionPanel images={currentSelection} onMove={() => openMoveDialog(currentSelection.map((image) => image.path))} />
            ) : primaryAsset ? (
              <ImageDetailPanel
                image={primaryAsset}
                dimensions={dimensions[primaryAsset.path]}
                onDimension={(width, height) => handleDimension(primaryAsset.path, width, height)}
                onOpenNote={handleOpenNote}
                onCopyPath={handleCopyPath}
                onLocate={handleLocateInTree}
                onReveal={handleReveal}
                onRename={openRenameDialog}
                onMove={(path) => openMoveDialog([path])}
              />
            ) : (
              <EmptyState
                icon={ImageIcon}
                title={t.imageManager.selectImageTitle}
                description={t.imageManager.selectImageDescription}
                compact
              />
            )}
          </aside>
        </div>
      </div>

      {dialog ? (
        <ActionDialog
          dialog={dialog}
          folderOptions={folderOptions}
          onChangeValue={(value) =>
            setDialog((current) => (current ? { ...current, value, preview: null } : current))
          }
          onClose={closeDialog}
          onPrepare={prepareDialogPreview}
          onExecute={executeDialog}
        />
      ) : null}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
  accent,
}: {
  icon: typeof Images;
  label: string;
  value: number;
  detail: string;
  accent?: "amber" | "sky" | "violet" | "rose";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm",
        accent === "amber" && "border-amber-500/20 bg-amber-500/5",
        accent === "sky" && "border-sky-500/20 bg-sky-500/5",
        accent === "violet" && "border-violet-500/20 bg-violet-500/5",
        accent === "rose" && "border-rose-500/20 bg-rose-500/5",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  spinning = false,
  compact = false,
}: {
  icon: typeof Loader2;
  title: string;
  description: string;
  spinning?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex h-full flex-col items-center justify-center px-6 text-center", compact ? "min-h-[320px]" : "min-h-[420px]")}>
      <div className="mb-4 rounded-full border border-border/60 bg-background/80 p-4 shadow-sm">
        <Icon className={cn("h-7 w-7 text-muted-foreground", spinning && "animate-spin")} />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function StatusBadges({ image }: { image: ImageAssetRecord }) {
  const { t } = useLocaleStore();
  const statuses = summarizeStatuses(image);
  return (
    <div className="flex flex-wrap gap-1.5">
      {statuses.map((status) => (
        <span
          key={status}
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px] font-medium",
            statusBadgeStyles[status as keyof typeof statusBadgeStyles],
          )}
        >
          {status === "orphan"
            ? t.imageManager.badgeOrphan
            : status === "referenced"
              ? t.imageManager.badgeReferenced
              : status === "multi"
                ? t.imageManager.badgeMulti
                : status === "recent"
                  ? t.imageManager.badgeRecent
                  : t.imageManager.badgeLarge}
        </span>
      ))}
    </div>
  );
}

function CardActions({
  path,
  onCopyPath,
  onLocate,
  onReveal,
  onRename,
  onMove,
}: {
  path: string;
  onCopyPath: (path: string) => void | Promise<void>;
  onLocate: (path: string) => void;
  onReveal: (path: string) => void;
  onRename: (path: string) => void;
  onMove: (path: string) => void;
}) {
  const { t } = useLocaleStore();
  const actions = [
    { label: t.imageManager.copyPath, icon: Copy, onClick: onCopyPath },
    { label: t.imageManager.locateInTree, icon: FolderTree, onClick: onLocate },
    { label: t.imageManager.revealInFinder, icon: ExternalLink, onClick: onReveal },
    { label: t.imageManager.rename, icon: PencilLine, onClick: onRename },
    { label: t.imageManager.move, icon: MoveRight, onClick: onMove },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={(event) => {
            event.stopPropagation();
            void action.onClick(path);
          }}
          className="ui-icon-btn h-8 w-8"
          title={action.label}
        >
          <action.icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}

function ImageGridCard({
  image,
  dimensions,
  selected,
  onDimension,
  onSelect,
  onCopyPath,
  onLocate,
  onReveal,
  onRename,
  onMove,
}: {
  image: ImageAssetRecord;
  dimensions?: { width: number; height: number };
  selected: boolean;
  onDimension: (width: number, height: number) => void;
  onSelect: (path: string, event?: React.MouseEvent) => void;
  onCopyPath: (path: string) => void | Promise<void>;
  onLocate: (path: string) => void;
  onReveal: (path: string) => void;
  onRename: (path: string) => void;
  onMove: (path: string) => void;
}) {
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onSelect(image.path);
    },
    [image.path, onSelect],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(event) => onSelect(image.path, event)}
      onKeyDown={handleKeyDown}
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border bg-background text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg",
        selected ? "border-primary/40 ring-2 ring-primary/15" : "border-border/60",
      )}
    >
      <div className="relative aspect-[5/3] overflow-hidden bg-muted/20">
        <ImageThumbnail
          path={image.path}
          alt={image.name}
          className="h-full w-full"
          imgClassName="transition-transform duration-300 group-hover:scale-[1.03]"
          onDimensions={({ width, height }) => onDimension(width, height)}
        />
        <div className="absolute left-3 top-3">
          <StatusBadges image={image} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">{image.name}</h3>
              <p className="mt-1 truncate text-xs text-muted-foreground">{image.relativePath}</p>
            </div>
            <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
              {getCurrentTranslations().imageManager.refs.replace("{count}", String(image.referenceCount))}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <span>{getCurrentTranslations().imageManager.sizeLabel.replace("{value}", formatBytes(image.sizeBytes))}</span>
          <span>{dimensions ? `${dimensions.width}×${dimensions.height}` : getCurrentTranslations().imageManager.detectingSize}</span>
          <span className="col-span-2 truncate">{getCurrentTranslations().imageManager.folderLabel.replace("{value}", image.folderRelativePath === "." ? getCurrentTranslations().imageManager.vaultRoot : image.folderRelativePath)}</span>
        </div>
        <CardActions
          path={image.path}
          onCopyPath={onCopyPath}
          onLocate={onLocate}
          onReveal={onReveal}
          onRename={onRename}
          onMove={onMove}
        />
      </div>
    </div>
  );
}

function ImageListRow({
  image,
  dimensions,
  selected,
  onDimension,
  onSelect,
  onOpenNote,
  onCopyPath,
  onLocate,
  onReveal,
  onRename,
  onMove,
}: {
  image: ImageAssetRecord;
  dimensions?: { width: number; height: number };
  selected: boolean;
  onDimension: (width: number, height: number) => void;
  onSelect: (path: string, event?: React.MouseEvent) => void;
  onOpenNote: (path: string) => void;
  onCopyPath: (path: string) => void | Promise<void>;
  onLocate: (path: string) => void;
  onReveal: (path: string) => void;
  onRename: (path: string) => void;
  onMove: (path: string) => void;
}) {
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      onSelect(image.path);
    },
    [image.path, onSelect],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(event) => onSelect(image.path, event)}
      onKeyDown={handleKeyDown}
      className={cn(
        "grid grid-cols-[56px_minmax(0,1.4fr)_minmax(0,1.1fr)_110px_110px_190px_180px] gap-3 border-b border-border/50 px-4 py-3 text-left transition-colors hover:bg-accent/35",
        selected && "bg-primary/5",
      )}
    >
      <ImageThumbnail
        path={image.path}
        alt={image.name}
        className="h-12 w-14 rounded-lg"
        onDimensions={({ width, height }) => onDimension(width, height)}
      />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{image.name}</div>
        <div className="mt-1">
          <StatusBadges image={image} />
        </div>
      </div>
      <div className="min-w-0 text-xs text-muted-foreground">
        <div className="truncate">{image.relativePath}</div>
        <div className="mt-1 truncate">{dimensions ? `${dimensions.width}×${dimensions.height}` : getCurrentTranslations().imageManager.detectingSize}</div>
      </div>
      <div className="text-sm">{image.referenceCount}</div>
      <div className="text-sm">{formatBytes(image.sizeBytes)}</div>
      <div className="text-xs text-muted-foreground">{formatDate(image.modifiedAt)}</div>
      <div className="flex flex-wrap items-center gap-1">
        {image.referencedBy[0] ? (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onOpenNote(image.referencedBy[0].notePath);
            }}
            className="rounded-md border border-border/60 px-2 py-1 text-xs hover:bg-accent"
          >
            {getCurrentTranslations().imageManager.openNote}
          </button>
        ) : null}
        <CardActions
          path={image.path}
          onCopyPath={onCopyPath}
          onLocate={onLocate}
          onReveal={onReveal}
          onRename={onRename}
          onMove={onMove}
        />
      </div>
    </div>
  );
}

function ImageDetailPanel({
  image,
  dimensions,
  onDimension,
  onOpenNote,
  onCopyPath,
  onLocate,
  onReveal,
  onRename,
  onMove,
}: {
  image: ImageAssetRecord;
  dimensions?: { width: number; height: number };
  onDimension: (width: number, height: number) => void;
  onOpenNote: (path: string) => void;
  onCopyPath: (path: string) => void | Promise<void>;
  onLocate: (path: string) => void;
  onReveal: (path: string) => void;
  onRename: (path: string) => void;
  onMove: (path: string) => void;
}) {
  const { t } = useLocaleStore();
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border/60 px-4 py-4">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{t.imageManager.imageDetails}</p>
        <h2 className="mt-2 text-lg font-semibold">{image.name}</h2>
        <p className="mt-1 break-all text-xs text-muted-foreground">{image.relativePath}</p>
      </div>
      <div className="flex-1 overflow-auto px-4 py-4">
        <ImageThumbnail
          path={image.path}
          alt={image.name}
          className="aspect-[4/3] w-full rounded-2xl border border-border/60"
          onDimensions={({ width, height }) => onDimension(width, height)}
        />

        <div className="mt-4 space-y-4">
          <section className="rounded-2xl border border-border/60 bg-background/70 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t.imageManager.signals}</h3>
              <StatusBadges image={image} />
            </div>
            <dl className="mt-3 space-y-2 text-sm">
              <DetailRow label={t.imageManager.folder} value={image.folderRelativePath === "." ? t.imageManager.vaultRoot : image.folderRelativePath} />
              <DetailRow label={t.imageManager.fileSize} value={formatBytes(image.sizeBytes)} />
              <DetailRow label={t.imageManager.pixelSize} value={dimensions ? `${dimensions.width} × ${dimensions.height}` : t.imageManager.detecting} />
              <DetailRow label={t.imageManager.changed} value={formatDate(image.modifiedAt)} />
              <DetailRow label={t.imageManager.created} value={formatDate(image.createdAt)} />
              <DetailRow label={t.imageManager.referenceCount} value={String(image.referenceCount)} />
            </dl>
          </section>

          <section className="rounded-2xl border border-border/60 bg-background/70 p-4">
            <h3 className="text-sm font-semibold">{t.imageManager.actions}</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => onCopyPath(image.path)} className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm hover:bg-accent">
                {t.imageManager.copyPath}
              </button>
              <button onClick={() => onLocate(image.path)} className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm hover:bg-accent">
                {t.imageManager.locateInTree}
              </button>
              <button onClick={() => onReveal(image.path)} className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm hover:bg-accent">
                {t.imageManager.revealInFinder}
              </button>
              <button onClick={() => onRename(image.path)} className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm hover:bg-accent">
                {t.imageManager.renameSafely}
              </button>
              <button onClick={() => onMove(image.path)} className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm hover:bg-accent">
                {t.imageManager.moveSafely}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-border/60 bg-background/70 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t.imageManager.referencedByNotes}</h3>
              <span className="text-xs text-muted-foreground">{t.imageManager.noteCount.replace("{count}", String(image.referencedBy.length))}</span>
            </div>
            {image.referencedBy.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-700 dark:text-amber-300">
                {t.imageManager.noReferencesWarning}
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {image.referencedBy.map((note) => (
                  <button
                    key={note.notePath}
                    onClick={() => onOpenNote(note.notePath)}
                    className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-background px-3 py-3 text-left hover:bg-accent"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <FileText className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate">{note.noteName}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{note.noteRelativePath}</p>
                    </div>
                    <span className="ml-3 rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                      {t.imageManager.refs.replace("{count}", String(note.occurrenceCount))}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function MultiSelectionPanel({ images, onMove }: { images: ImageAssetRecord[]; onMove: () => void }) {
  const { t } = useLocaleStore();
  const totalSize = images.reduce((sum, image) => sum + (image.sizeBytes ?? 0), 0);
  const orphanCount = images.filter((image) => image.orphan).length;
  return (
    <div className="flex h-full flex-col px-4 py-4">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{t.imageManager.batchActions}</p>
      <h2 className="mt-2 text-lg font-semibold">{t.imageManager.imagesSelected.replace("{count}", String(images.length))}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t.imageManager.batchSummary
          .replace("{orphanCount}", String(orphanCount))
          .replace("{multiCount}", String(images.filter((image) => image.multiReferenced).length))
          .replace("{totalSize}", formatBytes(totalSize))}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={onMove} className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm hover:bg-accent">
          {t.imageManager.moveSelectedSafely}
        </button>
      </div>
      <div className="mt-5 space-y-2 overflow-auto">
        {images.map((image) => (
          <div key={image.path} className="rounded-xl border border-border/60 bg-background px-3 py-3">
            <div className="truncate text-sm font-medium">{image.name}</div>
            <div className="mt-1 truncate text-xs text-muted-foreground">{image.relativePath}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function ActionDialog({
  dialog,
  folderOptions,
  onChangeValue,
  onClose,
  onPrepare,
  onExecute,
}: {
  dialog: ActionDialogState;
  folderOptions: string[];
  onChangeValue: (value: string) => void;
  onClose: () => void;
  onPrepare: () => void;
  onExecute: () => void;
}) {
  const { t } = useLocaleStore();
  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-3xl border border-border/60 bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">
              {dialog.kind === "rename" ? t.imageManager.renameImageSafely : t.imageManager.moveImagesSafely.replace("{count}", String(dialog.paths.length))}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {dialog.kind === "rename"
                ? t.imageManager.renameDescription
                : t.imageManager.moveDescription}
            </p>
          </div>
          <button onClick={onClose} className="ui-icon-btn h-9 w-9" title={t.imageManager.closeDialog}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="space-y-2">
            <label className="text-sm font-medium">{dialog.kind === "rename" ? t.imageManager.newFileName : t.imageManager.targetFolder}</label>
            <input
              value={dialog.value}
              onChange={(event) => onChangeValue(event.target.value)}
              list={dialog.kind === "move" ? "image-manager-folder-options" : undefined}
              className="ui-input h-11 w-full"
              placeholder={dialog.kind === "rename" ? "cover-shot" : "assets/images"}
            />
            {dialog.kind === "move" ? (
              <datalist id="image-manager-folder-options">
                {folderOptions
                  .filter((folder) => folder !== ".")
                  .map((folder) => (
                    <option key={folder} value={folder} />
                  ))}
              </datalist>
            ) : null}
          </div>

          {dialog.preview ? (
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-medium text-primary">
                  {t.imageManager.imageFiles.replace("{count}", String(dialog.preview.changes.length))}
                </span>
                <span className="rounded-full border border-border/60 bg-background px-3 py-1 font-medium">
                  {t.imageManager.notesWillBeRewritten.replace("{count}", String(dialog.preview.noteUpdates.length))}
                </span>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold">{t.imageManager.fileChanges}</h3>
                  <div className="mt-2 space-y-2">
                    {dialog.preview.changes.map((change) => (
                      <div key={`${change.from}-${change.to}`} className="rounded-xl border border-border/60 bg-background px-3 py-3 text-xs">
                        <div className="truncate text-muted-foreground">{change.from}</div>
                        <div className="mt-1 truncate font-medium text-foreground">{change.to}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{t.imageManager.affectedNotes}</h3>
                  {dialog.preview.noteUpdates.length === 0 ? (
                    <div className="mt-2 rounded-xl border border-dashed border-border/60 px-3 py-3 text-sm text-muted-foreground">
                      {t.imageManager.noNoteReferencesNeedChange}
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {dialog.preview.noteUpdates.map((note) => (
                        <div key={note.notePath} className="rounded-xl border border-border/60 bg-background px-3 py-3 text-xs">
                          <div className="truncate font-medium text-foreground">{note.notePath}</div>
                          <div className="mt-1 text-muted-foreground">{t.imageManager.referencesUpdated.replace("{count}", String(note.changes.reduce((sum, change) => sum + change.occurrenceCount, 0)))}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-border/60 bg-background px-4 py-2 text-sm hover:bg-accent">
            {t.common.cancel}
          </button>
          {!dialog.preview ? (
            <button
              onClick={onPrepare}
              disabled={dialog.preparing || !dialog.value.trim()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {dialog.preparing ? t.imageManager.preparing : t.imageManager.reviewAffectedNotes}
            </button>
          ) : (
            <button
              onClick={onExecute}
              disabled={dialog.executing}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {dialog.executing ? t.imageManager.applyingChanges : dialog.kind === "rename" ? t.imageManager.confirmRename : t.imageManager.confirmMove}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
