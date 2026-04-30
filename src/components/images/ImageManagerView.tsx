import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  FolderOpen,
  Grid2X2,
  Image as ImageIcon,
  Layers3,
  List,
  Loader2,
  RefreshCw,
  Search,
  ArrowUpDown,
  FolderTree,
  FileText,
  PencilLine,
  MoveRight,
  X,
  CheckSquare,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Select } from "@/components/ui";
import { reportOperationError } from "@/lib/reportError";
import { useLocaleStore, getCurrentTranslations } from "@/stores/useLocaleStore";
import { useFileStore } from "@/stores/useFileStore";
import {
  type ImageAssetRecord,
  buildImageLibraryIndex,
} from "@/services/assets/imageManager";
import {
  type ImageAssetPreview,
  executeImageAssetChanges,
  previewImageMove,
  previewImageRename,
} from "@/services/assets/imageOperations";
import { readFile } from "@/lib/host";
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

const getStatusOptions = (
  t: ReturnType<typeof getCurrentTranslations>,
): Array<{ value: ImageManagerStatusFilter; label: string }> => [
  { value: "all", label: t.imageManager.statusAll },
  { value: "orphan", label: t.imageManager.statusOrphans },
];

const getSortOptions = (t: ReturnType<typeof getCurrentTranslations>): Array<{ value: ImageManagerSortBy; label: string }> => [
  { value: "modified", label: t.imageManager.sortRecentlyChanged },
  { value: "name", label: t.imageManager.sortName },
  { value: "references", label: t.imageManager.sortReferenceCount },
];

const statusBadgeStyles = {
  orphan: "bg-warning/10 text-warning",
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

const summarizeStatuses = (asset: ImageAssetRecord): string[] => {
  const statuses: string[] = [];
  if (asset.orphan) statuses.push("orphan");
  return statuses;
};

const matchesStatusFilter = (asset: ImageAssetRecord, filter: ImageManagerStatusFilter): boolean => {
  switch (filter) {
    case "referenced":
      return !asset.orphan;
    case "orphan":
      return asset.orphan;
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
  const STATUS_OPTIONS = useMemo(() => getStatusOptions(t), [t]);
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
    detailPanelOpen,
    setViewMode,
    setGroupMode,
    setStatusFilter,
    setFolderFilter,
    setSearchQuery,
    setSortBy,
    setSortOrder,
    setFocusedPath,
    setDetailPanelOpen,
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
      detailPanelOpen: state.detailPanelOpen,
      setViewMode: state.setViewMode,
      setGroupMode: state.setGroupMode,
      setStatusFilter: state.setStatusFilter,
      setFolderFilter: state.setFolderFilter,
      setSearchQuery: state.setSearchQuery,
      setSortBy: state.setSortBy,
      setSortOrder: state.setSortOrder,
      setFocusedPath: state.setFocusedPath,
      setDetailPanelOpen: state.setDetailPanelOpen,
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
    if (statusFilter !== "all" && statusFilter !== "orphan") {
      setStatusFilter("all");
    }
    if (sortBy === "size") {
      setSortBy("modified");
    }
  }, [setSortBy, setStatusFilter, sortBy, statusFilter]);

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
    (selectedImages.length === 1 ? selectedImages[0] : null);

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
      const key = image.orphan ? "orphan" : "referenced";
      groups.set(key, [...(groups.get(key) ?? []), image]);
    }
    return ["orphan", "referenced"]
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
      openFile(path, { preview: true });
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

  const statsSummary = t.imageManager.statsSummary
    .replace("{total}", String(summary.totalImages))
    .replace("{orphans}", String(summary.orphanImages));
  const showScanningState = loading && images.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      {/* Compact header */}
      <div className="flex flex-col gap-2 border-b border-border/60 px-4 py-2.5">
        {/* Row 1: title + stats + view buttons */}
        <div className="flex items-center gap-3">
          <h1 className="shrink-0 text-sm font-semibold tracking-tight">{t.imageManager.title}</h1>
          <span className="min-w-0 truncate text-xs text-muted-foreground">{statsSummary}</span>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button onClick={handleRefresh} className="ui-icon-btn h-8 w-8" title={t.imageManager.refreshLibrary}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={cn("ui-icon-btn h-8 w-8", viewMode === "grid" && "border-primary/30 bg-primary/10 text-primary")}
              title={t.imageManager.gridView}
            >
              <Grid2X2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn("ui-icon-btn h-8 w-8", viewMode === "list" && "border-primary/30 bg-primary/10 text-primary")}
              title={t.imageManager.listView}
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode("group")}
              className={cn("ui-icon-btn h-8 w-8", viewMode === "group" && "border-primary/30 bg-primary/10 text-primary")}
              title={t.imageManager.groupedView}
            >
              <Layers3 className="h-3.5 w-3.5" />
            </button>
            <div className="mx-1 h-4 w-px bg-border/60" />
            <button
              onClick={() => setDetailPanelOpen(!detailPanelOpen)}
              className={cn("ui-icon-btn h-8 w-8", detailPanelOpen && "border-primary/30 bg-primary/10 text-primary")}
              title={detailPanelOpen ? t.imageManager.collapsePanel : t.imageManager.expandPanel}
            >
              {detailPanelOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Row 2: search + filters */}
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t.imageManager.searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as ImageManagerStatusFilter)}
            className="h-8 min-w-[120px] text-xs"
            options={STATUS_OPTIONS}
          />
          <Select
            value={folderFilter}
            onValueChange={(v) => setFolderFilter(v)}
            className="h-8 min-w-[120px] text-xs"
            options={[
              { value: "all", label: t.imageManager.allFolders },
              ...folderOptions.map((folder) => ({
                value: folder,
                label: folder === "." ? t.imageManager.vaultRoot : folder,
              })),
            ]}
          />
          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as ImageManagerSortBy)}
            className="h-8 min-w-[120px] text-xs"
            options={SORT_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
          <button
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            className="ui-icon-btn h-8 w-8"
            title={sortOrder === "asc" ? t.imageManager.sortDescending : t.imageManager.sortAscending}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Row 3 (conditional): group mode toggle */}
        {viewMode === "group" ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setGroupMode("status")}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
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
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                groupMode === "folder"
                  ? "border-primary/35 bg-primary/10 text-primary"
                  : "border-border/60 bg-background/80 text-muted-foreground hover:text-foreground",
              )}
            >
              {t.imageManager.groupByFolder}
            </button>
          </div>
        ) : null}
      </div>

      {/* Main content area */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 h-full">
          <div className="min-h-0 flex-1 overflow-hidden">
            {currentSelection.length > 1 ? (
              <div className="border-b border-border/60 bg-muted/20 px-4 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-md bg-background px-2.5 py-1 text-xs font-medium">
                    <CheckSquare className="h-4 w-4 text-primary" />
                    {t.imageManager.imagesSelected.replace("{count}", String(currentSelection.length))}
                  </span>
                  <button
                    onClick={() => openMoveDialog(currentSelection.map((image) => image.path))}
                    className="rounded-md border border-border/50 bg-background px-2.5 py-1 text-xs hover:bg-accent"
                  >
                    {t.imageManager.moveSelected}
                  </button>
                  <button
                    onClick={() => handleCopyPath(currentSelection.map((image) => image.path))}
                    className="rounded-md border border-border/50 bg-background px-2.5 py-1 text-xs hover:bg-accent"
                  >
                    {t.imageManager.copyPaths}
                  </button>
                  <button
                    onClick={clearSelection}
                    className="rounded-md border border-border/50 bg-background px-2.5 py-1 text-xs hover:bg-accent"
                  >
                    {t.imageManager.clearSelection}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="h-full overflow-auto px-4 py-4">
              {/* Orphan warning banner (inside content area) */}
              {orphanOnlyView ? (
                <div className="mb-4 rounded-xl border border-warning/25 bg-warning/10 px-3 py-2 text-sm text-warning">
                  {t.imageManager.orphanOnlyWarning}
                </div>
              ) : null}

              {!vaultPath ? (
                <EmptyState
                  icon={FolderOpen}
                  title={t.imageManager.emptyVaultTitle}
                  description={t.imageManager.emptyVaultDescription}
                />
              ) : showScanningState ? (
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
                <div className="image-manager-list divide-y divide-border/50 border-t border-border/50">
                  {filteredImages.map((image) => (
                    <ImageListRow
                      key={image.path}
                      image={image}
                      selected={selectedImageSet.has(image.path)}
                      onDimension={(width, height) => handleDimension(image.path, width, height)}
                      onSelect={handleCardClick}
                      onOpenNote={handleOpenNote}
                      onLocate={handleLocateInTree}
                      onRename={openRenameDialog}
                      onMove={(path) => openMoveDialog([path])}
                    />
                  ))}
                </div>
              ) : viewMode === "group" ? (
                <div className="space-y-5">
                  {groupedImages.map((group) => (
                    <section key={group.key} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-sm font-semibold">{group.label}</h2>
                          <p className="text-xs text-muted-foreground">{t.imageManager.imageCount.replace("{count}", String(group.items.length))}</p>
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                        {group.items.map((image) => (
                          <ImageGridCard
                            key={image.path}
                            image={image}
                            selected={selectedImageSet.has(image.path)}
                            onDimension={(width, height) => handleDimension(image.path, width, height)}
                            onSelect={handleCardClick}
                            onLocate={handleLocateInTree}
                            onRename={openRenameDialog}
                            onMove={(path) => openMoveDialog([path])}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                  {filteredImages.map((image) => (
                    <ImageGridCard
                      key={image.path}
                      image={image}
                      selected={selectedImageSet.has(image.path)}
                      onDimension={(width, height) => handleDimension(image.path, width, height)}
                      onSelect={handleCardClick}
                      onLocate={handleLocateInTree}
                      onRename={openRenameDialog}
                      onMove={(path) => openMoveDialog([path])}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Collapsible detail panel */}
          <aside
            className={cn(
              "shrink-0 overflow-hidden border-l border-border/60 bg-muted/15 transition-[width,opacity] duration-200 ease-out",
              detailPanelOpen ? "w-[320px] opacity-100" : "w-0 opacity-0",
            )}
          >
            <div className="flex h-full w-[320px] flex-col overflow-hidden">
              {currentSelection.length > 1 ? (
                <MultiSelectionPanel images={currentSelection} onMove={() => openMoveDialog(currentSelection.map((image) => image.path))} />
              ) : primaryAsset ? (
                <ImageDetailPanel
                  image={primaryAsset}
                  dimensions={dimensions[primaryAsset.path]}
                  onDimension={(width, height) => handleDimension(primaryAsset.path, width, height)}
                  onOpenNote={handleOpenNote}
                  onLocate={handleLocateInTree}
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
            </div>
          </aside>
        </div>
      </div>

      {/* Toast success message */}
      {successMessage ? (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-2 rounded-xl border border-success/25 bg-success/10 px-4 py-2.5 text-sm text-success shadow-elev-2">
          {successMessage}
        </div>
      ) : null}

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
    <div className={cn("flex h-full flex-col items-center justify-center px-6 text-center", compact ? "min-h-[240px]" : "min-h-[360px]")}>
      <div className="mb-3 rounded-full border border-border/60 bg-background/80 p-3 shadow-elev-1">
        <Icon className={cn("h-6 w-6 text-muted-foreground", spinning && "animate-spin")} />
      </div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function StatusBadges({ image, className }: { image: ImageAssetRecord; className?: string }) {
  const { t } = useLocaleStore();
  const statuses = summarizeStatuses(image);
  if (statuses.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {statuses.map((status) => (
        <span
          key={status}
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            statusBadgeStyles[status as keyof typeof statusBadgeStyles],
          )}
        >
          {t.imageManager.badgeOrphan}
        </span>
      ))}
    </div>
  );
}

function CardActions({
  path,
  onLocate,
  onRename,
  onMove,
}: {
  path: string;
  onLocate: (path: string) => void;
  onRename: (path: string) => void;
  onMove: (path: string) => void;
}) {
  const { t } = useLocaleStore();
  const actions = [
    { label: t.imageManager.locateInTree, icon: FolderTree, onClick: onLocate },
    { label: t.imageManager.rename, icon: PencilLine, onClick: onRename },
    { label: t.imageManager.move, icon: MoveRight, onClick: onMove },
  ];

  return (
    <div className="flex items-center gap-0.5 text-muted-foreground">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={(event) => {
            event.stopPropagation();
            void action.onClick(path);
          }}
          className="ui-icon-btn h-7 w-7 hover:text-foreground"
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
  selected,
  onDimension,
  onSelect,
  onLocate,
  onRename,
  onMove,
}: {
  image: ImageAssetRecord;
  selected: boolean;
  onDimension: (width: number, height: number) => void;
  onSelect: (path: string, event?: React.MouseEvent) => void;
  onLocate: (path: string) => void;
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
        "group flex flex-col overflow-hidden rounded-lg border bg-background text-left transition-[border-color,box-shadow] duration-fast ease-out-subtle hover:border-primary/30",
        selected ? "border-primary/40 ring-1 ring-primary/10" : "border-border/60",
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
        <div className="absolute right-2 bottom-2">
          <StatusBadges image={image} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 truncate text-sm font-semibold">{image.name}</h3>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {getCurrentTranslations().imageManager.refs.replace("{count}", String(image.referenceCount))}
          </span>
        </div>
        <div>
          <CardActions
            path={image.path}
            onLocate={onLocate}
            onRename={onRename}
            onMove={onMove}
          />
        </div>
      </div>
    </div>
  );
}

function ImageListRow({
  image,
  selected,
  onDimension,
  onSelect,
  onOpenNote,
  onLocate,
  onRename,
  onMove,
}: {
  image: ImageAssetRecord;
  selected: boolean;
  onDimension: (width: number, height: number) => void;
  onSelect: (path: string, event?: React.MouseEvent) => void;
  onOpenNote: (path: string) => void;
  onLocate: (path: string) => void;
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
        "image-manager-list-grid image-manager-list-row px-4 text-left text-sm transition-colors hover:bg-accent/30",
        selected && "bg-primary/5",
      )}
    >
      <ImageThumbnail
        path={image.path}
        alt={image.name}
        className="h-10 w-12 rounded-lg"
        onDimensions={({ width, height }) => onDimension(width, height)}
      />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{image.name}</div>
        <div className="mt-1">
          <StatusBadges image={image} className="h-5 flex-nowrap overflow-hidden" />
        </div>
      </div>
      <div className="image-manager-list-location min-w-0 text-xs text-muted-foreground">
        <div className="truncate">{image.relativePath}</div>
        <div className="mt-1 truncate">{image.folderRelativePath === "." ? getCurrentTranslations().imageManager.vaultRoot : image.folderRelativePath}</div>
      </div>
      <div className="image-manager-list-refs text-sm">{image.referenceCount}</div>
      <div className="image-manager-list-actions flex items-center gap-1">
        {image.referencedBy[0] ? (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onOpenNote(image.referencedBy[0].notePath);
            }}
            className="ui-icon-btn h-7 w-7"
            title={getCurrentTranslations().imageManager.openNote}
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="sr-only">{getCurrentTranslations().imageManager.openNote}</span>
          </button>
        ) : null}
        <CardActions
          path={image.path}
          onLocate={onLocate}
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
  onLocate,
  onRename,
  onMove,
}: {
  image: ImageAssetRecord;
  dimensions?: { width: number; height: number };
  onDimension: (width: number, height: number) => void;
  onOpenNote: (path: string) => void;
  onLocate: (path: string) => void;
  onRename: (path: string) => void;
  onMove: (path: string) => void;
}) {
  const { t } = useLocaleStore();
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border/60 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t.imageManager.imageDetails}</p>
        <h2 className="mt-2 text-base font-semibold leading-tight">{image.name}</h2>
        <p className="mt-1 break-all text-xs text-muted-foreground">{image.relativePath}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 pt-4">
        <ImageThumbnail
          path={image.path}
          alt={image.name}
          className="aspect-[4/3] w-full rounded-lg bg-muted/20"
          onDimensions={({ width, height }) => onDimension(width, height)}
        />

        <div className="mt-4 space-y-4 pb-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t.imageManager.signals}</h3>
              <StatusBadges image={image} />
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <DetailRow label={t.imageManager.folder} value={image.folderRelativePath === "." ? t.imageManager.vaultRoot : image.folderRelativePath} />
              <DetailRow label={t.imageManager.fileSize} value={formatBytes(image.sizeBytes)} />
              <DetailRow label={t.imageManager.pixelSize} value={dimensions ? `${dimensions.width} × ${dimensions.height}` : t.imageManager.detecting} />
              <DetailRow label={t.imageManager.referenceCount} value={String(image.referenceCount)} />
            </dl>
          </div>

          <div className="border-t border-border/50 pt-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t.imageManager.actions}</h3>
              <button onClick={() => onLocate(image.path)} className="ui-icon-btn h-7 w-7" title={t.imageManager.locateInTree}>
                <FolderTree className="h-3.5 w-3.5" />
                <span className="sr-only">{t.imageManager.locateInTree}</span>
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => onRename(image.path)} className="rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-sm hover:bg-accent">
                {t.imageManager.renameSafely}
              </button>
              <button onClick={() => onMove(image.path)} className="rounded-md border border-border/50 bg-background px-2.5 py-1.5 text-sm hover:bg-accent">
                {t.imageManager.moveSafely}
              </button>
            </div>
          </div>

          <div className="border-t border-border/50 pt-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t.imageManager.referencedByNotes}</h3>
              <span className="text-xs text-muted-foreground">{t.imageManager.noteCount.replace("{count}", String(image.referencedBy.length))}</span>
            </div>
            {image.referencedBy.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-warning/30 bg-warning/10 px-3 py-3 text-sm text-warning">
                {t.imageManager.noReferencesWarning}
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {image.referencedBy.map((note) => (
                  <button
                    key={note.notePath}
                    onClick={() => onOpenNote(note.notePath)}
                    className="flex w-full items-center justify-between rounded-md border border-border/60 bg-background px-3 py-2 text-left hover:bg-accent"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <FileText className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate">{note.noteName}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{note.noteRelativePath}</p>
                    </div>
                    <span className="ml-3 rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                      {t.imageManager.refs.replace("{count}", String(note.occurrenceCount))}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MultiSelectionPanel({ images, onMove }: { images: ImageAssetRecord[]; onMove: () => void }) {
  const { t } = useLocaleStore();
  const orphanCount = images.filter((image) => image.orphan).length;
  return (
    <div className="flex h-full flex-col px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t.imageManager.batchActions}</p>
      <h2 className="mt-2 text-base font-semibold">{t.imageManager.imagesSelected.replace("{count}", String(images.length))}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t.imageManager.batchSummary.replace("{orphanCount}", String(orphanCount))}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={onMove} className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm hover:bg-accent">
          {t.imageManager.moveSelectedSafely}
        </button>
      </div>
      <div className="mt-5 min-h-0 flex-1 space-y-2 overflow-auto">
        {images.map((image) => (
          <div key={image.path} className="rounded-md border border-border/60 bg-background px-3 py-2">
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
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/35 px-4">
      <div className="w-full max-w-2xl rounded-xl border border-border/60 bg-background shadow-ui-float">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
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
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
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
                      <div key={`${change.from}-${change.to}`} className="rounded-md border border-border/60 bg-background px-3 py-2 text-xs">
                        <div className="truncate text-muted-foreground">{change.from}</div>
                        <div className="mt-1 truncate font-medium text-foreground">{change.to}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{t.imageManager.affectedNotes}</h3>
                  {dialog.preview.noteUpdates.length === 0 ? (
                    <div className="mt-2 rounded-md border border-dashed border-border/60 px-3 py-2 text-sm text-muted-foreground">
                      {t.imageManager.noNoteReferencesNeedChange}
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {dialog.preview.noteUpdates.map((note) => (
                        <div key={note.notePath} className="rounded-md border border-border/60 bg-background px-3 py-2 text-xs">
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

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 px-5 py-3.5">
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
