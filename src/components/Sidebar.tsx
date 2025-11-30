import { useState, useCallback, useEffect } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { useUIStore } from "@/stores/useUIStore";
import { FileEntry, deleteFile, renameFile, createFile, createDir, exists } from "@/lib/tauri";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { cn, getFileName } from "@/lib/utils";
import { ContextMenu, MenuItem, menuItems } from "./ContextMenu";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  RefreshCw,
  MoreHorizontal,
  Calendar,
  Sun,
  Moon,
  FilePlus,
  FolderPlus,
} from "lucide-react";

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
  const { vaultPath, fileTree, currentFile, openFile, refreshFileTree, isLoadingTree, closeFile } =
    useFileStore();
  const { isDarkMode, toggleTheme } = useUIStore();
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
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
  }, []);

  // Handle delete
  const handleDelete = useCallback(async (entry: FileEntry) => {
    const yes = await ask(`确定要删除 "${entry.name}" 吗？\n此操作将把文件移至回收站。`, {
      title: "删除确认",
      kind: "warning",
      okLabel: "删除",
      cancelLabel: "取消",
    });
    
    if (!yes) return;

    try {
      await deleteFile(entry.path);
      if (currentFile === entry.path) {
        closeFile();
      }
      refreshFileTree();
    } catch (error) {
      console.error("Delete failed:", error);
      alert("删除失败");
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
      if (currentFile === renamingPath) {
        openFile(newPath);
      }
    } catch (error) {
      console.error("Rename failed:", error);
      alert("重命名失败");
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
        alert(`打开失败，路径已复制：${path}`);
      } catch {
        alert(`打开失败：${error}`);
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
        alert(`${creating.type === "file" ? "文件" : "文件夹"}"${trimmed}"已存在`);
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
      alert(`创建${creating.type === "file" ? "文件" : "文件夹"}失败`);
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
    
    items.push(menuItems.copyPath(() => handleCopyPath(entry.path)));
    items.push(menuItems.showInExplorer(() => handleShowInExplorer(entry.path)));
    items.push(menuItems.rename(() => handleStartRename(entry)));
    items.push(menuItems.delete(() => handleDelete(entry)));
    
    return items;
  }, [handleNewFile, handleNewFolder, handleCopyPath, handleShowInExplorer, handleStartRename, handleDelete]);

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
      openFile(entry.path);
    }
  }, [openFile]);

  return (
    <aside className="w-full h-full border-r border-border flex flex-col bg-muted/30 dark:bg-[#252526] transition-colors duration-300">
      {/* Header */}
      <div className="p-3 flex items-center justify-between text-xs font-bold text-muted-foreground tracking-wider uppercase">
        <span>资源管理器</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleNewFile()}
            className="p-1 hover:bg-accent rounded transition-colors"
            title="新建文件"
          >
            <FilePlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleNewFolder()}
            className="p-1 hover:bg-accent rounded transition-colors"
            title="新建文件夹"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={refreshFileTree}
            disabled={isLoadingTree}
            className="p-1 hover:bg-accent rounded transition-colors"
            title="刷新"
          >
            <RefreshCw
              className={cn("w-3.5 h-3.5", isLoadingTree && "animate-spin")}
            />
          </button>
          <button className="p-1 hover:bg-accent rounded transition-colors">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Daily Note Quick Action */}
      <div className="px-2 mb-2">
        <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground bg-background dark:bg-[#2d2d2d] hover:bg-accent dark:hover:bg-[#37373d] border border-border rounded-md transition-colors shadow-sm">
          <Calendar size={14} />
          <span>今日速记</span>
        </button>
      </div>

      {/* Vault Name */}
      <div className="px-3 py-2 text-sm font-medium truncate border-b border-border">
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
            未找到 Markdown 文件
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

      {/* Status Bar */}
      <div className="p-3 border-t border-border text-xs text-muted-foreground flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span>索引: 已同步</span>
          </div>
          <button
            onClick={toggleTheme}
            className="p-1 rounded hover:bg-accent transition-colors"
            title="切换深色/浅色模式"
          >
            {isDarkMode ? (
              <Sun size={14} className="text-yellow-400" />
            ) : (
              <Moon size={14} />
            )}
          </button>
        </div>
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
}: FileTreeItemProps) {
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
          className={cn(
            "w-full flex items-center gap-1.5 py-1.5 transition-colors text-sm cursor-pointer",
            isSelected ? "bg-accent" : "hover:bg-accent"
          )}
          style={{ paddingLeft }}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          {isExpanded ? (
            <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <Folder className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          <span className="truncate">{entry.name}</span>
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

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(entry)}
      onContextMenu={(e) => onContextMenu(e, entry)}
      onKeyDown={(e) => e.key === "Enter" && onSelect(entry)}
      className={cn(
        "w-full flex items-center gap-1.5 py-1.5 transition-colors text-sm cursor-pointer",
        showActive
          ? "bg-primary/10 text-primary"
          : "hover:bg-accent"
      )}
      style={{ paddingLeft: paddingLeft + 20 }}
    >
      <File className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="truncate">{getFileName(entry.name)}</span>
    </div>
  );
}
