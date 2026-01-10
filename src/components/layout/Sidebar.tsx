import { useState, useCallback, useEffect } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { useRAGStore } from "@/stores/useRAGStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { FileEntry, deleteFile, renameFile, createFile, createDir, exists, openNewWindow, saveFile } from "@/lib/tauri";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
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
  Mic,
  Loader2,
  Bot,
  Star,
  StarOff,
} from "lucide-react";
import { useVoiceNote } from "@/hooks/useVoiceNote";
import { useUIStore } from "@/stores/useUIStore";
import { useSplitStore } from "@/stores/useSplitStore";
import { useFavoriteStore } from "@/stores/useFavoriteStore";

interface ContextMenuState {
  x: number;
  y: number;
  entry: FileEntry | null;
  isDirectory: boolean;
}

// 新建模式状态
interface CreatingState {
  type: "file" | "folder";
  parentPath: string;
}

export function Sidebar() {
  const { t } = useLocaleStore();
  const { vaultPath, fileTree, currentFile, openFile, refreshFileTree, isLoadingTree, closeFile, openDatabaseTab, openPDFTab, tabs, activeTabIndex } =
    useFileStore();
  const { config: ragConfig, isIndexing: ragIsIndexing, indexStatus, rebuildIndex, cancelIndex } = useRAGStore();
  const { setRightPanelTab, splitView } = useUIStore();
  const { activePane, openSecondaryFile, openSecondaryPdf } = useSplitStore();
  const {
    favoriteEntries,
    favoriteSortMode,
    setFavoriteSortMode,
    moveFavorite,
    toggleFavorite,
    isFavorite,
  } = useFavoriteStore((state) => ({
    favoriteEntries: state.getFavorites(state.defaultSortMode),
    favoriteSortMode: state.defaultSortMode,
    setFavoriteSortMode: state.setDefaultSortMode,
    moveFavorite: state.moveFavorite,
    toggleFavorite: state.toggleFavorite,
    isFavorite: state.isFavorite,
  }));
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
    
    const fileName = `速记_${year}-${month}-${day}_${hours}-${minutes}`;
    const sep = vaultPath.includes("\\") ? "\\" : "/";
    let filePath = `${vaultPath}${sep}${fileName}.md`;
    
    // 检查文件是否已存在，如果存在则添加序号
    let counter = 1;
    while (await exists(filePath)) {
      filePath = `${vaultPath}${sep}${fileName}_${counter}.md`;
      counter++;
    }
    
    // 创建文件内容
    const dateStr = `${year}年${month}月${day}日 ${hours}:${minutes}`;
    const content = `# ${fileName}\n\n> 📅 ${dateStr}\n\n`;
    
    try {
      await saveFile(filePath, content);
      await refreshFileTree();
      openFile(filePath);
    } catch (error) {
      console.error("Failed to create quick note:", error);
      alert(t.file.createQuickNoteFailed);
    }
  }, [vaultPath, refreshFileTree, openFile]);
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
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
  // 根目录拖拽悬停状态
  const [isRootDragOver, setIsRootDragOver] = useState(false);

  // 当前是否激活了 AI 主对话标签
  const isAIMainActive = tabs[activeTabIndex]?.type === "ai-chat";

  // 获取 store 的移动方法
  const { moveFileToFolder, moveFolderToFolder } = useFileStore();

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
      } catch (error: any) {
        alert(error?.message || '移动失败');
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

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
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
      console.error("Open folder failed:", error);
    }
  }, []);

  // Handle new window
  const handleNewWindow = useCallback(async () => {
    try {
      await openNewWindow();
    } catch (error) {
      console.error("Open new window failed:", error);
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
      console.error("Delete failed:", error);
    }
  }, [currentFile, closeFile, refreshFileTree]);

  // Handle rename
  const handleStartRename = useCallback((entry: FileEntry) => {
    setRenamingPath(entry.path);
    // 文件：去掉 .md，文件夹：原样
    const baseName = entry.is_dir ? entry.name : entry.name.replace(/\.md$/, "");
    setRenameValue(baseName);
  }, []);

  const handleRename = useCallback(async () => {
    if (!renamingPath || !renameValue.trim()) {
      setRenamingPath(null);
      return;
    }

    const trimmed = renameValue.trim();
    const isDir = !renamingPath.toLowerCase().endsWith(".md");
    const separator = renamingPath.includes("\\") ? "\\" : "/";
    const parentDir = renamingPath.substring(0, renamingPath.lastIndexOf(separator));
    const newPath = isDir
      ? `${parentDir}${separator}${trimmed}`
      : `${parentDir}${separator}${trimmed}.md`;
    
    if (newPath === renamingPath) {
      setRenamingPath(null);
      return;
    }
    
    try {
      await renameFile(renamingPath, newPath);
      refreshFileTree();
      
      // 更新标签页中的路径和名称（如果文件在标签页中打开）
      const { updateTabPath } = useFileStore.getState();
      updateTabPath(renamingPath, newPath);
    } catch (error) {
      console.error("Rename failed:", error);
      alert(t.file.renameFailed);
    }
    setRenamingPath(null);
  }, [renamingPath, renameValue, refreshFileTree, currentFile, openFile]);

  // Handle copy path
  const handleCopyPath = useCallback(async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  }, []);

  // Handle show in explorer - 在资源管理器中显示并选中文件
  const handleShowInExplorer = useCallback(async (path: string) => {
    try {
      await invoke("show_in_explorer", { path });
    } catch (error) {
      console.error("Show in explorer failed:", error);
      // 降级：复制路径
      try {
        await navigator.clipboard.writeText(path);
        alert(`${t.file.openFailed}: ${path}`);
      } catch {
        alert(`${t.common.error}: ${error}`);
      }
    }
  }, []);

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

      // 2. 选中项：如果是文件夹直接用，如果是文件取父目录
      if (selectedPath) {
        // 判断选中的是文件还是文件夹（简单判断：有 .md 后缀是文件）
        if (selectedPath.toLowerCase().endsWith(".md")) {
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
    [selectedPath, currentFile, vaultPath]
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

  // 确认创建（用户按 Enter）
  const handleCreateSubmit = useCallback(async () => {
    if (!creating || !createValue.trim()) {
      setCreating(null);
      return;
    }

    const trimmed = createValue.trim();
    const sep = creating.parentPath.includes("\\") ? "\\" : "/";
    
    // 构建完整路径
    const fullPath = creating.type === "file"
      ? `${creating.parentPath}${sep}${trimmed}${trimmed.endsWith(".md") ? "" : ".md"}`
      : `${creating.parentPath}${sep}${trimmed}`;

    // 检查是否已存在
    try {
      if (await exists(fullPath)) {
        alert(`${creating.type === "file" ? t.file.fileExists : t.file.folderExists}: ${trimmed}`);
        return;
      }
    } catch {
      // ignore
    }

    try {
      if (creating.type === "file") {
        await createFile(fullPath);
        await refreshFileTree();
        openFile(fullPath);
      } else {
        await createDir(fullPath);
        await refreshFileTree();
      }
    } catch (error) {
      console.error("Create failed:", error);
      alert(`${t.file.createFailed}: ${creating.type === "file" ? t.sidebar.newNote : t.sidebar.newFolder}`);
    }

    setCreating(null);
  }, [creating, createValue, refreshFileTree, openFile]);

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
  }, [handleNewFile, handleNewFolder, handleCopyPath, handleShowInExplorer, handleStartRename, handleDelete, isFavorite, toggleFavorite, t.favorites.add, t.favorites.remove]);

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

  // 处理选中（单击高亮）
  const handleSelect = useCallback((entry: FileEntry) => {
    setSelectedPath(entry.path);
    if (!entry.is_dir) {
      const name = entry.name.toLowerCase();
      // 检查是否是数据库文件
      if (name.endsWith('.db.json')) {
        // 从文件名提取数据库 ID（去掉 .db.json 后缀）
        const dbId = entry.name.replace('.db.json', '');
        const dbName = dbId; // 可以后续从文件内容读取真实名称
        openDatabaseTab(dbId, dbName);
      } else if (name.endsWith('.pdf')) {
        // PDF 文件 - 根据活动面板打开
        if (splitView && activePane === 'secondary') {
          openSecondaryPdf(entry.path);
        } else {
          openPDFTab(entry.path);
        }
      } else {
        // Markdown 文件 - 根据活动面板打开
        if (splitView && activePane === 'secondary') {
          openSecondaryFile(entry.path);
        } else {
          openFile(entry.path);
        }
      }
    }
  }, [openFile, openDatabaseTab, openPDFTab, splitView, activePane, openSecondaryFile, openSecondaryPdf]);

  return (
    <aside className="w-full h-full border-r border-border flex flex-col bg-muted/30 transition-colors duration-300">
      {/* Header */}
      <div className="p-3 flex items-center justify-between text-xs font-bold text-muted-foreground tracking-wider uppercase">
        <span>{t.sidebar.files}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              useFileStore.getState().openAIMainTab();
              // 温和版：仅切换右侧面板 Tab，让 AI 区域消失
              setRightPanelTab("outline");
            }}
            className={cn(
              "p-1 rounded transition-colors",
              isAIMainActive
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent"
            )}
            title={t.ai.chat}
          >
            <Bot className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleNewFile()}
            className="p-1 hover:bg-accent rounded transition-colors"
            title={t.sidebar.newNote}
          >
            <FilePlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleNewFolder()}
            className="p-1 hover:bg-accent rounded transition-colors"
            title={t.sidebar.newFolder}
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={refreshFileTree}
            disabled={isLoadingTree}
            className="p-1 hover:bg-accent rounded transition-colors"
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
            className="p-1 hover:bg-accent rounded transition-colors"
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
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground bg-background hover:bg-accent border border-border rounded-md transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          title={t.file.quickNote}
        >
          <Calendar size={14} />
          <span>{t.file.quickNote}</span>
        </button>
        
        {/* 语音笔记按钮 */}
        {isRecording ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-md p-2 space-y-2">
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
                    className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                    title={t.common.save}
                  >
                    {t.common.confirm}
                  </button>
                  <button
                    onClick={cancelRecording}
                    className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded hover:bg-accent transition-colors"
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
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground bg-background hover:bg-accent border border-border rounded-md transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title={t.file.voiceRecordHint}
          >
            <Mic size={14} />
            <span>{t.file.voiceNote}</span>
          </button>
        )}
      </div>

      {/* Favorites */}
      <div className="px-2 mb-2">
        <div className="flex items-center justify-between px-1 mb-1">
          <span className="text-xs font-semibold text-muted-foreground">{t.favorites.title}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFavoriteSortMode("manual")}
              className={cn(
                "px-1.5 py-0.5 text-[10px] rounded border transition-colors",
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
                "px-1.5 py-0.5 text-[10px] rounded border transition-colors",
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
                "px-1.5 py-0.5 text-[10px] rounded border transition-colors",
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
                  "group flex items-center gap-2 px-2 py-1 rounded-md text-xs",
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
                      className="p-0.5 rounded hover:bg-accent"
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
                      className="p-0.5 rounded hover:bg-accent"
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
                  className="p-0.5 rounded hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity"
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
      <div 
        data-folder-path={vaultPath}
        onMouseEnter={() => {
          const dragData = (window as any).__lumina_drag_data;
          if (dragData?.isDragging) {
            setIsRootDragOver(true);
          }
        }}
        onMouseLeave={() => setIsRootDragOver(false)}
        className={cn(
          "px-3 py-2 text-sm font-medium truncate border-b border-border transition-colors",
          isRootDragOver && "bg-primary/20 ring-2 ring-primary ring-inset"
        )}
      >
        {vaultPath?.split(/[/\\]/).pop() || "Notes"}
      </div>

      {/* File Tree */}
      <div className="flex-1 overflow-auto py-2">
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
      <div className="p-3 border-t border-border text-xs text-muted-foreground flex flex-col gap-2">
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
  type: "file" | "folder";
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  level: number;
}

function CreateInputRow({ type, value, onChange, onSubmit, onCancel, level }: CreateInputRowProps) {
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
      className="flex items-center gap-1.5 py-1 px-1"
      style={{ paddingLeft }}
    >
      {type === "folder" ? (
        <Folder className="w-4 h-4 text-muted-foreground shrink-0" />
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
        placeholder={type === "file" ? "文件名" : "文件夹名"}
        className="flex-1 bg-background border border-primary rounded px-1.5 py-0.5 text-sm outline-none"
      />
      {type === "file" && <span className="text-muted-foreground text-sm">.md</span>}
    </div>
  );
}

interface FileTreeItemProps {
  entry: FileEntry;
  currentFile: string | null;
  selectedPath: string | null;
  onSelect: (entry: FileEntry) => void;
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
  const { moveFileToFolder, moveFolderToFolder } = useFileStore();
  
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
    (window as any).__lumina_drag_data = {
      wikiLink: '', // 文件夹不支持 wiki 链接
      filePath: entry.path,
      fileName: entry.name,
      isFolder: true,
      startX: e.clientX,
      startY: e.clientY,
      isDragging: false,
    };
  };

  // 拖拽进入文件夹
  const handleMouseEnter = useCallback(() => {
    const dragData = (window as any).__lumina_drag_data;
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
      } catch (error: any) {
        // 显示错误提示
        alert(error?.message || '移动失败');
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
            className="flex-1 bg-background border border-primary rounded px-1.5 py-0.5 text-sm outline-none"
          />
        </div>
      );
    }

    return (
      <div>
        <div
          role="button"
          tabIndex={0}
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
            "w-full flex items-center gap-1.5 py-1.5 transition-colors text-sm cursor-pointer select-none",
            isSelected ? "bg-accent" : "hover:bg-accent",
            isDragOver && "bg-primary/20 ring-2 ring-primary ring-inset"
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
          className="flex-1 bg-background border border-primary rounded px-1.5 py-0.5 text-sm outline-none"
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
    (window as any).__lumina_drag_data = {
      wikiLink,
      filePath: entry.path,
      fileName: entry.name,
      isFolder: false,
      startX: e.clientX,
      startY: e.clientY,
      isDragging: false,
    };
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      onClick={() => onSelect(entry)}
      onContextMenu={(e) => onContextMenu(e, entry)}
      className={cn(
        "w-full flex items-center gap-1.5 py-1.5 transition-colors text-sm cursor-grab select-none",
        showActive
          ? "bg-primary/10 text-primary"
          : "hover:bg-accent"
      )}
      style={{ paddingLeft: paddingLeft + 20 }}
    >
      <span className="pointer-events-none">{getFileIcon()}</span>
      <span className="truncate pointer-events-none">{getFileName(entry.name)}</span>
    </div>
  );
}
