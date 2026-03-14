import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { useRAGStore } from "@/stores/useRAGStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { getDragData, setDragData } from "@/lib/dragState";
import type { FileEntry } from "@/lib/tauri";
import { cn, getFileName } from "@/lib/utils";
import { ContextMenu } from "../toolbar/ContextMenu";
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  File,
  Folder,
  FolderOpen,
  Database,
  Image,
  FileText,
  Shapes,
  Star,
  StarOff,
} from "lucide-react";
import { useFavoriteStore } from "@/stores/useFavoriteStore";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import { useShallow } from "zustand/react/shallow";
import { OrgSwitcher } from "../team/OrgSwitcher";
import { useOrgStore } from "@/stores/useOrgStore";
import { SIDEBAR_SURFACE_CLASSNAME } from "./sidebarSurface";
import { useSidebarFileOperations, type CreatingState } from "./hooks/useSidebarFileOperations";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarQuickActions } from "./SidebarQuickActions";
import { OpenClawSection } from "./OpenClawSection";

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

export function Sidebar() {
  const { t } = useLocaleStore();
  const { isLoadingTree } = useFileStore(
    useShallow((state) => ({
      isLoadingTree: state.isLoadingTree,
    })),
  );
  const { config: ragConfig, isIndexing: ragIsIndexing, indexStatus, rebuildIndex, cancelIndex } = useRAGStore();
  const {
    favorites,
    manualOrder,
    favoriteSortMode,
    setFavoriteSortMode,
    moveFavorite,
    toggleFavorite,
    getFavorites,
  } = useFavoriteStore(useShallow((state) => ({
    favorites: state.favorites,
    manualOrder: state.manualOrder,
    favoriteSortMode: state.defaultSortMode,
    setFavoriteSortMode: state.setDefaultSortMode,
    moveFavorite: state.moveFavorite,
    toggleFavorite: state.toggleFavorite,
    getFavorites: state.getFavorites,
  })));
  const favoriteEntries = useMemo(
    () => getFavorites(favoriteSortMode),
    [getFavorites, favoriteSortMode, favorites, manualOrder],
  );

  const { currentOrgId, projects, currentProjectId, switchProject } = useOrgStore(
    useShallow((state) => ({
      currentOrgId: state.currentOrgId,
      projects: state.projects,
      currentProjectId: state.currentProjectId,
      switchProject: state.switchProject,
    })),
  );

  const authStatus = useCloudSyncStore((s) => s.authStatus);
  const cloudSession = useCloudSyncStore((s) => s.session);
  const cloudBaseUrl = useCloudSyncStore((s) => s.serverBaseUrl);
  const rehydrateToken = useCloudSyncStore((s) => s.rehydrateToken);
  const setOrgConnection = useOrgStore((s) => s.setConnection);
  // Restore token from OS keychain on app startup
  useEffect(() => {
    rehydrateToken();
  }, [rehydrateToken]);

  // Bridge CloudSync auth session to OrgStore so team API calls have credentials
  useEffect(() => {
    if (authStatus === 'authenticated' && cloudSession?.token && cloudBaseUrl) {
      setOrgConnection(cloudBaseUrl, cloudSession.token);
    }
  }, [authStatus, cloudSession?.token, cloudBaseUrl, setOrgConnection]);

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
    expandedMountedPaths,
    vaultPath,
    fileTree,
    currentFile,
    openFile,
    refreshFileTree,
    moveFileToFolder,
    moveFolderToFolder,
    handleQuickNote,
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
    toggleMountedExpanded,
    handleNewFile,
    handleNewDiagram,
    handleNewFolder,
    handleCreateSubmit,
    handleCreateCancel,
    focusTreePath,
  } = ops;

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [rootContextMenu, setRootContextMenu] = useState<RootContextMenuState | null>(null);
  const [isRootDragOver, setIsRootDragOver] = useState(false);
  const [isFileTreeScrollActive, setIsFileTreeScrollActive] = useState(false);
  const fileTreeScrollFadeTimerRef = useRef<number | null>(null);


  const handleContextMenu = useCallback((e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      entry,
      isDirectory: entry.is_dir,
    });
  }, []);

  const handleRootContextMenu = useCallback((e: React.MouseEvent) => {
    if (!vaultPath) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedPath(vaultPath);
    setRootContextMenu({
      x: e.clientX,
      y: e.clientY,
    });
  }, [vaultPath, setSelectedPath]);

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
      const sourceParent = normalizedSource.substring(0, normalizedSource.lastIndexOf("/"));
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

    window.addEventListener("lumina-folder-drop", handleRootDrop as unknown as EventListener);
    return () => {
      window.removeEventListener("lumina-folder-drop", handleRootDrop as unknown as EventListener);
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

    window.addEventListener("lumina-focus-file-tree-path", handleFocusPath as EventListener);
    return () => {
      window.removeEventListener("lumina-focus-file-tree-path", handleFocusPath as EventListener);
    };
  }, [focusTreePath]);

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

  return (
    <aside className={SIDEBAR_SURFACE_CLASSNAME}>
      {/* Header */}
      <SidebarHeader
        onNewFile={() => handleNewFile()}
        onNewDiagram={() => handleNewDiagram()}
        onNewFolder={() => handleNewFolder()}
        onRefresh={refreshFileTree}
        isLoadingTree={isLoadingTree}
        onOpenFolder={handleOpenFolder}
        onNewWindow={handleNewWindow}
      />

      {/* Toolbar Zone */}
      <div className="flex flex-col gap-3 py-2 border-b border-border/60">
      {/* Quick Actions */}
      <SidebarQuickActions vaultPath={vaultPath} onQuickNote={handleQuickNote} />

      {/* Team Organization Section (visible only when authenticated) */}
      {authStatus === 'authenticated' && (
        <div className="px-2">
          <OrgSwitcher />
          {currentOrgId && projects.length > 0 && (
            <div className="mt-2">
              <div className="px-2 py-1 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                {t.team.projects}
              </div>
              {projects.map((proj) => (
                <button
                  key={proj.id}
                  className={cn(
                    "w-full text-left px-2 py-1.5 text-sm rounded-md truncate",
                    "hover:bg-zinc-100 dark:hover:bg-zinc-800",
                    currentProjectId === proj.id && "bg-zinc-100 dark:bg-zinc-800 font-medium",
                  )}
                  onClick={() => switchProject(proj.id)}
                  title={proj.description || proj.name}
                >
                  {proj.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* OpenClaw */}
      {vaultPath && (
        <OpenClawSection
          vaultPath={vaultPath}
          currentFile={currentFile}
          openFile={openFile}
          focusTreePath={focusTreePath}
          expandedMountedPaths={expandedMountedPaths}
          toggleMountedExpanded={toggleMountedExpanded}
        />
      )}

      {/* Favorites */}
      <div className="px-2">
        <div className="mb-1 flex items-center justify-between gap-2 rounded-ui-sm bg-amber-500/5 px-2 py-1">
          <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">
            <Star className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
            {t.favorites.title}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFavoriteSortMode("manual")}
              className={cn(
                "px-1.5 py-0.5 text-[10px] rounded border transition-colors whitespace-nowrap",
                favoriteSortMode === "manual"
                  ? "bg-accent text-foreground border-border"
                  : "text-muted-foreground border-transparent hover:border-border hover:text-foreground",
              )}
              title={t.favorites.sortManual}
            >
              {t.favorites.sortManual}
            </button>
            <button
              onClick={() => setFavoriteSortMode("recentAdded")}
              className={cn(
                "px-1.5 py-0.5 text-[10px] rounded border transition-colors whitespace-nowrap",
                favoriteSortMode === "recentAdded"
                  ? "bg-accent text-foreground border-border"
                  : "text-muted-foreground border-transparent hover:border-border hover:text-foreground",
              )}
              title={t.favorites.sortRecentAdded}
            >
              {t.favorites.sortRecentAdded}
            </button>
            <button
              onClick={() => setFavoriteSortMode("recentOpened")}
              className={cn(
                "px-1.5 py-0.5 text-[10px] rounded border transition-colors whitespace-nowrap",
                favoriteSortMode === "recentOpened"
                  ? "bg-accent text-foreground border-border"
                  : "text-muted-foreground border-transparent hover:border-border hover:text-foreground",
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
                  "group flex items-center gap-2 px-2 py-1 rounded-ui-md text-xs",
                  currentFile === entry.path ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <button
                  onClick={() => openFile(entry.path)}
                  className="flex-1 flex items-center gap-2 text-left truncate"
                  title={entry.path}
                >
                  <Star className="w-3.5 h-3.5 text-yellow-500" />
                  <span className="truncate">{getFileName(entry.path).replace(/\.md$/i, "")}</span>
                </button>
                {favoriteSortMode === "manual" && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveFavorite(index, index - 1);
                      }}
                      className="p-0.5 rounded-ui-sm hover:bg-accent/60"
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
                      className="p-0.5 rounded-ui-sm hover:bg-accent/60"
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
                  className="p-0.5 rounded-ui-sm hover:bg-accent/60 opacity-0 group-hover:opacity-100 transition-opacity"
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
      {renamingPath === vaultPath ? (
        <div className="bg-background/35 px-2 py-1.5">
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
      ) : (
        <div
          role="button"
          tabIndex={0}
          data-folder-path={vaultPath}
          onClick={handleSelectRoot}
          onContextMenu={handleRootContextMenu}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === "F2") && selectedPath === vaultPath) {
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
            "cursor-pointer select-none px-3 py-2 text-sm font-medium truncate bg-background/35 transition-colors hover:bg-background/45",
            isRootDragOver && "bg-primary/15 ring-1 ring-primary/40 ring-inset",
            selectedPath === vaultPath && "bg-primary/10 ring-1 ring-primary/30 ring-inset text-primary",
          )}
        >
          {vaultPath?.split(/[/\\]/).pop() || "Notes"}
        </div>
      )}

      {/* File Tree */}
      <div
        className={cn(
          "sidebar-file-tree-scroll flex-1 overflow-auto py-2 pr-1",
          isFileTreeScrollActive && "is-scroll-active",
          selectedPath === vaultPath && "ring-1 ring-primary/20 ring-inset",
        )}
        onScroll={markFileTreeScrollActive}
        onClick={handleTreeBackgroundClick}
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
          <div className="px-4 py-8 text-center text-muted-foreground text-sm">
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

      {/* Status Bar */}
      <div className="p-3 border-t border-border/60 bg-background/35 text-xs text-muted-foreground flex flex-col gap-2">
        {ragConfig.enabled && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  ragIsIndexing ? "bg-warning animate-pulse" :
                  indexStatus?.initialized ? "bg-success" : "bg-gray-400"
                }`}></div>
                <span>
                  {ragIsIndexing ? t.rag.indexing :
                   indexStatus?.initialized ? `${t.rag.indexed}: ${indexStatus.totalFiles} ${t.rag.files}` : `${t.rag.indexed}: ${t.rag.notInitialized}`}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {ragIsIndexing ? (
                  <button
                    onClick={cancelIndex}
                    className="px-1.5 py-0.5 rounded text-[10px] text-destructive hover:bg-destructive/10 transition-colors"
                    title={t.rag.cancelIndex}
                  >
                    {t.rag.cancel}
                  </button>
                ) : (
                  <button
                    onClick={() => rebuildIndex()}
                    className="px-1.5 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title={t.rag.rebuildIndex}
                  >
                    {t.rag.rebuild}
                  </button>
                )}
              </div>
            </div>
            {ragIsIndexing && indexStatus?.progress && (
              <div className="space-y-1">
                <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-primary h-full transition-all duration-300"
                    style={{
                      width: `${Math.round((indexStatus.progress.current / Math.max(indexStatus.progress.total, 1)) * 100)}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{indexStatus.progress.current}/{indexStatus.progress.total}</span>
                  <span>{Math.round((indexStatus.progress.current / Math.max(indexStatus.progress.total, 1)) * 100)}%</span>
                </div>
              </div>
            )}
          </div>
        )}
        {!ragConfig.enabled && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gray-400"></div>
            <span>{t.rag.indexed}: {t.rag.notEnabled}</span>
          </div>
        )}
      </div>
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

function CreateInputRow({ type, value, onChange, onSubmit, onCancel, level }: CreateInputRowProps) {
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
      className="w-full flex items-center gap-1.5 py-1.5 pr-2 text-sm rounded-ui-sm"
      style={{ paddingLeft }}
    >
      {type === "folder" ? (
        <Folder className="w-4 h-4 text-muted-foreground shrink-0" />
      ) : type === "diagram" ? (
        <Shapes className="w-4 h-4 text-cyan-500 shrink-0" />
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
        placeholder={type === "folder" ? t.file.folderNamePlaceholder : t.file.fileNamePlaceholder}
        className="flex-1 ui-input h-6 px-1.5 border-transparent bg-transparent focus-visible:border-primary/40 focus-visible:ring-1 focus-visible:ring-primary/30"
      />
      {type === "file" && <span className="text-muted-foreground text-sm">.md</span>}
      {type === "diagram" && <span className="text-muted-foreground text-sm">.diagram.json</span>}
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
  const showActive = (isActive && (!selectedIsFile || selectedPath === currentFile)) || (isSelected && !entry.is_dir);

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
      if (dragData.isFolder && normalize(entry.path).startsWith(normalize(dragData.filePath) + "/")) return;
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

    window.addEventListener("lumina-folder-drop", handleFolderDrop as unknown as EventListener);
    return () => {
      window.removeEventListener("lumina-folder-drop", handleFolderDrop as unknown as EventListener);
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
            "w-full flex items-center gap-1.5 py-1.5 pr-2 transition-colors text-sm cursor-pointer select-none rounded-ui-sm",
            isSelected ? "bg-accent/70 text-foreground" : "hover:bg-accent/50",
            isDragOver && "bg-primary/15 ring-1 ring-primary/40 ring-inset",
          )}
          style={{ paddingLeft }}
        >
          {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 pointer-events-none" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 pointer-events-none" />
                )}
                {isExpanded ? (
            <FolderOpen className="w-4 h-4 text-amber-500/80 shrink-0 pointer-events-none" />
          ) : (
            <Folder className="w-4 h-4 text-amber-500/70 shrink-0 pointer-events-none" />
          )}
          <span className="truncate pointer-events-none">{entry.name}</span>
        </div>

        {isExpanded && (
          <div>
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
          </div>
        )}
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
      return <Database className="w-4 h-4 text-indigo-500 shrink-0" />;
    }
    if (name.endsWith(".excalidraw.json") || name.endsWith(".diagram.json") || name.endsWith(".drawio.json")) {
      return <Shapes className="w-4 h-4 text-cyan-500 shrink-0" />;
    }
    if (name.endsWith(".pdf")) {
      return <FileText className="w-4 h-4 text-red-500 shrink-0" />;
    }
    if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".gif") || name.endsWith(".webp")) {
      return <Image className="w-4 h-4 text-green-500 shrink-0" />;
    }
    return <File className="w-4 h-4 text-primary/50 shrink-0" />;
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
        "w-full flex items-center gap-1.5 py-1.5 pr-2 transition-colors text-sm cursor-grab select-none rounded-ui-sm border border-transparent",
        showActive
          ? "bg-accent/70 text-foreground font-medium border-border/45"
          : "text-muted-foreground hover:bg-accent/45 hover:text-foreground",
      )}
      style={{ paddingLeft: paddingLeft + 20 }}
    >
      <span className="pointer-events-none">{getFileIcon()}</span>
      <span className="truncate pointer-events-none">{getFileName(entry.name)}</span>
    </div>
  );
}
