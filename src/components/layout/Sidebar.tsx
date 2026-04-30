import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useFileStore } from "@/stores/useFileStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { getDragData, setDragData } from "@/lib/dragState";
import type { FileEntry } from "@/lib/host";
import { writeBinaryFile, exists } from "@/lib/host";
import { reportOperationError } from "@/lib/reportError";
import { cn, getFileName } from "@/lib/utils";
import { ContextMenu } from "../toolbar/ContextMenu";
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  File,
  Folder,
  FolderOpen,
  Image,
  FileText,
  Shapes,
  Star,
  StarOff,
  Pencil,
  ArrowLeftRight,
  MoreHorizontal,
  Check,
} from "lucide-react";
import { Popover, PopoverContent, PopoverList, Row } from "@/components/ui";
import {
  useFavoriteStore,
  type FavoriteEntry,
  type FavoriteSortMode,
} from "@/stores/useFavoriteStore";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import { useShallow } from "zustand/react/shallow";
import { SIDEBAR_SURFACE_CLASSNAME } from "./sidebarSurface";
import {
  useSidebarFileOperations,
  type CreatingState,
} from "./hooks/useSidebarFileOperations";
import { SidebarHeader } from "./SidebarHeader";
import { useMacTopChromeEnabled } from "./MacTopChrome";
import { SearchSidebar } from "@/components/search/SearchSidebar";
import { useUIStore } from "@/stores/useUIStore";

interface ContextMenuState {
  x: number;
  y: number;
  entry: FileEntry | null;
  isDirectory: boolean;
}

interface RootContextMenuState {
  x: number;
  y: number;
}

interface SidebarProps {
  onSwitchVault?: () => void;
}

const FILE_TREE_ROW_CLASS =
  "ui-tree-row w-full flex items-center gap-1.5 py-1.5 pr-2 transition-colors cursor-pointer select-none rounded-ui-sm";
const FILE_TREE_FILE_ROW_CLASS =
  "ui-tree-row w-full flex items-center gap-1.5 py-1.5 pr-2 transition-colors cursor-grab select-none rounded-ui-sm";
const FILE_TREE_ICON_CLASS = "ui-tree-icon text-muted-foreground shrink-0";
const FILE_TREE_ICON_PASSIVE_CLASS =
  "ui-tree-icon text-muted-foreground shrink-0 pointer-events-none";
const FILE_TREE_LABEL_CLASS =
  "ui-tree-label truncate pointer-events-none";

export function Sidebar({ onSwitchVault }: SidebarProps) {
  const { t } = useLocaleStore();
  const showMacTopChrome = useMacTopChromeEnabled();
  const leftSidebarMode = useUIStore((state) => state.leftSidebarMode);
  const { isLoadingTree } = useFileStore(
    useShallow((state) => ({
      isLoadingTree: state.isLoadingTree,
    })),
  );
  const {
    favorites,
    manualOrder,
    favoriteSortMode,
    setFavoriteSortMode,
    favoritesCollapsed,
    setFavoritesCollapsed,
    moveFavorite,
    toggleFavorite,
    getFavorites,
  } = useFavoriteStore(
    useShallow((state) => ({
      favorites: state.favorites,
      manualOrder: state.manualOrder,
      favoriteSortMode: state.defaultSortMode,
      setFavoriteSortMode: state.setDefaultSortMode,
      favoritesCollapsed: state.collapsed,
      setFavoritesCollapsed: state.setCollapsed,
      moveFavorite: state.moveFavorite,
      toggleFavorite: state.toggleFavorite,
      getFavorites: state.getFavorites,
    })),
  );
  const favoriteEntries = useMemo(
    () => getFavorites(favoriteSortMode),
    [getFavorites, favoriteSortMode, favorites, manualOrder],
  );

  const rehydrateToken = useCloudSyncStore((s) => s.rehydrateToken);
  // Restore token from OS keychain on app startup
  useEffect(() => {
    rehydrateToken();
  }, [rehydrateToken]);

  const ops = useSidebarFileOperations();
  const {
    selectedPath,
    setSelectedPath,
    creating,
    createValue,
    setCreateValue,
    renamingPath,
    setRenamingPath,
    renameValue,
    setRenameValue,
    expandedPaths,
    vaultPath,
    fileTree,
    currentFile,
    openFile,
    refreshFileTree,
    moveFileToFolder,
    moveFolderToFolder,
    handleRename,
    handleStartRootRename,
    handleSelect,
    handlePermanentOpen,
    handleTreeBackgroundClick,
    handleSelectRoot,
    getContextMenuItems,
    getRootContextMenuItems,
    toggleExpanded,
    handleNewFile,
    handleNewDiagram,
    handleNewFolder,
    handleCreateSubmit,
    handleCreateCancel,
    focusTreePath,
  } = ops;

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [rootContextMenu, setRootContextMenu] =
    useState<RootContextMenuState | null>(null);
  const [isRootDragOver, setIsRootDragOver] = useState(false);
  const [isExternalDragOver, setIsExternalDragOver] = useState(false);
  const [isFileTreeScrollActive, setIsFileTreeScrollActive] = useState(false);
  const fileTreeScrollFadeTimerRef = useRef<number | null>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, entry: FileEntry) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        entry,
        isDirectory: entry.is_dir,
      });
    },
    [],
  );

  const handleRootContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!vaultPath) return;
      e.preventDefault();
      e.stopPropagation();
      setSelectedPath(vaultPath);
      setRootContextMenu({
        x: e.clientX,
        y: e.clientY,
      });
    },
    [vaultPath, setSelectedPath],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setRootContextMenu(null);
  }, []);

  // Root drop listener
  useEffect(() => {
    const handleRootDrop = async (e: CustomEvent) => {
      if (!isRootDragOver || !vaultPath) return;
      setIsRootDragOver(false);

      const { sourcePath, isFolder } = e.detail;
      if (!sourcePath) return;

      const normalize = (p: string) => p.replace(/\\/g, "/");
      const normalizedSource = normalize(sourcePath);
      const normalizedVault = normalize(vaultPath);
      const sourceParent = normalizedSource.substring(
        0,
        normalizedSource.lastIndexOf("/"),
      );
      if (sourceParent === normalizedVault) return;

      try {
        if (isFolder) {
          await moveFolderToFolder(sourcePath, vaultPath);
        } else {
          await moveFileToFolder(sourcePath, vaultPath);
        }
      } catch {
        // move actions already report failures in useFileStore
      }
    };

    window.addEventListener(
      "lumina-folder-drop",
      handleRootDrop as unknown as EventListener,
    );
    return () => {
      window.removeEventListener(
        "lumina-folder-drop",
        handleRootDrop as unknown as EventListener,
      );
    };
  }, [isRootDragOver, vaultPath, moveFileToFolder, moveFolderToFolder]);

  // Sync selectedPath with currentFile
  useEffect(() => {
    if (currentFile) {
      setSelectedPath(currentFile);
    }
  }, [currentFile, setSelectedPath]);

  // Focus-path event listener
  useEffect(() => {
    const handleFocusPath = (event: Event) => {
      const customEvent = event as CustomEvent<{ path?: string }>;
      const targetPath = customEvent.detail?.path;
      if (!targetPath) return;
      focusTreePath(targetPath);
    };

    window.addEventListener(
      "lumina-focus-file-tree-path",
      handleFocusPath as EventListener,
    );
    return () => {
      window.removeEventListener(
        "lumina-focus-file-tree-path",
        handleFocusPath as EventListener,
      );
    };
  }, [focusTreePath]);

  useEffect(() => {
    const onNewFile = () => handleNewFile();
    const onNewDiagram = () => handleNewDiagram();
    const onNewFolder = () => handleNewFolder();
    window.addEventListener("sidebar:new-file", onNewFile);
    window.addEventListener("sidebar:new-diagram", onNewDiagram);
    window.addEventListener("sidebar:new-folder", onNewFolder);
    return () => {
      window.removeEventListener("sidebar:new-file", onNewFile);
      window.removeEventListener("sidebar:new-diagram", onNewDiagram);
      window.removeEventListener("sidebar:new-folder", onNewFolder);
    };
  }, [handleNewFile, handleNewDiagram, handleNewFolder]);

  const markFileTreeScrollActive = useCallback(() => {
    setIsFileTreeScrollActive(true);
    if (fileTreeScrollFadeTimerRef.current !== null) {
      window.clearTimeout(fileTreeScrollFadeTimerRef.current);
    }
    fileTreeScrollFadeTimerRef.current = window.setTimeout(() => {
      setIsFileTreeScrollActive(false);
      fileTreeScrollFadeTimerRef.current = null;
    }, 720);
  }, []);

  useEffect(() => {
    return () => {
      if (fileTreeScrollFadeTimerRef.current !== null) {
        window.clearTimeout(fileTreeScrollFadeTimerRef.current);
      }
    };
  }, []);

  // External (OS) file drop — import dropped files into the vault.
  // Internal drag-drop uses a separate mousemove-based system; these
  // HTML5 handlers only fire for genuine OS drags (which carry "Files"
  // in dataTransfer.types).
  const isExternalFileDrag = useCallback((e: React.DragEvent) => {
    return Array.from(e.dataTransfer.types).includes("Files");
  }, []);

  const handleExternalDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!vaultPath || !isExternalFileDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setIsExternalDragOver(true);
    },
    [vaultPath, isExternalFileDrag],
  );

  const handleExternalDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear when the pointer leaves the container itself, not when
    // it crosses into a child element.
    if (e.currentTarget === e.target) {
      setIsExternalDragOver(false);
    }
  }, []);

  const handleExternalDrop = useCallback(
    async (e: React.DragEvent) => {
      if (!vaultPath || !isExternalFileDrag(e)) return;
      e.preventDefault();
      setIsExternalDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      const folderEl = (e.target as HTMLElement | null)?.closest(
        "[data-folder-path]",
      );
      const targetFolder =
        folderEl?.getAttribute("data-folder-path") ?? vaultPath;

      const sep = targetFolder.includes("\\") ? "\\" : "/";
      const join = (folder: string, name: string) =>
        `${folder.replace(/[\\/]+$/, "")}${sep}${name}`;

      const reserveUniqueName = async (
        folder: string,
        rawName: string,
      ): Promise<string> => {
        const dot = rawName.lastIndexOf(".");
        const stem = dot > 0 ? rawName.slice(0, dot) : rawName;
        const ext = dot > 0 ? rawName.slice(dot) : "";
        let candidate = rawName;
        let n = 1;
        while (await exists(join(folder, candidate))) {
          candidate = `${stem} (${n})${ext}`;
          n += 1;
        }
        return candidate;
      };

      for (const file of files) {
        try {
          const safeName = await reserveUniqueName(targetFolder, file.name);
          const buffer = await file.arrayBuffer();
          await writeBinaryFile(
            join(targetFolder, safeName),
            new Uint8Array(buffer),
          );
        } catch (error) {
          reportOperationError({
            source: "Sidebar.externalDrop",
            action: `Import dropped file ${file.name}`,
            error,
          });
        }
      }

      try {
        await refreshFileTree();
      } catch (error) {
        reportOperationError({
          source: "Sidebar.externalDrop",
          action: "Refresh file tree after import",
          error,
          level: "warning",
        });
      }
    },
    [vaultPath, isExternalFileDrag, refreshFileTree],
  );

  if (leftSidebarMode === "search") {
    return (
      <aside className={SIDEBAR_SURFACE_CLASSNAME}>
        <SearchSidebar />
      </aside>
    );
  }

  return (
    <aside className={SIDEBAR_SURFACE_CLASSNAME}>
      {/* Header — hidden on Mac where buttons live in MacLeftPaneTopBar */}
      {!showMacTopChrome && (
        <SidebarHeader
          onNewFile={() => handleNewFile()}
          onNewDiagram={() => handleNewDiagram()}
          onNewFolder={() => handleNewFolder()}
          onRefresh={refreshFileTree}
          isLoadingTree={isLoadingTree}
        />
      )}

      {/* Vault Name - root drop zone */}
      <VaultNameSection
        vaultPath={vaultPath}
        renamingPath={renamingPath}
        renameValue={renameValue}
        setRenameValue={setRenameValue}
        handleRename={handleRename}
        setRenamingPath={setRenamingPath}
        handleStartRootRename={handleStartRootRename}
        handleSelectRoot={handleSelectRoot}
        handleRootContextMenu={handleRootContextMenu}
        isRootDragOver={isRootDragOver}
        setIsRootDragOver={setIsRootDragOver}
        selectedPath={selectedPath}
        onSwitchVault={onSwitchVault}
      />

      <FavoritesSection
        entries={favoriteEntries}
        collapsed={favoritesCollapsed}
        sortMode={favoriteSortMode}
        currentFile={currentFile}
        onCollapsedChange={setFavoritesCollapsed}
        onSortModeChange={setFavoriteSortMode}
        onMoveFavorite={moveFavorite}
        onToggleFavorite={toggleFavorite}
        onOpenFile={openFile}
      />

      {/* File Tree */}
      <div
        className={cn(
          "sidebar-file-tree-scroll flex-1 overflow-auto py-2 px-2",
          "transition-[box-shadow,background-color] duration-fast ease-out-subtle",
          isFileTreeScrollActive && "is-scroll-active",
          isExternalDragOver &&
            "bg-primary/5 ring-2 ring-inset ring-primary/40",
        )}
        onScroll={markFileTreeScrollActive}
        onClick={handleTreeBackgroundClick}
        onDragOver={handleExternalDragOver}
        onDragLeave={handleExternalDragLeave}
        onDrop={handleExternalDrop}
      >
        {/* Root create input */}
        {creating && creating.parentPath === vaultPath && (
          <CreateInputRow
            type={creating.type}
            value={createValue}
            onChange={setCreateValue}
            onSubmit={handleCreateSubmit}
            onCancel={handleCreateCancel}
            level={0}
          />
        )}
        {fileTree.length === 0 && !creating ? (
          <div className="px-4 py-8 text-center text-muted-foreground ui-tree-label">
            {t.file.emptyFolder}
          </div>
        ) : (
          fileTree.map((entry) => (
            <FileTreeItem
              key={entry.path}
              entry={entry}
              currentFile={currentFile}
              selectedPath={selectedPath}
              onSelect={handleSelect}
              onPermanentOpen={handlePermanentOpen}
              onContextMenu={handleContextMenu}
              level={0}
              renamingPath={renamingPath}
              renameValue={renameValue}
              setRenameValue={setRenameValue}
              onRenameSubmit={handleRename}
              onRenameCancel={() => setRenamingPath(null)}
              expandedPaths={expandedPaths}
              toggleExpanded={toggleExpanded}
              creating={creating}
              createValue={createValue}
              setCreateValue={setCreateValue}
              onCreateSubmit={handleCreateSubmit}
              onCreateCancel={handleCreateCancel}
              vaultPath={vaultPath}
            />
          ))
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && contextMenu.entry && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems(contextMenu.entry)}
          onClose={closeContextMenu}
        />
      )}

      {rootContextMenu && (
        <ContextMenu
          x={rootContextMenu.x}
          y={rootContextMenu.y}
          items={getRootContextMenuItems()}
          onClose={closeContextMenu}
        />
      )}
    </aside>
  );
}

// ─── FavoritesSection ───────────────────────────────────────────────────────

interface FavoritesSectionProps {
  entries: FavoriteEntry[];
  collapsed: boolean;
  sortMode: FavoriteSortMode;
  currentFile: string | null;
  onCollapsedChange: (collapsed: boolean) => void;
  onSortModeChange: (mode: FavoriteSortMode) => void;
  onMoveFavorite: (fromIndex: number, toIndex: number) => void;
  onToggleFavorite: (path: string) => void;
  onOpenFile: (path: string) => void;
}

function FavoritesSection({
  entries,
  collapsed,
  sortMode,
  currentFile,
  onCollapsedChange,
  onSortModeChange,
  onMoveFavorite,
  onToggleFavorite,
  onOpenFile,
}: FavoritesSectionProps) {
  const { t } = useLocaleStore();
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuAnchorRef = useRef<HTMLButtonElement | null>(null);

  if (entries.length === 0) return null;

  const sortOptions: { mode: FavoriteSortMode; label: string }[] = [
    { mode: "manual", label: t.favorites.sortManual },
    { mode: "recentAdded", label: t.favorites.sortRecentAdded },
    { mode: "recentOpened", label: t.favorites.sortRecentOpened },
  ];
  const activeSortLabel =
    sortOptions.find((option) => option.mode === sortMode)?.label ??
    t.favorites.sortManual;

  return (
    <section className="px-2 pt-1 pb-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onCollapsedChange(!collapsed)}
          aria-expanded={!collapsed}
          className="group flex min-w-0 flex-1 items-center gap-1.5 rounded-ui-sm px-2 py-1 text-left text-ui-caption font-semibold text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          title={t.favorites.title}
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
          )}
          <Star className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
          <span className="truncate">{t.favorites.title}</span>
          <span className="text-muted-foreground/60">{entries.length}</span>
        </button>
        <button
          ref={sortMenuAnchorRef}
          type="button"
          onClick={() => setSortMenuOpen((open) => !open)}
          className="ui-icon-btn h-6 w-6 shrink-0"
          title={activeSortLabel}
          aria-label={activeSortLabel}
          aria-expanded={sortMenuOpen}
        >
          <MoreHorizontal size={14} />
        </button>
        <Popover
          open={sortMenuOpen}
          onOpenChange={setSortMenuOpen}
          anchor={sortMenuAnchorRef}
        >
          <PopoverContent placement="bottom-end" offset={6} width={160}>
            <PopoverList>
              {sortOptions.map((option) => (
                <Row
                  key={option.mode}
                  role="option"
                  density="compact"
                  title={
                    <span className="text-ui-caption">{option.label}</span>
                  }
                  selected={sortMode === option.mode}
                  trailing={
                    sortMode === option.mode ? <Check size={13} /> : null
                  }
                  onSelect={() => {
                    onSortModeChange(option.mode);
                    setSortMenuOpen(false);
                  }}
                />
              ))}
            </PopoverList>
          </PopoverContent>
        </Popover>
      </div>

      {!collapsed && (
        <div className="mt-1 space-y-0.5">
          {entries.map((entry, index) => (
            <div
              key={entry.path}
              className={cn(
                "ui-tree-row group flex items-center gap-1.5 rounded-ui-sm py-1 pr-1.5 pl-7 transition-colors",
                currentFile === entry.path
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <button
                type="button"
                onClick={() => onOpenFile(entry.path)}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                title={entry.path}
              >
                <FileText className={FILE_TREE_ICON_CLASS} />
                <span className="ui-tree-label truncate">
                  {getFileName(entry.path).replace(/\.md$/i, "")}
                </span>
              </button>
              {sortMode === "manual" && (
                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveFavorite(index, index - 1);
                    }}
                    className="rounded-ui-sm p-0.5 hover:bg-accent disabled:opacity-30"
                    title={t.favorites.moveUp}
                    disabled={index === 0}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveFavorite(index, index + 1);
                    }}
                    className="rounded-ui-sm p-0.5 hover:bg-accent disabled:opacity-30"
                    title={t.favorites.moveDown}
                    disabled={index === entries.length - 1}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(entry.path);
                }}
                className="rounded-ui-sm p-0.5 opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
                title={t.favorites.remove}
              >
                <StarOff className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── CreateInputRow ──────────────────────────────────────────────────────

interface CreateInputRowProps {
  type: "file" | "folder" | "diagram";
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  level: number;
}

function CreateInputRow({
  type,
  value,
  onChange,
  onSubmit,
  onCancel,
  level,
}: CreateInputRowProps) {
  const { t } = useLocaleStore();
  const paddingLeft = 12 + level * 16 + 20;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onSubmit();
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div
      data-file-tree-item="true"
      className="ui-tree-row w-full flex items-center gap-1.5 py-1.5 pr-2 rounded-ui-sm"
      style={{ paddingLeft }}
    >
      {type === "folder" ? (
        <Folder className={FILE_TREE_ICON_CLASS} />
      ) : type === "diagram" ? (
        <Shapes className={FILE_TREE_ICON_CLASS} />
      ) : (
        <File className={FILE_TREE_ICON_CLASS} />
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          setTimeout(() => {
            if (value.trim()) {
              onSubmit();
            } else {
              onCancel();
            }
          }, 100);
        }}
        onKeyDown={handleKeyDown}
        autoFocus
        placeholder={
          type === "folder"
            ? t.file.folderNamePlaceholder
            : t.file.fileNamePlaceholder
        }
        className="flex-1 ui-input h-6 px-1.5"
      />
      {type === "file" && (
        <span className="ui-tree-label text-muted-foreground">.md</span>
      )}
      {type === "diagram" && (
        <span className="ui-tree-label text-muted-foreground">.diagram.json</span>
      )}
    </div>
  );
}

// ─── FileTreeItem ────────────────────────────────────────────────────────

interface FileTreeItemProps {
  entry: FileEntry;
  currentFile: string | null;
  selectedPath: string | null;
  onSelect: (entry: FileEntry) => void;
  onPermanentOpen: (entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, entry: FileEntry) => void;
  level: number;
  renamingPath: string | null;
  renameValue: string;
  setRenameValue: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  expandedPaths: Set<string>;
  toggleExpanded: (path: string) => void;
  creating: CreatingState | null;
  createValue: string;
  setCreateValue: (value: string) => void;
  onCreateSubmit: () => void;
  onCreateCancel: () => void;
  vaultPath: string | null;
}

function FileTreeItem({
  entry,
  currentFile,
  selectedPath,
  onSelect,
  onPermanentOpen,
  onContextMenu,
  level,
  renamingPath,
  renameValue,
  setRenameValue,
  onRenameSubmit,
  onRenameCancel,
  expandedPaths,
  toggleExpanded,
  creating,
  createValue,
  setCreateValue,
  onCreateSubmit,
  onCreateCancel,
  vaultPath,
}: FileTreeItemProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const reduceMotion = useReducedMotion();
  const { moveFileToFolder, moveFolderToFolder } = useFileStore(
    useShallow((state) => ({
      moveFileToFolder: state.moveFileToFolder,
      moveFolderToFolder: state.moveFolderToFolder,
    })),
  );

  const isExpanded = expandedPaths.has(entry.path);
  const isActive = currentFile === entry.path;
  const isSelected = selectedPath === entry.path;
  const isRenaming = renamingPath === entry.path;
  const paddingLeft = 12 + level * 16;

  const selectedIsFile = selectedPath?.toLowerCase().endsWith(".md");
  const showActive =
    (isActive && (!selectedIsFile || selectedPath === currentFile)) ||
    (isSelected && !entry.is_dir);

  const isCreatingHere = creating && creating.parentPath === entry.path;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onRenameSubmit();
    } else if (e.key === "Escape") {
      onRenameCancel();
    }
  };

  const handleFolderMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragData({
      wikiLink: "",
      filePath: entry.path,
      fileName: entry.name,
      isFolder: true,
      startX: e.clientX,
      startY: e.clientY,
      isDragging: false,
    });
  };

  const handleMouseEnter = useCallback(() => {
    const dragData = getDragData();
    if (dragData?.isDragging && entry.is_dir) {
      if (dragData.filePath === entry.path) return;
      const normalize = (p: string) => p.replace(/\\/g, "/");
      if (
        dragData.isFolder &&
        normalize(entry.path).startsWith(normalize(dragData.filePath) + "/")
      )
        return;
      setIsDragOver(true);
    }
  }, [entry.path, entry.is_dir]);

  const handleMouseLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  useEffect(() => {
    const handleFolderDrop = async (e: CustomEvent) => {
      if (!isDragOver) return;
      setIsDragOver(false);

      const { sourcePath, isFolder } = e.detail;
      if (!sourcePath || sourcePath === entry.path) return;

      try {
        if (isFolder) {
          await moveFolderToFolder(sourcePath, entry.path);
        } else {
          await moveFileToFolder(sourcePath, entry.path);
        }
      } catch {
        // move actions already report failures in useFileStore
      }
    };

    window.addEventListener(
      "lumina-folder-drop",
      handleFolderDrop as unknown as EventListener,
    );
    return () => {
      window.removeEventListener(
        "lumina-folder-drop",
        handleFolderDrop as unknown as EventListener,
      );
    };
  }, [isDragOver, entry.path, moveFileToFolder, moveFolderToFolder]);

  if (entry.is_dir) {
    if (isRenaming) {
      return (
        <div
          className="flex items-center gap-1.5 py-1 px-1"
          data-file-tree-item="true"
          style={{ paddingLeft }}
        >
          <ChevronRight className={FILE_TREE_ICON_CLASS} />
          <Folder className={FILE_TREE_ICON_CLASS} />
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={onRenameSubmit}
            onKeyDown={handleKeyDown}
            autoFocus
            className="flex-1 ui-input h-7 px-2 border-primary/60"
          />
        </div>
      );
    }

    return (
      <div>
        <div
          role="button"
          tabIndex={0}
          data-file-tree-item="true"
          data-folder-path={entry.path}
          onMouseDown={handleFolderMouseDown}
          onClick={() => {
            onSelect(entry);
            toggleExpanded(entry.path);
          }}
          onContextMenu={(e) => onContextMenu(e, entry)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              toggleExpanded(entry.path);
            }
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className={cn(
            FILE_TREE_ROW_CLASS,
            isSelected ? "bg-primary/10 text-primary" : "hover:bg-accent",
            isDragOver && "bg-primary/10",
          )}
          style={{ paddingLeft }}
        >
          <ChevronRight
            className={cn(
              FILE_TREE_ICON_PASSIVE_CLASS,
              "transition-transform duration-150 ease-out motion-reduce:transition-none",
              isExpanded && "rotate-90",
            )}
          />
          {isExpanded ? (
            <FolderOpen className={FILE_TREE_ICON_PASSIVE_CLASS} />
          ) : (
            <Folder className={FILE_TREE_ICON_PASSIVE_CLASS} />
          )}
          <span className={FILE_TREE_LABEL_CLASS}>{entry.name}</span>
        </div>

        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              key="children"
              initial={
                reduceMotion ? { opacity: 1 } : { height: 0, opacity: 0 }
              }
              animate={
                reduceMotion
                  ? { opacity: 1 }
                  : { height: "auto", opacity: 1 }
              }
              exit={
                reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }
              }
              transition={{ duration: 0.16, ease: [0.2, 0.9, 0.1, 1] }}
              className="overflow-hidden"
            >
              {isCreatingHere && (
                <CreateInputRow
                  type={creating.type}
                  value={createValue}
                  onChange={setCreateValue}
                  onSubmit={onCreateSubmit}
                  onCancel={onCreateCancel}
                  level={level + 1}
                />
              )}
              {entry.children?.map((child) => (
                <FileTreeItem
                  key={child.path}
                  entry={child}
                  currentFile={currentFile}
                  selectedPath={selectedPath}
                  onSelect={onSelect}
                  onPermanentOpen={onPermanentOpen}
                  onContextMenu={onContextMenu}
                  level={level + 1}
                  renamingPath={renamingPath}
                  renameValue={renameValue}
                  setRenameValue={setRenameValue}
                  onRenameSubmit={onRenameSubmit}
                  onRenameCancel={onRenameCancel}
                  expandedPaths={expandedPaths}
                  toggleExpanded={toggleExpanded}
                  creating={creating}
                  createValue={createValue}
                  setCreateValue={setCreateValue}
                  onCreateSubmit={onCreateSubmit}
                  onCreateCancel={onCreateCancel}
                  vaultPath={vaultPath}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // File item with rename support
  if (isRenaming) {
    return (
      <div
        className="flex items-center gap-1.5 py-1 px-1"
        style={{ paddingLeft: paddingLeft + 20 }}
      >
        <File className={FILE_TREE_ICON_CLASS} />
        <input
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={onRenameSubmit}
          onKeyDown={handleKeyDown}
          autoFocus
          className="flex-1 ui-input h-7 px-2 border-primary/60"
        />
        <span className="ui-tree-label text-muted-foreground">.md</span>
      </div>
    );
  }

  const getFileIcon = () => {
    const name = entry.name.toLowerCase();
    if (name.endsWith(".db.json")) {
      return <File className={FILE_TREE_ICON_CLASS} />;
    }
    if (
      name.endsWith(".excalidraw.json") ||
      name.endsWith(".diagram.json") ||
      name.endsWith(".drawio.json")
    ) {
      return <Shapes className={FILE_TREE_ICON_CLASS} />;
    }
    if (name.endsWith(".pdf")) {
      return <FileText className={FILE_TREE_ICON_CLASS} />;
    }
    if (
      name.endsWith(".png") ||
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg") ||
      name.endsWith(".gif") ||
      name.endsWith(".webp")
    ) {
      return <Image className={FILE_TREE_ICON_CLASS} />;
    }
    return <File className={FILE_TREE_ICON_CLASS} />;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const linkName = entry.name.replace(/\.(md|db\.json)$/i, "");
    const wikiLink = `[[${linkName}]]`;
    setDragData({
      wikiLink,
      filePath: entry.path,
      fileName: entry.name,
      isFolder: false,
      startX: e.clientX,
      startY: e.clientY,
      isDragging: false,
    });
  };

  return (
    <div
      data-file-tree-item="true"
      onMouseDown={handleMouseDown}
      onClick={() => onSelect(entry)}
      onDoubleClick={() => onPermanentOpen(entry)}
      onContextMenu={(e) => onContextMenu(e, entry)}
      className={cn(
        FILE_TREE_FILE_ROW_CLASS,
        showActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
      style={{ paddingLeft: paddingLeft + 20 }}
    >
      <span className="pointer-events-none">{getFileIcon()}</span>
      <span className={FILE_TREE_LABEL_CLASS}>
        {getFileName(entry.name)}
      </span>
    </div>
  );
}

/* ── Vault Name Section ─────────────────────────────────────────────── */

interface VaultNameSectionProps {
  vaultPath: string | null;
  renamingPath: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  handleRename: () => void;
  setRenamingPath: (p: string | null) => void;
  handleStartRootRename: () => void;
  handleSelectRoot: () => void;
  handleRootContextMenu: (e: React.MouseEvent) => void;
  isRootDragOver: boolean;
  setIsRootDragOver: (v: boolean) => void;
  selectedPath: string | null;
  onSwitchVault?: () => void;
}

function VaultNameSection({
  vaultPath,
  renamingPath,
  renameValue,
  setRenameValue,
  handleRename,
  setRenamingPath,
  handleStartRootRename,
  handleSelectRoot,
  handleRootContextMenu,
  isRootDragOver,
  setIsRootDragOver,
  selectedPath,
  onSwitchVault,
}: VaultNameSectionProps) {
  const { t } = useLocaleStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const nameRef = useRef<HTMLDivElement>(null);
  const vaultName = vaultPath?.split(/[/\\]/).pop() || "Notes";

  const handleRenameClick = () => {
    setMenuOpen(false);
    handleStartRootRename();
  };

  const handleSwitchClick = () => {
    setMenuOpen(false);
    onSwitchVault?.();
  };

  if (renamingPath === vaultPath) {
    return (
      <div className="px-2 py-1.5">
        <input
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={() => {
            void handleRename();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleRename();
            } else if (e.key === "Escape") {
              setRenamingPath(null);
            }
          }}
          autoFocus
          className="ui-input h-7 w-full border-primary/60 px-2"
        />
      </div>
    );
  }

  return (
    <div className="px-2">
      <Popover open={menuOpen} onOpenChange={setMenuOpen} anchor={nameRef}>
        <div
          ref={nameRef}
          role="button"
          tabIndex={0}
          data-folder-path={vaultPath}
          onClick={handleSelectRoot}
          onContextMenu={handleRootContextMenu}
          onKeyDown={(e) => {
            if (
              (e.key === "Enter" || e.key === "F2") &&
              selectedPath === vaultPath
            ) {
              e.preventDefault();
              handleStartRootRename();
            }
          }}
          onMouseEnter={() => {
            const dragData = getDragData();
            if (dragData?.isDragging) {
              setIsRootDragOver(true);
            }
          }}
          onMouseLeave={() => setIsRootDragOver(false)}
          className={cn(
            "ui-tree-row group flex items-center gap-1 cursor-pointer select-none px-2 py-2 truncate transition-colors rounded-ui-sm",
            isRootDragOver && "bg-primary/10",
            selectedPath === vaultPath && "bg-primary/10 text-primary",
          )}
        >
          <span className="flex-1 truncate text-left">{vaultName}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((prev) => !prev);
            }}
            className="shrink-0 p-0.5 rounded-ui-sm opacity-60 transition-opacity text-muted-foreground hover:opacity-100 hover:text-foreground hover:bg-accent focus-visible:opacity-100"
            aria-label={t.workspace?.switch || "Switch Workspace"}
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>

        <PopoverContent placement="bottom-start" width={200}>
          <PopoverList>
            <Row
              density="compact"
              icon={<Pencil className="w-3.5 h-3.5" />}
              title={
                <span className="text-ui-caption">
                  {t.workspace?.rename || "Rename"}
                </span>
              }
              onSelect={handleRenameClick}
              role="menuitem"
            />
            {onSwitchVault && (
              <Row
                density="compact"
                icon={<ArrowLeftRight className="w-3.5 h-3.5" />}
                title={
                  <span className="text-ui-caption">
                    {t.workspace?.switch || "Switch"}
                  </span>
                }
                onSelect={handleSwitchClick}
                role="menuitem"
              />
            )}
          </PopoverList>
        </PopoverContent>
      </Popover>
    </div>
  );
}
