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
} from "lucide-react";
import { Popover, PopoverContent, PopoverList, Row } from "@/components/ui";
import { useFavoriteStore } from "@/stores/useFavoriteStore";
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
    moveFavorite,
    toggleFavorite,
    getFavorites,
  } = useFavoriteStore(
    useShallow((state) => ({
      favorites: state.favorites,
      manualOrder: state.manualOrder,
      favoriteSortMode: state.defaultSortMode,
      setFavoriteSortMode: state.setDefaultSortMode,
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
    handleOpenFolder,
    handleNewWindow,
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
          onOpenFolder={handleOpenFolder}
          onNewWindow={handleNewWindow}
        />
      )}

      {/* Toolbar Zone */}
      <div className="flex flex-col gap-3 py-2">
        {/* Favorites */}
        <div className="px-2">
          <div className="mb-1 flex items-center justify-between gap-2 rounded-ui-sm px-2 py-1">
            <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">
              <Star className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
              {t.favorites.title}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFavoriteSortMode("manual")}
                className={cn(
                  "px-1.5 py-0.5 text-[11px] rounded transition-colors whitespace-nowrap",
                  favoriteSortMode === "manual"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                title={t.favorites.sortManual}
              >
                {t.favorites.sortManual}
              </button>
              <button
                onClick={() => setFavoriteSortMode("recentAdded")}
                className={cn(
                  "px-1.5 py-0.5 text-[11px] rounded transition-colors whitespace-nowrap",
                  favoriteSortMode === "recentAdded"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                title={t.favorites.sortRecentAdded}
              >
                {t.favorites.sortRecentAdded}
              </button>
              <button
                onClick={() => setFavoriteSortMode("recentOpened")}
                className={cn(
                  "px-1.5 py-0.5 text-[11px] rounded transition-colors whitespace-nowrap",
                  favoriteSortMode === "recentOpened"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                title={t.favorites.sortRecentOpened}
              >
                {t.favorites.sortRecentOpened}
              </button>
            </div>
          </div>
          {favoriteEntries.length === 0 ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              {t.favorites.empty}
            </div>
          ) : (
            <div className="space-y-1">
              {favoriteEntries.map((entry, index) => (
                <div
                  key={entry.path}
                  className={cn(
                    "group flex items-center gap-2 px-2 py-1 rounded-ui-md text-[13px]",
                    currentFile === entry.path
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <button
                    onClick={() => openFile(entry.path)}
                    className="flex-1 flex items-center gap-2 text-left truncate"
                    title={entry.path}
                  >
                    <Star className="w-3.5 h-3.5 text-yellow-500" />
                    <span className="truncate">
                      {getFileName(entry.path).replace(/\.md$/i, "")}
                    </span>
                  </button>
                  {favoriteSortMode === "manual" && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          moveFavorite(index, index - 1);
                        }}
                        className="p-0.5 rounded-ui-sm hover:bg-accent"
                        title={t.favorites.moveUp}
                        disabled={index === 0}
                      >
                        <ChevronUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          moveFavorite(index, index + 1);
                        }}
                        className="p-0.5 rounded-ui-sm hover:bg-accent"
                        title={t.favorites.moveDown}
                        disabled={index === favoriteEntries.length - 1}
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(entry.path);
                    }}
                    className="p-0.5 rounded-ui-sm hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity"
                    title={t.favorites.remove}
                  >
                    <StarOff className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
          <div className="px-4 py-8 text-center text-muted-foreground text-[13px]">
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
      className="w-full flex items-center gap-1.5 py-1.5 pr-2 text-[13px] rounded-ui-sm"
      style={{ paddingLeft }}
    >
      {type === "folder" ? (
        <Folder className="w-4 h-4 text-muted-foreground shrink-0" />
      ) : type === "diagram" ? (
        <Shapes className="w-4 h-4 text-muted-foreground shrink-0" />
      ) : (
        <File className="w-4 h-4 text-muted-foreground shrink-0" />
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
        <span className="text-muted-foreground text-sm">.md</span>
      )}
      {type === "diagram" && (
        <span className="text-muted-foreground text-sm">.diagram.json</span>
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
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          <Folder className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={onRenameSubmit}
            onKeyDown={handleKeyDown}
            autoFocus
            className="flex-1 ui-input h-8 px-2 border-primary/60"
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
            "w-full flex items-center gap-1.5 py-1.5 pr-2 transition-colors text-[13px] cursor-pointer select-none rounded-ui-sm",
            isSelected ? "bg-primary/10 text-primary" : "hover:bg-accent",
            isDragOver && "bg-primary/10",
          )}
          style={{ paddingLeft }}
        >
          <ChevronRight
            className={cn(
              "w-4 h-4 text-muted-foreground shrink-0 pointer-events-none",
              "transition-transform duration-150 ease-out motion-reduce:transition-none",
              isExpanded && "rotate-90",
            )}
          />
          {isExpanded ? (
            <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0 pointer-events-none" />
          ) : (
            <Folder className="w-4 h-4 text-muted-foreground shrink-0 pointer-events-none" />
          )}
          <span className="truncate pointer-events-none">{entry.name}</span>
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
        <File className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={onRenameSubmit}
          onKeyDown={handleKeyDown}
          autoFocus
          className="flex-1 ui-input h-8 px-2 border-primary/60"
        />
        <span className="text-muted-foreground text-sm">.md</span>
      </div>
    );
  }

  const getFileIcon = () => {
    const name = entry.name.toLowerCase();
    if (name.endsWith(".db.json")) {
      return <File className="w-4 h-4 text-muted-foreground shrink-0" />;
    }
    if (
      name.endsWith(".excalidraw.json") ||
      name.endsWith(".diagram.json") ||
      name.endsWith(".drawio.json")
    ) {
      return <Shapes className="w-4 h-4 text-muted-foreground shrink-0" />;
    }
    if (name.endsWith(".pdf")) {
      return <FileText className="w-4 h-4 text-muted-foreground shrink-0" />;
    }
    if (
      name.endsWith(".png") ||
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg") ||
      name.endsWith(".gif") ||
      name.endsWith(".webp")
    ) {
      return <Image className="w-4 h-4 text-muted-foreground shrink-0" />;
    }
    return <File className="w-4 h-4 text-muted-foreground shrink-0" />;
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
        "w-full flex items-center gap-1.5 py-1.5 pr-2 transition-colors text-[13px] cursor-grab select-none rounded-ui-sm",
        showActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
      style={{ paddingLeft: paddingLeft + 20 }}
    >
      <span className="pointer-events-none">{getFileIcon()}</span>
      <span className="truncate pointer-events-none">
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
          className="ui-input h-8 w-full border-primary/60 px-2"
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
            "group flex items-center gap-1 cursor-pointer select-none px-2 py-2 text-[13px] font-medium truncate transition-colors rounded-ui-sm",
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
            className="shrink-0 p-0.5 rounded-ui-sm opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground hover:bg-accent"
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
              title={t.workspace?.rename || "Rename"}
              onSelect={handleRenameClick}
              role="menuitem"
            />
            {onSwitchVault && (
              <Row
                density="compact"
                icon={<ArrowLeftRight className="w-3.5 h-3.5" />}
                title={t.workspace?.switch || "Switch"}
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
