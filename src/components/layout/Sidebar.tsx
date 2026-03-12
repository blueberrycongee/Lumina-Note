import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { useRAGStore } from "@/stores/useRAGStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { getDragData, setDragData } from "@/lib/dragState";
import { FileEntry, deleteFile, renameFile, createFile, createDir, exists, openNewWindow, saveFile, readFile } from "@/lib/tauri";
import { parseFrontmatter } from "@/services/markdown/frontmatter";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { join } from "@/lib/path";
import { openFilteredView } from "@/lib/events";
import { cn, getFileName } from "@/lib/utils";
import { ContextMenu, MenuItem, menuItems } from "../toolbar/ContextMenu";
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  File,
  Folder,
  FolderOpen,
  RefreshCw,
  MoreHorizontal,
  Calendar,
  FilePlus,
  FolderPlus,
  AppWindow,
  Database,
  Image,
  FileText,
  Shapes,
  Mic,
  Loader2,
  Bot,
  Star,
  StarOff,
  Clock,
} from "lucide-react";
import { useVoiceNote } from "@/hooks/useVoiceNote";
import { useUIStore } from "@/stores/useUIStore";
import { useSplitStore } from "@/stores/useSplitStore";
import { useFavoriteStore } from "@/stores/useFavoriteStore";
import { useOpenClawWorkspaceStore } from "@/stores/useOpenClawWorkspaceStore";
import { ensureOpenClawTodayMemoryNote } from "@/services/openclaw/workspace";
import { readOpenClawCronJobs, type OpenClawCronJob } from "@/services/openclaw/cron";
import { pluginRuntime } from "@/services/plugins/runtime";
import { reportOperationError } from "@/lib/reportError";
import { useShallow } from "zustand/react/shallow";
import { SIDEBAR_SURFACE_CLASSNAME } from "./sidebarSurface";

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

// 新建模式状态
interface CreatingState {
  type: "file" | "folder" | "diagram";
  parentPath: string;
}

const EMPTY_DIAGRAM_CONTENT = `${JSON.stringify(
  {
    type: "excalidraw",
    version: 2,
    source: "https://lumina-note.app",
    elements: [],
    appState: {},
    files: {},
  },
  null,
  2,
)}\n`;

export function Sidebar() {
  const { t, locale } = useLocaleStore();
  const {
    vaultPath,
    fileTree,
    currentFile,
    openFile,
    refreshFileTree,
    isLoadingTree,
    closeFile,
    openDatabaseTab,
    openPDFTab,
    openDiagramTab,
    tabs,
    activeTabIndex,
    moveFileToFolder,
    moveFolderToFolder,
    promotePreviewTab,
  } = useFileStore(
    useShallow((state) => ({
      vaultPath: state.vaultPath,
      fileTree: state.fileTree,
      currentFile: state.currentFile,
      openFile: state.openFile,
      refreshFileTree: state.refreshFileTree,
      isLoadingTree: state.isLoadingTree,
      closeFile: state.closeFile,
      openDatabaseTab: state.openDatabaseTab,
      openPDFTab: state.openPDFTab,
      openDiagramTab: state.openDiagramTab,
      tabs: state.tabs,
      activeTabIndex: state.activeTabIndex,
      moveFileToFolder: state.moveFileToFolder,
      moveFolderToFolder: state.moveFolderToFolder,
      promotePreviewTab: state.promotePreviewTab,
    }))
  );
  const { config: ragConfig, isIndexing: ragIsIndexing, indexStatus, rebuildIndex, cancelIndex } = useRAGStore();
  const { setLeftSidebarOpen, setRightPanelTab, splitView } = useUIStore();
  const { activePane, openSecondaryFile, openSecondaryPdf } = useSplitStore();
  const {
    favorites,
    manualOrder,
    favoriteSortMode,
    setFavoriteSortMode,
    moveFavorite,
    toggleFavorite,
    isFavorite,
    getFavorites,
  } = useFavoriteStore(useShallow((state) => ({
    favorites: state.favorites,
    manualOrder: state.manualOrder,
    favoriteSortMode: state.defaultSortMode,
    setFavoriteSortMode: state.setDefaultSortMode,
    moveFavorite: state.moveFavorite,
    toggleFavorite: state.toggleFavorite,
    isFavorite: state.isFavorite,
    getFavorites: state.getFavorites,
  })));
  const favoriteEntries = useMemo(
    () => getFavorites(favoriteSortMode),
    [getFavorites, favoriteSortMode, favorites, manualOrder]
  );
  const openClawSnapshotsByHost = useOpenClawWorkspaceStore((state) => state.snapshotsByHostPath);
  const openClawAttachmentsByHost = useOpenClawWorkspaceStore((state) => state.attachmentsByHostPath);
  const openClawIntegrationEnabled = useOpenClawWorkspaceStore((state) => state.integrationEnabled);
  const openClawMountedTree = useOpenClawWorkspaceStore((state) => state.getMountedFileTree(vaultPath));
  const openClawSnapshot = openClawIntegrationEnabled && vaultPath ? openClawSnapshotsByHost[vaultPath] ?? null : null;
  const openClawAttachment = openClawIntegrationEnabled && vaultPath ? openClawAttachmentsByHost[vaultPath] ?? null : null;
  const { 
    isRecording, 
    status: voiceStatus, 
    currentTranscript,
    startRecording, 
    stopRecording, 
    cancelRecording 
  } = useVoiceNote();

  // 今日速记：创建带时间戳的快速笔记
  const handleQuickNote = useCallback(async () => {
    if (!vaultPath) return;
    
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    
    const fileName = `${t.file.quickNotePrefix}_${year}-${month}-${day}_${hours}-${minutes}`;
    const sep = vaultPath.includes("\\") ? "\\" : "/";
    let filePath = `${vaultPath}${sep}${fileName}.md`;
    
    // 检查文件是否已存在，如果存在则添加序号
    let counter = 1;
    while (await exists(filePath)) {
      filePath = `${vaultPath}${sep}${fileName}_${counter}.md`;
      counter++;
    }
    
    // 创建文件内容
    const dateStr = now.toLocaleString(locale);
    const content = `# ${fileName}\n\n> 📅 ${dateStr}\n\n`;
    
    try {
      await saveFile(filePath, content);
      await refreshFileTree();
      openFile(filePath);
    } catch (error) {
      reportOperationError({
        source: "Sidebar.handleQuickNote",
        action: "Create quick note",
        error,
        userMessage: t.file.createQuickNoteFailed,
        context: { filePath },
      });
    }
  }, [locale, openFile, refreshFileTree, t.file.createQuickNoteFailed, t.file.quickNotePrefix, vaultPath]);
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [rootContextMenu, setRootContextMenu] = useState<RootContextMenuState | null>(null);
  // More menu state
  const [moreMenu, setMoreMenu] = useState<{ x: number; y: number } | null>(null);
  // 选中状态（用于确定新建位置）
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  // 新建模式（先命名后创建）
  const [creating, setCreating] = useState<CreatingState | null>(null);
  const [createValue, setCreateValue] = useState("");
  // 重命名状态（针对已存在的文件）
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // 展开的文件夹路径集合
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [expandedMountedPaths, setExpandedMountedPaths] = useState<Set<string>>(new Set());
  // 根目录拖拽悬停状态
  const [isRootDragOver, setIsRootDragOver] = useState(false);
  const [isFileTreeScrollActive, setIsFileTreeScrollActive] = useState(false);
  const fileTreeScrollFadeTimerRef = useRef<number | null>(null);

  // 当前是否激活了 AI 主对话标签
  const isAIMainActive = tabs[activeTabIndex]?.type === "ai-chat";

  // 监听根目录放置
  useEffect(() => {
    const handleRootDrop = async (e: CustomEvent) => {
      if (!isRootDragOver || !vaultPath) return;
      setIsRootDragOver(false);
      
      const { sourcePath, isFolder } = e.detail;
      if (!sourcePath) return;
      
      // 检查是否已经在根目录
      const normalize = (p: string) => p.replace(/\\/g, "/");
      const normalizedSource = normalize(sourcePath);
      const normalizedVault = normalize(vaultPath);
      const sourceParent = normalizedSource.substring(0, normalizedSource.lastIndexOf("/"));
      if (sourceParent === normalizedVault) {
        return; // 已经在根目录，不需要移动
      }
      
      try {
        if (isFolder) {
          await moveFolderToFolder(sourcePath, vaultPath);
        } else {
          await moveFileToFolder(sourcePath, vaultPath);
        }
      } catch {
        // move actions already report and surface failures in useFileStore
      }
    };
    
    window.addEventListener('lumina-folder-drop', handleRootDrop as unknown as EventListener);
    return () => {
      window.removeEventListener('lumina-folder-drop', handleRootDrop as unknown as EventListener);
    };
  }, [isRootDragOver, vaultPath, moveFileToFolder, moveFolderToFolder]);

  // Sync selectedPath with currentFile
  useEffect(() => {
    if (currentFile) {
      setSelectedPath(currentFile);
    }
  }, [currentFile]);

  // Handle context menu
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
  }, [vaultPath]);

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setRootContextMenu(null);
    setMoreMenu(null);
  }, []);

  // Handle open folder
  const handleOpenFolder = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t.file.selectWorkingDir,
      });
      
      if (selected && typeof selected === "string") {
        useFileStore.getState().setVaultPath(selected);
      }
    } catch (error) {
      reportOperationError({
        source: "Sidebar.handleOpenFolder",
        action: "Open workspace folder picker",
        error,
      });
    }
  }, [t.file.selectWorkingDir]);

  // Handle new window
  const handleNewWindow = useCallback(async () => {
    try {
      await openNewWindow();
    } catch (error) {
      reportOperationError({
        source: "Sidebar.handleNewWindow",
        action: "Open new window",
        error,
      });
    }
  }, []);

  // Build more menu items
  const getMoreMenuItems = useCallback((): MenuItem[] => {
    return [
      {
        label: t.file.openFolder,
        icon: <FolderOpen size={14} />,
        onClick: handleOpenFolder,
      },
      {
        label: t.file.newWindow,
        icon: <AppWindow size={14} />,
        onClick: handleNewWindow,
      },
    ];
  }, [handleOpenFolder, handleNewWindow]);

  // Handle delete - 直接移动到回收站，无需确认
  const handleDelete = useCallback(async (entry: FileEntry) => {
    try {
      await deleteFile(entry.path);
      if (currentFile === entry.path) {
        closeFile();
      }
      refreshFileTree();
    } catch (error) {
      reportOperationError({
        source: "Sidebar.handleDelete",
        action: entry.is_dir ? "Delete folder" : "Delete file",
        error,
        context: { path: entry.path },
      });
    }
  }, [currentFile, closeFile, refreshFileTree]);

  // Handle rename
  const handleStartRename = useCallback((entry: FileEntry) => {
    setRenamingPath(entry.path);
    // 文件：去掉 .md，文件夹：原样
    const baseName = entry.is_dir ? entry.name : entry.name.replace(/\.md$/, "");
    setRenameValue(baseName);
  }, []);

  const handleStartRootRename = useCallback(() => {
    if (!vaultPath) return;
    setSelectedPath(vaultPath);
    setRenamingPath(vaultPath);
    setRenameValue(vaultPath.split(/[/\\]/).pop() || "Notes");
  }, [vaultPath]);

  const handleRename = useCallback(async () => {
    if (!renamingPath || !renameValue.trim()) {
      setRenamingPath(null);
      return;
    }

    const trimmed = renameValue.trim();
    const separator = renamingPath.includes("\\") ? "\\" : "/";
    const parentDir = renamingPath.substring(0, renamingPath.lastIndexOf(separator));
    const isRootRename = renamingPath === vaultPath;
    const findEntryByPath = (entries: FileEntry[], targetPath: string): FileEntry | null => {
      for (const entry of entries) {
        if (entry.path === targetPath) return entry;
        if (entry.is_dir && entry.children) {
          const nested = findEntryByPath(entry.children, targetPath);
          if (nested) return nested;
        }
      }
      return null;
    };
    const targetEntry = renamingPath ? findEntryByPath(fileTree, renamingPath) : null;
    const isDir = isRootRename || Boolean(targetEntry?.is_dir);
    const isMarkdownFile = renamingPath.toLowerCase().endsWith(".md");
    const newPath = isRootRename
      ? `${parentDir}${separator}${trimmed}`
      : isDir
        ? `${parentDir}${separator}${trimmed}`
        : isMarkdownFile
          ? `${parentDir}${separator}${trimmed}.md`
          : `${parentDir}${separator}${trimmed}`;
    
    if (newPath === renamingPath) {
      setRenamingPath(null);
      return;
    }
    
    try {
      const { isImagePath } = await import("@/services/assets/imageManager");
      if (!isRootRename && isImagePath(renamingPath)) {
        const { executeImageRename } = await import("@/services/assets/imageOperations");
        const preview = await executeImageRename(fileTree, renamingPath, trimmed);
        const finalPath = preview.changes[0]?.to ?? newPath;
        useFileStore.getState().updateTabPath(renamingPath, finalPath);
        setSelectedPath(finalPath);
        setRenamingPath(null);
        return;
      }

      await renameFile(renamingPath, newPath);
      if (isRootRename) {
        const normalize = (path: string) => path.replace(/\\/g, "/");
        const replaceFolderPrefix = (path: string) => {
          const normalizedPath = normalize(path);
          const normalizedSource = normalize(renamingPath);
          const normalizedTarget = normalize(newPath);
          if (normalizedPath === normalizedSource || normalizedPath.startsWith(normalizedSource + "/")) {
            return normalizedTarget + normalizedPath.slice(normalizedSource.length);
          }
          return path;
        };

        const { tabs, currentFile, setVaultPath } = useFileStore.getState();
        const updatedTabs = tabs.map((tab) => {
          if (
            tab.type === "file" ||
            tab.type === "typesetting-doc" ||
            tab.type === "diagram" ||
            tab.type === "pdf"
          ) {
            const nextPath = replaceFolderPrefix(tab.path);
            if (nextPath !== tab.path) {
              const nextName =
                tab.type === "file" || tab.type === "typesetting-doc"
                  ? nextPath.split(/[/\\]/).pop()?.replace(/\.(md|docx)$/i, "") || tab.name
                  : tab.name;
              const nextId =
                tab.type === "diagram"
                  ? `__diagram_${nextPath}__`
                  : tab.type === "pdf"
                    ? `__pdf_${nextPath}__`
                    : nextPath;
              return {
                ...tab,
                path: nextPath,
                name: nextName,
                id: nextId,
              };
            }
          }
          return tab;
        });

        useFileStore.setState({
          tabs: updatedTabs,
          currentFile: currentFile ? replaceFolderPrefix(currentFile) : currentFile,
        });
        useFavoriteStore.getState().updatePathsForFolderMove(renamingPath, newPath);
        await setVaultPath(newPath);
        setSelectedPath((currentSelectedPath) => {
          if (!currentSelectedPath) return newPath;
          return replaceFolderPrefix(currentSelectedPath);
        });
        const databaseStoreModule = await import("@/stores/useDatabaseStore");
        const dbIds = Object.keys(databaseStoreModule.useDatabaseStore.getState().databases);
        for (const dbId of dbIds) {
          await databaseStoreModule.useDatabaseStore.getState().refreshRows(dbId);
        }
      } else {
        await refreshFileTree();
        
        // 更新标签页中的路径和名称（如果文件在标签页中打开）
        const { updateTabPath } = useFileStore.getState();
        updateTabPath(renamingPath, newPath);

        if (isMarkdownFile) {
          const content = await readFile(newPath);
          const { frontmatter, hasFrontmatter } = parseFrontmatter(content);
          if (hasFrontmatter && frontmatter.db) {
            const databaseStoreModule = await import("@/stores/useDatabaseStore");
            await databaseStoreModule.useDatabaseStore.getState().refreshRows(String(frontmatter.db));
          }
        }
      }
    } catch (error) {
      reportOperationError({
        source: "Sidebar.handleRename",
        action: isDir ? "Rename folder" : "Rename file",
        error,
        userMessage: t.file.renameFailed,
        context: { from: renamingPath, to: newPath },
      });
    }
    setRenamingPath(null);
  }, [fileTree, renamingPath, renameValue, refreshFileTree, t.file.renameFailed, vaultPath]);

  // Handle copy path
  const handleCopyPath = useCallback(async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
    } catch (error) {
      reportOperationError({
        source: "Sidebar.handleCopyPath",
        action: "Copy file path",
        error,
        level: "warning",
        context: { path },
      });
    }
  }, []);

  // Handle show in explorer - 在资源管理器中显示并选中文件
  const handleShowInExplorer = useCallback(async (path: string) => {
    try {
      await invoke("show_in_explorer", { path });
    } catch (error) {
      reportOperationError({
        source: "Sidebar.handleShowInExplorer",
        action: "Show in file explorer",
        error,
        level: "warning",
        context: { path },
      });
      // 降级：复制路径
      try {
        await navigator.clipboard.writeText(path);
      } catch (copyError) {
        reportOperationError({
          source: "Sidebar.handleShowInExplorer",
          action: "Copy file path fallback",
          error: copyError,
          level: "warning",
          context: { path },
        });
      }
    }
  }, [t.file.openFailed]);

  // 解析用于创建新文件/文件夹的基础路径（VS Code 风格）：
  // 1) 显式传入的 parentPath（来自右键菜单）
  // 2) 选中的文件夹，或选中文件的父目录
  // 3) 当前打开文件所在目录
  // 4) fallback 到 vault 根目录
  const getBasePath = useCallback(
    (parentPath?: string): string | null => {
      // 1. 显式 parentPath（右键 "在此新建"）
      if (parentPath) return parentPath;

      const getSep = (p: string) => (p.includes("\\") ? "\\" : "/");
      const getParentDir = (p: string) => {
        const sep = getSep(p);
        const lastIndex = p.lastIndexOf(sep);
        return lastIndex > 0 ? p.substring(0, lastIndex) : null;
      };
      const findEntryByPath = (entries: FileEntry[], targetPath: string): FileEntry | null => {
        for (const entry of entries) {
          if (entry.path === targetPath) return entry;
          if (entry.is_dir && entry.children?.length) {
            const found = findEntryByPath(entry.children, targetPath);
            if (found) return found;
          }
        }
        return null;
      };

      // 2. 选中项：如果是文件夹直接用，如果是文件取父目录
      if (selectedPath) {
        const selectedEntry = findEntryByPath(fileTree, selectedPath);
        if (selectedEntry) {
          return selectedEntry.is_dir ? selectedPath : getParentDir(selectedPath);
        }
        if (/\.[^/\\]+$/.test(selectedPath)) {
          return getParentDir(selectedPath);
        }
        return selectedPath;
      }

      // 3. 当前打开文件所在目录
      if (currentFile) {
        return getParentDir(currentFile);
      }

      // 4. 退回 vault 根目录
      return vaultPath;
    },
    [selectedPath, currentFile, vaultPath, fileTree]
  );

  // 展开指定路径的所有父文件夹
  const expandToPath = useCallback((targetPath: string) => {
    const sep = targetPath.includes("\\") ? "\\" : "/";
    const parts = targetPath.split(sep);
    const pathsToExpand: string[] = [];
    
    // 构建所有父路径
    for (let i = 1; i < parts.length; i++) {
      pathsToExpand.push(parts.slice(0, i).join(sep));
    }
    
    setExpandedPaths(prev => {
      const next = new Set(prev);
      pathsToExpand.forEach(p => next.add(p));
      return next;
    });
  }, []);

  const focusTreePath = useCallback((targetPath: string) => {
    setLeftSidebarOpen(true);
    expandToPath(targetPath);
    setSelectedPath(targetPath);
  }, [expandToPath, setLeftSidebarOpen]);

  const openClawRecentMemoryEntries = useMemo(
    () => openClawSnapshot?.recentMemoryPaths.slice(0, 4) ?? [],
    [openClawSnapshot?.recentMemoryPaths],
  );

  const openClawArtifactDirectories = useMemo(
    () => openClawSnapshot?.artifactDirectoryPaths ?? [],
    [openClawSnapshot?.artifactDirectoryPaths],
  );
  const openClawPlanEntries = useMemo(
    () => openClawSnapshot?.planFilePaths.slice(0, 4) ?? [],
    [openClawSnapshot?.planFilePaths],
  );
  const openClawBridgeEntries = useMemo(
    () => openClawSnapshot?.bridgeNotePaths.slice(0, 2) ?? [],
    [openClawSnapshot?.bridgeNotePaths],
  );

  const [openClawCronJobs, setOpenClawCronJobs] = useState<OpenClawCronJob[]>([]);
  useEffect(() => {
    if (!openClawAttachment || openClawAttachment.status !== "attached") {
      setOpenClawCronJobs([]);
      return;
    }
    const ocPath = openClawAttachment.workspacePath;
    if (!ocPath) return;
    let cancelled = false;
    readOpenClawCronJobs(ocPath).then(
      (jobs) => { if (!cancelled) setOpenClawCronJobs(jobs); },
      (error) => {
        if (!cancelled) {
          setOpenClawCronJobs([]);
          reportOperationError({
            source: "Sidebar.loadCronJobs",
            action: "Load OpenClaw cron jobs",
            error,
          });
        }
      },
    );
    return () => { cancelled = true; };
  }, [openClawAttachment]);

  const openCronEditor = useCallback((jobId?: string) => {
    try {
      if (jobId) {
        const actions = pluginRuntime.getTabActions("openclaw-workspace:openclaw-workspace-overview");
        if (actions["edit-cron-job"]) {
          Promise.resolve(actions["edit-cron-job"]({ jobId })).catch((error) => {
            reportOperationError({
              source: "Sidebar.openCronEditor",
              action: "Open cron job editor",
              error,
            });
          });
          return;
        }
      }
      if (!pluginRuntime.executeCommand("plugin-command:openclaw-workspace:openclaw-workspace:create-cron-job")) {
        reportOperationError({
          source: "Sidebar.openCronEditor",
          action: "Open cron job editor",
          error: new Error(t.sidebar.openClawCronPluginUnavailable),
        });
      }
    } catch (error) {
      reportOperationError({
        source: "Sidebar.openCronEditor",
        action: "Open cron job editor",
        error,
      });
    }
  }, []);

  useEffect(() => {
    const handleFocusPath = (event: Event) => {
      const customEvent = event as CustomEvent<{ path?: string }>;
      const targetPath = customEvent.detail?.path;
      if (!targetPath) return;
      setLeftSidebarOpen(true);
      expandToPath(targetPath);
      setSelectedPath(targetPath);
    };

    window.addEventListener("lumina-focus-file-tree-path", handleFocusPath as EventListener);
    return () => {
      window.removeEventListener("lumina-focus-file-tree-path", handleFocusPath as EventListener);
    };
  }, [expandToPath, setLeftSidebarOpen]);

  // Handle new file - VS Code 风格：先显示输入框，输入名称后再创建
  const handleNewFile = useCallback((parentPath?: string) => {
    const basePath = getBasePath(parentPath);
    if (!basePath) return;

    // 展开父文件夹
    expandToPath(basePath);
    
    // 进入新建模式
    setCreating({ type: "file", parentPath: basePath });
    setCreateValue("");
  }, [getBasePath, expandToPath]);

  // Handle new folder - VS Code 风格
  const handleNewFolder = useCallback((parentPath?: string) => {
    const basePath = getBasePath(parentPath);
    if (!basePath) return;

    // 展开父文件夹
    expandToPath(basePath);
    
    // 进入新建模式
    setCreating({ type: "folder", parentPath: basePath });
    setCreateValue("");
  }, [getBasePath, expandToPath]);

  // Handle new diagram - VS Code 风格
  const handleNewDiagram = useCallback((parentPath?: string) => {
    const basePath = getBasePath(parentPath);
    if (!basePath) return;

    // 展开父文件夹
    expandToPath(basePath);

    // 进入新建模式
    setCreating({ type: "diagram", parentPath: basePath });
    setCreateValue("");
  }, [getBasePath, expandToPath]);

  // 确认创建（用户按 Enter）
  const handleCreateSubmit = useCallback(async () => {
    if (!creating || !createValue.trim()) {
      setCreating(null);
      return;
    }

    const trimmed = createValue.trim();
    const sep = creating.parentPath.includes("\\") ? "\\" : "/";
    
    // 构建完整路径
    const fullPath =
      creating.type === "folder"
        ? `${creating.parentPath}${sep}${trimmed}`
        : creating.type === "diagram"
          ? `${creating.parentPath}${sep}${trimmed}${
              trimmed.endsWith(".diagram.json") ||
              trimmed.endsWith(".excalidraw.json") ||
              trimmed.endsWith(".drawio.json")
                ? ""
                : ".diagram.json"
            }`
          : `${creating.parentPath}${sep}${trimmed}${trimmed.endsWith(".md") ? "" : ".md"}`;

    // 检查是否已存在
    try {
      if (await exists(fullPath)) {
        reportOperationError({
          source: "Sidebar.handleCreateSubmit",
          action: creating.type === "folder" ? "Create folder" : creating.type === "diagram" ? "Create diagram" : "Create note",
          error: `${creating.type === "folder" ? t.file.folderExists : t.file.fileExists}: ${trimmed}`,
          level: "warning",
          context: { path: fullPath },
        });
        return;
      }
    } catch (error) {
      reportOperationError({
        source: "Sidebar.handleCreateSubmit",
        action: "Check existing path before create",
        error,
        level: "warning",
        context: { path: fullPath },
      });
    }

    try {
      if (creating.type === "file") {
        await createFile(fullPath);
        await refreshFileTree();
        openFile(fullPath);
      } else if (creating.type === "diagram") {
        await saveFile(fullPath, EMPTY_DIAGRAM_CONTENT);
        await refreshFileTree();
        openDiagramTab(fullPath);
      } else {
        await createDir(fullPath);
        await refreshFileTree();
      }
    } catch (error) {
      const targetLabel =
        creating.type === "folder"
          ? t.sidebar.newFolder
          : creating.type === "diagram"
            ? t.sidebar.newDiagram
            : t.sidebar.newNote;
      reportOperationError({
        source: "Sidebar.handleCreateSubmit",
        action: `Create ${targetLabel}`,
        error,
        userMessage: `${t.file.createFailed}: ${targetLabel}`,
        context: { path: fullPath },
      });
    }

    setCreating(null);
  }, [creating, createValue, openDiagramTab, openFile, refreshFileTree, t.file.createFailed, t.file.fileExists, t.file.folderExists, t.sidebar.newDiagram, t.sidebar.newFolder, t.sidebar.newNote]);

  // 取消创建
  const handleCreateCancel = useCallback(() => {
    setCreating(null);
    setCreateValue("");
  }, []);

  // Build context menu items
  const getContextMenuItems = useCallback((entry: FileEntry): MenuItem[] => {
    const items: MenuItem[] = [];
    
    if (entry.is_dir) {
      items.push(menuItems.newFile(() => handleNewFile(entry.path)));
      items.push({
        label: t.sidebar.newDiagram,
        icon: <Shapes size={14} />,
        onClick: () => handleNewDiagram(entry.path),
      });
      items.push(menuItems.newFolder(() => handleNewFolder(entry.path)));
    }

    if (!entry.is_dir && entry.name.toLowerCase().endsWith(".md")) {
      const favored = isFavorite(entry.path);
      items.push({
        label: favored ? t.favorites.remove : t.favorites.add,
        icon: favored ? <StarOff size={14} /> : <Star size={14} />,
        onClick: () => toggleFavorite(entry.path),
      });
    }
    
    items.push(menuItems.copyPath(() => handleCopyPath(entry.path)));
    items.push(menuItems.showInExplorer(() => handleShowInExplorer(entry.path)));
    items.push(menuItems.rename(() => handleStartRename(entry)));
    items.push(menuItems.delete(() => handleDelete(entry)));
    
    return items;
  }, [handleCopyPath, handleDelete, handleNewDiagram, handleNewFile, handleNewFolder, handleShowInExplorer, handleStartRename, isFavorite, t.favorites.add, t.favorites.remove, t.sidebar.newDiagram, toggleFavorite]);

  // 切换文件夹展开状态
  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const toggleMountedExpanded = useCallback((path: string) => {
    setExpandedMountedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // 处理选中（单击：preview 模式打开）
  const handleSelect = useCallback((entry: FileEntry) => {
    setSelectedPath(entry.path);
    if (!entry.is_dir) {
      const name = entry.name.toLowerCase();
      if (name.endsWith('.db.json')) {
        const dbId = entry.name.replace('.db.json', '');
        const dbName = dbId;
        openDatabaseTab(dbId, dbName);
      } else if (name.endsWith(".excalidraw.json") || name.endsWith(".diagram.json") || name.endsWith(".drawio.json")) {
        openDiagramTab(entry.path);
      } else if (name.endsWith('.pdf')) {
        if (splitView && activePane === 'secondary') {
          openSecondaryPdf(entry.path);
        } else {
          openPDFTab(entry.path);
        }
      } else {
        if (splitView && activePane === 'secondary') {
          openSecondaryFile(entry.path);
        } else {
          openFile(entry.path, { preview: true });
        }
      }
    }
  }, [openFile, openDatabaseTab, openPDFTab, openDiagramTab, splitView, activePane, openSecondaryFile, openSecondaryPdf]);

  // 处理双击（永久打开）
  const handlePermanentOpen = useCallback((entry: FileEntry) => {
    if (entry.is_dir) return;
    const name = entry.name.toLowerCase();
    if (name.endsWith('.db.json') || name.endsWith(".excalidraw.json") || name.endsWith(".diagram.json") || name.endsWith(".drawio.json") || name.endsWith('.pdf')) {
      return; // single-click already opens these as permanent
    }
    if (splitView && activePane === 'secondary') return;
    // Promote the current preview tab (Option B: first click already opened as preview)
    promotePreviewTab();
  }, [splitView, activePane, promotePreviewTab]);

  // 点击空白区域：选中根目录（VS Code 行为）
  const handleTreeBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (!vaultPath) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-file-tree-item]")) return;
    setSelectedPath(vaultPath);
  }, [vaultPath]);

  const handleSelectRoot = useCallback(() => {
    if (!vaultPath) return;
    setSelectedPath(vaultPath);
  }, [vaultPath]);

  const getRootContextMenuItems = useCallback((): MenuItem[] => {
    if (!vaultPath) return [];
    return [
      menuItems.rename(handleStartRootRename),
      menuItems.copyPath(() => handleCopyPath(vaultPath)),
      menuItems.showInExplorer(() => handleShowInExplorer(vaultPath)),
    ];
  }, [handleCopyPath, handleShowInExplorer, handleStartRootRename, vaultPath]);

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
      <div className="p-3 flex items-center justify-between text-[10px] font-semibold text-muted-foreground tracking-[0.2em] uppercase">
        <span className="ui-compact-text ui-compact-hide-md">{t.sidebar.files}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              useFileStore.getState().openAIMainTab();
              // 温和版：仅切换右侧面板 Tab，让 AI 区域消失
              setRightPanelTab("outline");
            }}
            className={cn(
              "w-7 h-7 ui-icon-btn",
              isAIMainActive
                ? "bg-primary/10 text-primary border border-primary/15 hover:bg-primary/12"
                : ""
            )}
            title={t.ai.chat}
          >
            <Bot className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleNewFile()}
            className="w-7 h-7 ui-icon-btn"
            title={t.sidebar.newNote}
          >
            <FilePlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleNewDiagram()}
            className="w-7 h-7 ui-icon-btn"
            title={t.sidebar.newDiagram}
          >
            <Shapes className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleNewFolder()}
            className="w-7 h-7 ui-icon-btn"
            title={t.sidebar.newFolder}
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={refreshFileTree}
            disabled={isLoadingTree}
            className="w-7 h-7 ui-icon-btn disabled:opacity-50 disabled:pointer-events-none"
            title={t.sidebar.refresh}
          >
            <RefreshCw
              className={cn("w-3.5 h-3.5", isLoadingTree && "animate-spin")}
            />
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setMoreMenu({ x: e.clientX, y: e.clientY + 20 });
            }}
            className="w-7 h-7 ui-icon-btn"
            title={t.common.settings}
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-2 mb-2 space-y-2">
        <button 
          onClick={handleQuickNote}
          disabled={!vaultPath}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground bg-background hover:bg-accent border border-border rounded-md transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap min-w-0"
          title={t.file.quickNote}
        >
          <Calendar size={14} />
          <span className="ui-compact-text ui-sidebar-hide">{t.file.quickNote}</span>
        </button>
        
        {/* 语音笔记按钮 */}
        {isRecording ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-ui-md p-2 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-500">
                <div className="relative">
                  <Mic size={14} />
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                </div>
                <span className="text-xs font-medium">
                  {voiceStatus === "saving" ? t.common.loading : 
                   voiceStatus === "summarizing" ? t.common.loading : t.common.loading}
                </span>
              </div>
              {voiceStatus === "recording" && (
                <div className="flex gap-1">
                  <button
                    onClick={stopRecording}
                    className="px-2 py-1 text-xs bg-red-500/90 text-white rounded-ui-sm hover:bg-red-500 transition-colors"
                    title={t.common.save}
                  >
                    {t.common.confirm}
                  </button>
                  <button
                    onClick={cancelRecording}
                    className="px-2 py-1 text-xs bg-muted/60 text-muted-foreground rounded-ui-sm hover:bg-accent/60 transition-colors"
                    title={t.common.cancel}
                  >
                    {t.common.cancel}
                  </button>
                </div>
              )}
              {(voiceStatus === "saving" || voiceStatus === "summarizing") && (
                <Loader2 size={14} className="animate-spin text-muted-foreground" />
              )}
            </div>
            {/* 实时转录预览 */}
            {currentTranscript && (
              <div className="text-xs text-muted-foreground bg-background/50 rounded p-2 max-h-20 overflow-y-auto">
                {currentTranscript.slice(-100)}{currentTranscript.length > 100 ? "..." : ""}
              </div>
            )}
          </div>
        ) : (
          <button 
            onClick={startRecording}
            disabled={!vaultPath}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground bg-background hover:bg-accent border border-border rounded-md transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap min-w-0"
            title={t.file.voiceRecordHint}
          >
            <Mic size={14} />
            <span className="ui-compact-text ui-sidebar-hide">{t.file.voiceNote}</span>
          </button>
        )}
      </div>

      {vaultPath && openClawSnapshot && (openClawSnapshot.status === "detected" || openClawAttachment) && (
        <div className="mx-2 mb-2 rounded-lg border border-border bg-background/70 p-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-foreground">
                {t.sidebar.openClawTitle}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {openClawAttachment ? t.sidebar.openClawAttached : t.sidebar.openClawDetected}
              </div>
            </div>
            <div className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {t.sidebar.openClawArtifacts.replace("{count}", String(openClawSnapshot.artifactFileCount))}
            </div>
          </div>

          <div className="mb-2 grid grid-cols-2 gap-1.5">
            {[
              { label: "AGENTS.md", path: join(openClawSnapshot.workspacePath, "AGENTS.md") },
              { label: "SOUL.md", path: join(openClawSnapshot.workspacePath, "SOUL.md") },
              { label: "USER.md", path: join(openClawSnapshot.workspacePath, "USER.md") },
            ].map((entry) => (
              <button
                key={entry.label}
                type="button"
                onClick={() => void openFile(entry.path)}
                className="truncate rounded-md border border-border bg-background/60 px-2 py-1 text-left text-[11px] text-foreground hover:bg-accent"
              >
                {entry.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void ensureOpenClawTodayMemoryNote(openClawSnapshot.workspacePath).then(openFile)}
              className="truncate rounded-md border border-border bg-background/60 px-2 py-1 text-left text-[11px] text-foreground hover:bg-accent"
            >
              {t.sidebar.openClawTodayMemory}
            </button>
          </div>

          <div className="mb-2 space-y-1">
            <div className="text-[11px] font-medium text-muted-foreground">
              {t.sidebar.openClawRecentMemory}
            </div>
            {openClawRecentMemoryEntries.length === 0 ? (
              <div className="text-[11px] text-muted-foreground">{t.sidebar.openClawNoRecentMemory}</div>
            ) : (
              openClawRecentMemoryEntries.map((path) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => void openFile(path)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2 py-1 text-[11px] hover:bg-accent",
                    currentFile === path ? "bg-accent text-foreground" : "text-muted-foreground",
                  )}
                >
                  <span className="truncate">{getFileName(path).replace(/\.md$/i, "")}</span>
                  <FileText className="h-3 w-3 shrink-0" />
                </button>
              ))
            )}
          </div>

          <div className="mb-2 space-y-1">
            <div className="text-[11px] font-medium text-muted-foreground">
              {t.sidebar.openClawPlans}
            </div>
            {openClawPlanEntries.length === 0 ? (
              <div className="text-[11px] text-muted-foreground">{t.sidebar.openClawNoPlans}</div>
            ) : (
              openClawPlanEntries.map((path) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => void openFile(path)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2 py-1 text-[11px] hover:bg-accent",
                    currentFile === path ? "bg-accent text-foreground" : "text-muted-foreground",
                  )}
                >
                  <span className="truncate">{getFileName(path)}</span>
                  <FileText className="h-3 w-3 shrink-0" />
                </button>
              ))
            )}
          </div>

          {openClawBridgeEntries.length > 0 && (
            <div className="mb-2 space-y-1">
              <div className="text-[11px] font-medium text-muted-foreground">
                {t.sidebar.openClawBridgeNotes}
              </div>
              {openClawBridgeEntries.map((path) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => void openFile(path)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2 py-1 text-[11px] hover:bg-accent",
                    currentFile === path ? "bg-accent text-foreground" : "text-muted-foreground",
                  )}
                >
                  <span className="truncate">{getFileName(path)}</span>
                  <FileText className="h-3 w-3 shrink-0" />
                </button>
              ))}
            </div>
          )}

          <div className="mb-2 space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-medium text-muted-foreground">
                {t.sidebar.openClawCronJobs}
              </div>
              <button
                type="button"
                onClick={() => openCronEditor()}
                className="text-[11px] text-muted-foreground hover:text-foreground"
                title={t.sidebar.openClawCreateCronJob}
              >
                +
              </button>
            </div>
            {openClawCronJobs.length === 0 ? (
              <button
                type="button"
                onClick={() => openCronEditor()}
                className="w-full rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground text-left"
              >
                {t.sidebar.openClawNoCronJobs}
              </button>
            ) : (
              openClawCronJobs.slice(0, 5).map((job) => (
                <button
                  key={job.jobId}
                  type="button"
                  onClick={() => openCronEditor(job.jobId)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
                >
                  <span className="truncate">
                    {job.name}
                    {!job.enabled && <span className="ml-1 opacity-50">({t.sidebar.openClawCronJobDisabled})</span>}
                  </span>
                  <Clock className="h-3 w-3 shrink-0" />
                </button>
              ))
            )}
          </div>

          <div className="flex flex-wrap gap-1">
            {openClawSnapshot.memoryDirectoryPath && (
              <button
                type="button"
                onClick={() => focusTreePath(openClawSnapshot.memoryDirectoryPath as string)}
                className="rounded-md border border-border bg-background/60 px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {t.sidebar.openClawMemoryFolder}
              </button>
            )}
            {openClawArtifactDirectories.map((path) => (
              <button
                key={path}
                type="button"
                onClick={() => focusTreePath(path)}
                className="rounded-md border border-border bg-background/60 px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {getFileName(path)}
              </button>
            ))}
            {openClawSnapshot.memoryDirectoryPath && (
              <button
                type="button"
                onClick={() =>
                  openFilteredView(t.sidebar.openClawSearchMemory, [
                    openClawSnapshot.memoryDirectoryPath as string,
                  ])
                }
                className="rounded-md border border-border bg-background/60 px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {t.sidebar.openClawSearchMemory}
              </button>
            )}
            {openClawSnapshot.planDirectoryPaths.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  openFilteredView(t.sidebar.openClawSearchPlans, openClawSnapshot.planDirectoryPaths)
                }
                className="rounded-md border border-border bg-background/60 px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {t.sidebar.openClawSearchPlans}
              </button>
            )}
            {openClawArtifactDirectories.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  openFilteredView(t.sidebar.openClawSearchArtifacts, openClawArtifactDirectories)
                }
                className="rounded-md border border-border bg-background/60 px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {t.sidebar.openClawSearchArtifacts}
              </button>
            )}
          </div>

          {openClawMountedTree.length > 0 && (
            <div className="mt-3 rounded-md border border-border/70 bg-background/40">
              <div className="border-b border-border/70 px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
                {openClawAttachment?.workspacePath.split(/[/\\]/).pop() || t.sidebar.openClawTitle}
              </div>
              <div className="max-h-56 overflow-y-auto py-1">
                {openClawMountedTree.map((entry) => (
                  <MountedWorkspaceTreeItem
                    key={entry.path}
                    entry={entry}
                    level={0}
                    currentFile={currentFile}
                    expandedPaths={expandedMountedPaths}
                    toggleExpanded={toggleMountedExpanded}
                    onOpen={(path) => void openFile(path)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Favorites */}
      <div className="px-2 mb-2">
        <div className="flex items-center justify-between px-1 mb-1">
          <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">{t.favorites.title}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFavoriteSortMode("manual")}
              className={cn(
                "px-1.5 py-0.5 text-[10px] rounded border transition-colors whitespace-nowrap",
                favoriteSortMode === "manual"
                  ? "bg-accent text-foreground border-border"
                  : "text-muted-foreground border-transparent hover:border-border hover:text-foreground"
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
                  : "text-muted-foreground border-transparent hover:border-border hover:text-foreground"
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
                  : "text-muted-foreground border-transparent hover:border-border hover:text-foreground"
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
                  currentFile === entry.path ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
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

      {/* Vault Name - 也是根目录放置区 */}
      {renamingPath === vaultPath ? (
        <div className="border-b border-border/60 bg-background/35 px-2 py-1.5">
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
            "cursor-pointer select-none px-3 py-2 text-sm font-medium truncate border-b border-border/60 bg-background/35 transition-colors hover:bg-background/45",
            isRootDragOver && "bg-primary/15 ring-1 ring-primary/40 ring-inset",
            selectedPath === vaultPath && "bg-primary/10 ring-1 ring-primary/30 ring-inset text-primary"
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
          selectedPath === vaultPath && "ring-1 ring-primary/20 ring-inset"
        )}
        onScroll={markFileTreeScrollActive}
        onClick={handleTreeBackgroundClick}
      >
        {/* 根目录新建输入框 */}
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

      {/* More Menu */}
      {moreMenu && (
        <ContextMenu
          x={moreMenu.x}
          y={moreMenu.y}
          items={getMoreMenuItems()}
          onClose={closeContextMenu}
        />
      )}

      {/* Status Bar */}
      <div className="p-3 border-t border-border/60 bg-background/35 text-xs text-muted-foreground flex flex-col gap-2">
        {/* RAG 索引状态 */}
        {ragConfig.enabled && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  ragIsIndexing ? 'bg-yellow-500 animate-pulse' : 
                  indexStatus?.initialized ? 'bg-green-500' : 'bg-gray-400'
                }`}></div>
                <span>
                  {ragIsIndexing ? t.rag.indexing : 
                   indexStatus?.initialized ? `${t.rag.indexed}: ${indexStatus.totalFiles} ${t.rag.files}` : `${t.rag.indexed}: ${t.rag.notInitialized}`}
                </span>
              </div>
              
              {/* 索引操作按钮 */}
              <div className="flex items-center gap-1">
                {ragIsIndexing ? (
                  <button
                    onClick={cancelIndex}
                    className="px-1.5 py-0.5 rounded text-[10px] text-red-500 hover:bg-red-500/10 transition-colors"
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
            
            {/* 索引进度条 */}
            {ragIsIndexing && indexStatus?.progress && (
              <div className="space-y-1">
                <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-primary h-full transition-all duration-300"
                    style={{ 
                      width: `${Math.round((indexStatus.progress.current / Math.max(indexStatus.progress.total, 1)) * 100)}%` 
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
        
        {/* RAG 未启用时显示提示 */}
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

// 新建输入框组件
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
          // 延迟一下，避免点击其他地方时立即触发
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

interface MountedWorkspaceTreeItemProps {
  entry: FileEntry;
  level: number;
  currentFile: string | null;
  expandedPaths: Set<string>;
  toggleExpanded: (path: string) => void;
  onOpen: (path: string) => void;
}

function MountedWorkspaceTreeItem({
  entry,
  level,
  currentFile,
  expandedPaths,
  toggleExpanded,
  onOpen,
}: MountedWorkspaceTreeItemProps) {
  const paddingLeft = 12 + level * 14;
  const isExpanded = expandedPaths.has(entry.path);

  if (entry.is_dir) {
    return (
      <div>
        <button
          type="button"
          onClick={() => toggleExpanded(entry.path)}
          className="flex w-full items-center gap-1.5 py-1 pr-2 text-left text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          style={{ paddingLeft }}
        >
          {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          <Folder className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{entry.name}</span>
        </button>
        {isExpanded && Array.isArray(entry.children) && (
          <div>
            {entry.children.map((child) => (
              <MountedWorkspaceTreeItem
                key={child.path}
                entry={child}
                level={level + 1}
                currentFile={currentFile}
                expandedPaths={expandedPaths}
                toggleExpanded={toggleExpanded}
                onOpen={onOpen}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(entry.path)}
      className={cn(
        "flex w-full items-center gap-1.5 py-1 pr-2 text-left text-[11px] hover:bg-accent",
        currentFile === entry.path ? "bg-accent text-foreground" : "text-muted-foreground",
      )}
      style={{ paddingLeft }}
    >
      <File className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{entry.name}</span>
    </button>
  );
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
    }))
  );
  
  const isExpanded = expandedPaths.has(entry.path);
  const isActive = currentFile === entry.path;
  const isSelected = selectedPath === entry.path;
  const isRenaming = renamingPath === entry.path;
  const paddingLeft = 12 + level * 16;

  // 优化高亮逻辑：避免切换文件时的双重高亮
  const selectedIsFile = selectedPath?.toLowerCase().endsWith('.md');
  const showActive = (isActive && (!selectedIsFile || selectedPath === currentFile)) || (isSelected && !entry.is_dir);

  // 是否在当前文件夹下新建
  const isCreatingHere = creating && creating.parentPath === entry.path;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onRenameSubmit();
    } else if (e.key === "Escape") {
      onRenameCancel();
    }
  };

  // 文件夹拖拽开始
  const handleFolderMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // 只处理左键
    
    // 存储拖拽数据到全局
    setDragData({
      wikiLink: '', // 文件夹不支持 wiki 链接
      filePath: entry.path,
      fileName: entry.name,
      isFolder: true,
      startX: e.clientX,
      startY: e.clientY,
      isDragging: false,
    });
  };

  // 拖拽进入文件夹
  const handleMouseEnter = useCallback(() => {
    const dragData = getDragData();
    if (dragData?.isDragging && entry.is_dir) {
      // 不能拖到自己身上
      if (dragData.filePath === entry.path) return;
      // 不能拖到自己的子文件夹
      const normalize = (p: string) => p.replace(/\\/g, "/");
      if (dragData.isFolder && normalize(entry.path).startsWith(normalize(dragData.filePath) + "/")) return;
      setIsDragOver(true);
    }
  }, [entry.path, entry.is_dir]);

  // 拖拽离开文件夹
  const handleMouseLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  // 监听全局拖拽结束，处理文件夹放置
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
        // move actions already report and surface failures in useFileStore
      }
    };
    
    window.addEventListener('lumina-folder-drop', handleFolderDrop as unknown as EventListener);
    return () => {
      window.removeEventListener('lumina-folder-drop', handleFolderDrop as unknown as EventListener);
    };
  }, [isDragOver, entry.path, moveFileToFolder, moveFolderToFolder]);

  if (entry.is_dir) {
    // 文件夹重命名
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
            isDragOver && "bg-primary/15 ring-1 ring-primary/40 ring-inset"
          )}
          style={{ paddingLeft }}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 pointer-events-none" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 pointer-events-none" />
          )}
          {isExpanded ? (
            <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0 pointer-events-none" />
          ) : (
            <Folder className="w-4 h-4 text-muted-foreground shrink-0 pointer-events-none" />
          )}
          <span className="truncate pointer-events-none">{entry.name}</span>
        </div>

        {isExpanded && (
          <div>
            {/* 在此文件夹内新建的输入框 */}
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

  // 根据文件类型显示不同图标
  const getFileIcon = () => {
    const name = entry.name.toLowerCase();
    if (name.endsWith('.db.json')) {
      return <Database className="w-4 h-4 text-slate-500 shrink-0" />;
    }
    if (name.endsWith(".excalidraw.json") || name.endsWith(".diagram.json") || name.endsWith(".drawio.json")) {
      return <Shapes className="w-4 h-4 text-cyan-500 shrink-0" />;
    }
    if (name.endsWith('.pdf')) {
      return <FileText className="w-4 h-4 text-red-500 shrink-0" />;
    }
    if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.gif') || name.endsWith('.webp')) {
      return <Image className="w-4 h-4 text-green-500 shrink-0" />;
    }
    return <File className="w-4 h-4 text-muted-foreground shrink-0" />;
  };

  // 使用鼠标事件模拟拖拽（绑过 Tauri WebView 的 HTML5 拖拽限制）
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // 只处理左键
    
    const linkName = entry.name.replace(/\.(md|db\.json)$/i, '');
    const wikiLink = `[[${linkName}]]`;
    
    // 存储拖拽数据到全局
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
          : "text-muted-foreground hover:bg-accent/45 hover:text-foreground"
      )}
      style={{ paddingLeft: paddingLeft + 20 }}
    >
      <span className="pointer-events-none">{getFileIcon()}</span>
      <span className="truncate pointer-events-none">{getFileName(entry.name)}</span>
    </div>
  );
}
