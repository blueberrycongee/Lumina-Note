import { useState, useCallback } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useFavoriteStore } from "@/stores/useFavoriteStore";
import { useSplitStore } from "@/stores/useSplitStore";
import { useUIStore } from "@/stores/useUIStore";
import { useShallow } from "zustand/react/shallow";
import {
  FileEntry,
  deleteFile,
  renameFile,
  createFile,
  createDir,
  exists,
  openDialog,
  openNewWindow,
  saveFile,
} from "@/lib/host";
import { invoke } from "@/lib/host";
import { reportOperationError } from "@/lib/reportError";
import { IMAGE_EXTENSIONS } from "@/services/assets/imageManager";
import { FolderOpen, AppWindow, Shapes, Star, StarOff } from "lucide-react";
import type { MenuItem } from "../../toolbar/ContextMenu";
import { menuItems } from "../../toolbar/ContextMenu";

// ─── Types ────────────────────────────────────────────────────────────────

export interface CreatingState {
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

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useSidebarFileOperations() {
  const { t, locale } = useLocaleStore();
  const {
    vaultPath,
    fileTree,
    currentFile,
    openFile,
    refreshFileTree,
    closeFile,
    openPDFTab,
    openDiagramTab,
    openImageTab,
    promotePreviewTab,
    moveFileToFolder,
    moveFolderToFolder,
  } = useFileStore(
    useShallow((state) => ({
      vaultPath: state.vaultPath,
      fileTree: state.fileTree,
      currentFile: state.currentFile,
      openFile: state.openFile,
      refreshFileTree: state.refreshFileTree,
      closeFile: state.closeFile,
      openPDFTab: state.openPDFTab,
      openDiagramTab: state.openDiagramTab,
      openImageTab: state.openImageTab,
      promotePreviewTab: state.promotePreviewTab,
      moveFileToFolder: state.moveFileToFolder,
      moveFolderToFolder: state.moveFolderToFolder,
    })),
  );
  const { splitView } = useUIStore();
  const { activePane, openSecondaryFile, openSecondaryPdf } = useSplitStore();
  const { isFavorite, toggleFavorite } = useFavoriteStore(
    useShallow((state) => ({
      isFavorite: state.isFavorite,
      toggleFavorite: state.toggleFavorite,
    })),
  );

  // ── local state ───────────────────────────────────────────────────────
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [creating, setCreating] = useState<CreatingState | null>(null);
  const [createValue, setCreateValue] = useState("");
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [expandedMountedPaths, setExpandedMountedPaths] = useState<Set<string>>(new Set());

  // ── Quick note ────────────────────────────────────────────────────────
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

    let counter = 1;
    while (await exists(filePath)) {
      filePath = `${vaultPath}${sep}${fileName}_${counter}.md`;
      counter++;
    }

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

  // ── Open folder / New window ──────────────────────────────────────────
  const handleOpenFolder = useCallback(async () => {
    try {
      const selected = await openDialog({
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
  }, [handleOpenFolder, handleNewWindow, t.file.openFolder, t.file.newWindow]);

  // ── Delete ────────────────────────────────────────────────────────────
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

  // ── Rename ────────────────────────────────────────────────────────────
  const handleStartRename = useCallback((entry: FileEntry) => {
    setRenamingPath(entry.path);
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
            tab.type === "diagram" ||
            tab.type === "pdf" ||
            tab.type === "image"
          ) {
            const nextPath = replaceFolderPrefix(tab.path);
            if (nextPath !== tab.path) {
              const nextName =
                tab.type === "file"
                  ? nextPath.split(/[/\\]/).pop()?.replace(/\.(md|docx)$/i, "") || tab.name
                  : tab.type === "image"
                    ? nextPath.split(/[/\\]/).pop() || tab.name
                    : tab.name;
              const nextId =
                tab.type === "diagram"
                  ? `__diagram_${nextPath}__`
                  : tab.type === "pdf"
                    ? `__pdf_${nextPath}__`
                    : tab.type === "image"
                      ? `__image_${nextPath}__`
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
      } else {
        await refreshFileTree();
        const { updateTabPath } = useFileStore.getState();
        updateTabPath(renamingPath, newPath);
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

  // ── Copy path / Show in explorer ──────────────────────────────────────
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
  }, []);

  // ── Path helpers ──────────────────────────────────────────────────────
  const getBasePath = useCallback(
    (parentPath?: string): string | null => {
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

      if (currentFile) {
        return getParentDir(currentFile);
      }

      return vaultPath;
    },
    [selectedPath, currentFile, vaultPath, fileTree],
  );

  const expandToPath = useCallback((targetPath: string) => {
    const sep = targetPath.includes("\\") ? "\\" : "/";
    const parts = targetPath.split(sep);
    const pathsToExpand: string[] = [];
    for (let i = 1; i < parts.length; i++) {
      pathsToExpand.push(parts.slice(0, i).join(sep));
    }
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      pathsToExpand.forEach((p) => next.add(p));
      return next;
    });
  }, []);

  const { setLeftSidebarOpen } = useUIStore();
  const focusTreePath = useCallback(
    (targetPath: string) => {
      setLeftSidebarOpen(true);
      expandToPath(targetPath);
      setSelectedPath(targetPath);
    },
    [expandToPath, setLeftSidebarOpen],
  );

  // ── New file / folder / diagram ───────────────────────────────────────
  const handleNewFile = useCallback(
    (parentPath?: string) => {
      const basePath = getBasePath(parentPath);
      if (!basePath) return;
      expandToPath(basePath);
      setCreating({ type: "file", parentPath: basePath });
      setCreateValue("");
    },
    [getBasePath, expandToPath],
  );

  const handleNewFolder = useCallback(
    (parentPath?: string) => {
      const basePath = getBasePath(parentPath);
      if (!basePath) return;
      expandToPath(basePath);
      setCreating({ type: "folder", parentPath: basePath });
      setCreateValue("");
    },
    [getBasePath, expandToPath],
  );

  const handleNewDiagram = useCallback(
    (parentPath?: string) => {
      const basePath = getBasePath(parentPath);
      if (!basePath) return;
      expandToPath(basePath);
      setCreating({ type: "diagram", parentPath: basePath });
      setCreateValue("");
    },
    [getBasePath, expandToPath],
  );

  // ── Create submit / cancel ────────────────────────────────────────────
  const handleCreateSubmit = useCallback(async () => {
    if (!creating || !createValue.trim()) {
      setCreating(null);
      return;
    }

    const trimmed = createValue.trim();
    const sep = creating.parentPath.includes("\\") ? "\\" : "/";

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

  const handleCreateCancel = useCallback(() => {
    setCreating(null);
    setCreateValue("");
  }, []);

  // ── Context menu items ────────────────────────────────────────────────
  const getContextMenuItems = useCallback(
    (entry: FileEntry): MenuItem[] => {
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
    },
    [handleCopyPath, handleDelete, handleNewDiagram, handleNewFile, handleNewFolder, handleShowInExplorer, handleStartRename, isFavorite, t.favorites.add, t.favorites.remove, t.sidebar.newDiagram, toggleFavorite],
  );

  // ── Toggle expanded ───────────────────────────────────────────────────
  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths((prev) => {
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

  // ── Select / Open ─────────────────────────────────────────────────────
  const isImageEntryName = (name: string): boolean => {
    const dot = name.lastIndexOf(".");
    if (dot < 0) return false;
    return IMAGE_EXTENSIONS.has(name.slice(dot).toLowerCase());
  };

  const handleSelect = useCallback(
    (entry: FileEntry) => {
      setSelectedPath(entry.path);
      if (!entry.is_dir) {
        const name = entry.name.toLowerCase();
        if (name.endsWith(".excalidraw.json") || name.endsWith(".diagram.json") || name.endsWith(".drawio.json")) {
          openDiagramTab(entry.path);
        } else if (name.endsWith(".pdf")) {
          if (splitView && activePane === "secondary") {
            openSecondaryPdf(entry.path);
          } else {
            openPDFTab(entry.path);
          }
        } else if (isImageEntryName(name)) {
          openImageTab(entry.path);
        } else {
          if (splitView && activePane === "secondary") {
            openSecondaryFile(entry.path);
          } else {
            openFile(entry.path, { preview: true });
          }
        }
      }
    },
    [openFile, openPDFTab, openDiagramTab, openImageTab, splitView, activePane, openSecondaryFile, openSecondaryPdf],
  );

  const handlePermanentOpen = useCallback(
    (entry: FileEntry) => {
      if (entry.is_dir) return;
      const name = entry.name.toLowerCase();
      if (
        name.endsWith(".excalidraw.json") ||
        name.endsWith(".diagram.json") ||
        name.endsWith(".drawio.json") ||
        name.endsWith(".pdf") ||
        isImageEntryName(name)
      ) {
        return;
      }
      if (splitView && activePane === "secondary") return;
      promotePreviewTab();
    },
    [splitView, activePane, promotePreviewTab],
  );

  // ── Background / root ─────────────────────────────────────────────────
  const handleTreeBackgroundClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      if (!vaultPath) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-file-tree-item]")) return;
      setSelectedPath(vaultPath);
    },
    [vaultPath],
  );

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

  return {
    // state
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
    // store values needed by Sidebar JSX
    vaultPath,
    fileTree,
    currentFile,
    openFile,
    refreshFileTree,
    moveFileToFolder,
    moveFolderToFolder,
    // handlers
    handleQuickNote,
    handleOpenFolder,
    handleNewWindow,
    getMoreMenuItems,
    handleDelete,
    handleStartRename,
    handleStartRootRename,
    handleRename,
    handleCopyPath,
    handleShowInExplorer,
    getBasePath,
    expandToPath,
    focusTreePath,
    handleNewFile,
    handleNewFolder,
    handleNewDiagram,
    handleCreateSubmit,
    handleCreateCancel,
    getContextMenuItems,
    toggleExpanded,
    toggleMountedExpanded,
    handleSelect,
    handlePermanentOpen,
    handleTreeBackgroundClick,
    handleSelectRoot,
    getRootContextMenuItems,
  };
}
