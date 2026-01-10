import { create } from "zustand";
import { persist } from "zustand/middleware";
import { FileEntry, listDirectory, readFile, saveFile, createFile } from "@/lib/tauri";
import { VideoNoteFile, parseVideoNoteMd } from '@/types/videoNote';
import { invoke } from '@tauri-apps/api/core';
import { useFavoriteStore } from "@/stores/useFavoriteStore";

// 历史记录条目
interface HistoryEntry {
  content: string;
  type: "user" | "ai";
  timestamp: number;
  description?: string;
}

// 标签页类型
export type TabType =
  | "file"
  | "graph"
  | "isolated-graph"
  | "video-note"
  | "database"
  | "pdf"
  | "ai-chat"
  | "webpage"
  | "flashcard"
  | "cardflow";

// 孤立视图节点信息
export interface IsolatedNodeInfo {
  id: string;
  label: string;
  path: string;
  isFolder: boolean;
}

// 标签页
export interface Tab {
  id: string; // 唯一标识
  type: TabType;
  path: string; // 文件路径，特殊标签页为空
  name: string;
  content: string;
  isDirty: boolean;
  isPinned?: boolean; // 是否固定
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  isolatedNode?: IsolatedNodeInfo; // 孤立视图的目标节点
  videoUrl?: string; // 视频笔记的 URL
  videoNoteData?: VideoNoteFile; // 从分享或内容打开时传入的笔记数据
  databaseId?: string; // 数据库 ID
  webpageUrl?: string; // 网页 URL
  webpageTitle?: string; // 网页标题
  flashcardDeckId?: string; // 闪卡牌组 ID
}

interface FileState {
  // Vault
  vaultPath: string | null;
  fileTree: FileEntry[];

  // Tabs
  tabs: Tab[];
  activeTabIndex: number;

  // Current file (derived from active tab)
  currentFile: string | null;
  currentContent: string;
  isDirty: boolean;

  // Undo/Redo history
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  lastSavedContent: string;

  // Navigation history (browser-like back/forward)
  navigationHistory: string[];
  navigationIndex: number;

  // Recent files history
  recentFiles: string[];

  // Loading states
  isLoadingTree: boolean;
  isLoadingFile: boolean;
  isSaving: boolean;

  // Actions
  setVaultPath: (path: string) => Promise<void>;
  refreshFileTree: () => Promise<void>;
  openFile: (path: string, addToHistory?: boolean, forceReload?: boolean) => Promise<void>;
  updateContent: (content: string, source?: "user" | "ai", description?: string) => void;
  save: () => Promise<void>;
  closeFile: () => void;

  // Tab actions
  switchTab: (index: number) => void;
  closeTab: (index: number) => Promise<void>;
  closeOtherTabs: (index: number) => Promise<void>;
  closeAllTabs: () => Promise<void>;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  togglePinTab: (index: number) => void;
  updateTabPath: (oldPath: string, newPath: string) => void;

  // Create new file
  createNewFile: (fileName?: string) => Promise<void>;

  // Open special tabs
  openGraphTab: () => void;
  openIsolatedGraphTab: (node: IsolatedNodeInfo) => void;
  openVideoNoteTab: (url: string, title?: string) => void;
  openVideoNoteFromContent: (content: string, title?: string) => void;
  openDatabaseTab: (dbId: string, dbName: string) => void;
  openPDFTab: (pdfPath: string) => void;
  openAIMainTab: () => void;
  openWebpageTab: (url: string, title?: string) => void;
  updateWebpageTab: (tabId: string, url?: string, title?: string) => void;
  openFlashcardTab: (deckId?: string) => void;
  openCardFlowTab: () => void;

  // Undo/Redo actions
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  pushHistory: (type: "user" | "ai", description?: string) => void;

  // Navigation actions
  goBack: () => void;
  goForward: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;

  // File sync actions
  reloadFileIfOpen: (path: string) => Promise<void>;

  // Move file/folder actions
  moveFileToFolder: (sourcePath: string, targetFolder: string) => Promise<void>;
  moveFolderToFolder: (sourcePath: string, targetFolder: string) => Promise<void>;

  // Workspace actions
  clearVault: () => void;
}

// 用户编辑的 debounce 时间（毫秒）
const USER_EDIT_DEBOUNCE = 1000;
let lastUserEditTime = 0;

// 撤销历史最大条数（防止内存泄漏）
const MAX_UNDO_HISTORY = 50;

// 限制 undoStack 大小的辅助函数
function trimUndoStack(stack: HistoryEntry[]): HistoryEntry[] {
  if (stack.length <= MAX_UNDO_HISTORY) return stack;
  // 移除最旧的记录，保留最新的 MAX_UNDO_HISTORY 条
  return stack.slice(stack.length - MAX_UNDO_HISTORY);
}

export const useFileStore = create<FileState>()(
  persist(
    (set, get) => ({
      // Initial state
      vaultPath: null,
      fileTree: [],

      // Tabs
      tabs: [],
      activeTabIndex: -1,

      currentFile: null,
      currentContent: "",
      isDirty: false,
      isLoadingTree: false,
      isLoadingFile: false,
      isSaving: false,

      // Undo/Redo state
      undoStack: [],
      redoStack: [],
      lastSavedContent: "",

      // Navigation history
      navigationHistory: [],
      navigationIndex: -1,
      recentFiles: [],

      // Set vault path and load file tree
      setVaultPath: async (path: string) => {
        set({ vaultPath: path, isLoadingTree: true });
        try {
          const tree = await listDirectory(path);
          set({ fileTree: tree, isLoadingTree: false });
        } catch (error) {
          console.error("Failed to load vault:", error);
          set({ isLoadingTree: false });
        }
      },

      // Refresh file tree
      refreshFileTree: async () => {
        const { vaultPath } = get();
        if (!vaultPath) return;

        set({ isLoadingTree: true });
        try {
          const tree = await listDirectory(vaultPath);
          set({ fileTree: tree, isLoadingTree: false });
          useFavoriteStore.getState().pruneMissing(tree);
        } catch (error) {
          console.error("Failed to refresh file tree:", error);
          set({ isLoadingTree: false });
        }
      },

      // Open a file
      openFile: async (path: string, addToHistory: boolean = true, forceReload: boolean = false) => {
        const { tabs, activeTabIndex, navigationHistory, navigationIndex } = get();

        // Normalize paths for comparison (handle Windows backslashes)
        const normalize = (p: string) => p.replace(/\\/g, "/");
        const targetPath = normalize(path);

        // 检查是否已经在标签页中打开
        const existingTabIndex = tabs.findIndex(tab => normalize(tab.path) === targetPath);
        if (existingTabIndex !== -1) {
          // 已有此标签页
          if (forceReload) {
            // 强制重新加载内容（Agent 编辑后使用）
            try {
              const newContent = await readFile(path);
              const updatedTabs = [...tabs];
              updatedTabs[existingTabIndex] = {
                ...updatedTabs[existingTabIndex],
                content: newContent,
                isDirty: false,
              };
              set({
                tabs: updatedTabs,
                activeTabIndex: existingTabIndex,
                currentFile: path,
                currentContent: newContent,
                isDirty: false,
                lastSavedContent: newContent,
              });
            } catch (error) {
              console.error("Failed to reload file:", error);
              // 即使重载失败也切换到该标签页
              get().switchTab(existingTabIndex);
            }
          } else {
            // 直接切换
            get().switchTab(existingTabIndex);
          }
          return;
        }

        // 保存当前标签页的状态
        if (activeTabIndex >= 0 && tabs[activeTabIndex]) {
          const currentTab = tabs[activeTabIndex];
          if (currentTab.isDirty) {
            await get().save();
          }
        }

        set({ isLoadingFile: true });
        try {
          const content = await readFile(path);
          const fileName = path.split(/[/\\]/).pop()?.replace(/\.md$/, "") || "未命名";

          // 创建新标签页
          const newTab: Tab = {
            id: path,
            type: "file",
            path,
            name: fileName,
            content,
            isDirty: false,
            undoStack: [],
            redoStack: [],
          };

          const newTabs = [...tabs, newTab];
          const newTabIndex = newTabs.length - 1;

          // 更新导航历史
          let newHistory = navigationHistory;
          let newNavIndex = navigationIndex;

          if (addToHistory) {
            newHistory = navigationHistory.slice(0, navigationIndex + 1);
            newHistory.push(path);
            newNavIndex = newHistory.length - 1;

            if (newHistory.length > 50) {
              newHistory = newHistory.slice(-50);
              newNavIndex = newHistory.length - 1;
            }
          }

          // 更新最近文件列表
          const { recentFiles } = get();
          let newRecentFiles = recentFiles.filter(p => p !== path);
          newRecentFiles.push(path);
          if (newRecentFiles.length > 20) {
            newRecentFiles = newRecentFiles.slice(-20);
          }

          set({
            tabs: newTabs,
            activeTabIndex: newTabIndex,
            currentFile: path,
            currentContent: content,
            isDirty: false,
            isLoadingFile: false,
            undoStack: [],
            redoStack: [],
            lastSavedContent: content,
            navigationHistory: newHistory,
            navigationIndex: newNavIndex,
            recentFiles: newRecentFiles,
          });
          useFavoriteStore.getState().markOpened(path);
        } catch (error) {
          console.error("Failed to open file:", error);
          set({ isLoadingFile: false });
        }
      },

      // 切换标签页
      switchTab: (index: number) => {
        const { tabs, activeTabIndex, currentContent, isDirty, undoStack, redoStack } = get();
        if (index < 0 || index >= tabs.length || index === activeTabIndex) return;

        // 保存当前标签页的状态
        if (activeTabIndex >= 0 && tabs[activeTabIndex]) {
          const updatedTabs = [...tabs];
          updatedTabs[activeTabIndex] = {
            ...updatedTabs[activeTabIndex],
            content: currentContent,
            isDirty,
            undoStack,
            redoStack,
          };

          // 切换到新标签页
          const targetTab = updatedTabs[index];
          set({
            tabs: updatedTabs,
            activeTabIndex: index,
            currentFile: targetTab.path,
            currentContent: targetTab.content,
            isDirty: targetTab.isDirty,
            undoStack: targetTab.undoStack,
            redoStack: targetTab.redoStack,
            lastSavedContent: targetTab.content,
          });
        } else {
          // 没有当前标签页，直接切换
          const targetTab = tabs[index];
          set({
            activeTabIndex: index,
            currentFile: targetTab.path,
            currentContent: targetTab.content,
            isDirty: targetTab.isDirty,
            undoStack: targetTab.undoStack,
            redoStack: targetTab.redoStack,
            lastSavedContent: targetTab.content,
          });
        }
      },

      // 关闭标签页
      closeTab: async (index: number) => {
        const { tabs, activeTabIndex, currentContent, isDirty, undoStack, redoStack } = get();
        if (index < 0 || index >= tabs.length) return;

        const tabToClose = tabs[index];

        // 固定标签不能关闭
        if (tabToClose.isPinned) return;

        // 如果要关闭的是当前标签页且有未保存的更改，先保存
        if (index === activeTabIndex && isDirty) {
          await get().save();
        } else if (tabs[index].isDirty) {
          // 非当前标签页但有未保存更改，也保存
          await saveFile(tabs[index].path, tabs[index].content);
        }

        // 如果是网页标签页，关闭对应的 WebView
        if (tabToClose.type === 'webpage') {
          try {
            await invoke('close_browser_webview', { tabId: tabToClose.id });
            console.log('[FileStore] 关闭 WebView:', tabToClose.id);
          } catch (err) {
            console.error('[FileStore] 关闭 WebView 失败:', err);
          }
        }

        const newTabs = tabs.filter((_, i) => i !== index);

        if (newTabs.length === 0) {
          // 没有标签页了
          set({
            tabs: [],
            activeTabIndex: -1,
            currentFile: null,
            currentContent: "",
            isDirty: false,
            undoStack: [],
            redoStack: [],
          });
        } else {
          // 还有其他标签页
          let newActiveIndex = activeTabIndex;

          if (index === activeTabIndex) {
            // 关闭的是当前标签页
            newActiveIndex = Math.min(index, newTabs.length - 1);
          } else if (index < activeTabIndex) {
            // 关闭的是当前标签页前面的
            newActiveIndex = activeTabIndex - 1;
          }

          // 先更新 tabs
          if (index !== activeTabIndex && activeTabIndex >= 0 && tabs[activeTabIndex]) {
            // 保存当前标签页状态到新的 tabs 数组
            const currentTabNewIndex = activeTabIndex > index ? activeTabIndex - 1 : activeTabIndex;
            if (currentTabNewIndex >= 0 && newTabs[currentTabNewIndex]) {
              newTabs[currentTabNewIndex] = {
                ...newTabs[currentTabNewIndex],
                content: currentContent,
                isDirty,
                undoStack,
                redoStack,
              };
            }
          }

          const targetTab = newTabs[newActiveIndex];
          set({
            tabs: newTabs,
            activeTabIndex: newActiveIndex,
            currentFile: targetTab.path,
            currentContent: targetTab.content,
            isDirty: targetTab.isDirty,
            undoStack: targetTab.undoStack,
            redoStack: targetTab.redoStack,
            lastSavedContent: targetTab.content,
          });
        }
      },

      // 关闭其他标签页（保留固定标签）
      closeOtherTabs: async (index: number) => {
        const { tabs } = get();
        if (index < 0 || index >= tabs.length) return;

        const targetTab = tabs[index];

        // 保存所有要关闭的标签页
        for (const tab of tabs) {
          if (tab.isDirty && tab.id !== targetTab.id && !tab.isPinned) {
            await saveFile(tab.path, tab.content);
          }
        }

        // 保留固定标签和当前标签
        const remainingTabs = tabs.filter(tab => tab.isPinned || tab.id === targetTab.id);
        const newActiveIndex = remainingTabs.findIndex(t => t.id === targetTab.id);

        set({
          tabs: remainingTabs,
          activeTabIndex: newActiveIndex >= 0 ? newActiveIndex : 0,
          currentFile: targetTab.path,
          currentContent: targetTab.content,
          isDirty: false,
          undoStack: targetTab.undoStack,
          redoStack: targetTab.redoStack,
        });
      },

      // 关闭所有标签页（保留固定标签）
      closeAllTabs: async () => {
        const { tabs } = get();

        // 保存所有要关闭的标签页
        for (const tab of tabs) {
          if (tab.isDirty && !tab.isPinned) {
            await saveFile(tab.path, tab.content);
          }
        }

        // 保留固定标签
        const pinnedTabs = tabs.filter(tab => tab.isPinned);

        if (pinnedTabs.length === 0) {
          set({
            tabs: [],
            activeTabIndex: -1,
            currentFile: null,
            currentContent: "",
            isDirty: false,
            undoStack: [],
            redoStack: [],
          });
        } else {
          // 切换到第一个固定标签
          const firstPinned = pinnedTabs[0];
          set({
            tabs: pinnedTabs,
            activeTabIndex: 0,
            currentFile: firstPinned.path,
            currentContent: firstPinned.content,
            isDirty: firstPinned.isDirty,
            undoStack: firstPinned.undoStack,
            redoStack: firstPinned.redoStack,
          });
        }
      },

      // 更新标签页路径（用于文件重命名）
      updateTabPath: (oldPath: string, newPath: string) => {
        const { tabs, currentFile } = get();
        const newFileName = newPath.split(/[/\\/]/).pop()?.replace(/\.md$/, "") || "未命名";

        // 查找并更新所有匹配的标签页
        const updatedTabs = tabs.map(tab => {
          if (tab.type === "file" && tab.path === oldPath) {
            return {
              ...tab,
              path: newPath,
              name: newFileName,
              id: newPath, // 更新 id 以匹配新路径
            };
          }
          return tab;
        });

        // 如果当前打开的是被重命名的文件，更新 currentFile
        const newState: Partial<FileState> = { tabs: updatedTabs };
        if (currentFile === oldPath) {
          newState.currentFile = newPath;
        }

        set(newState);
        useFavoriteStore.getState().updatePath(oldPath, newPath);
      },

      // 重新排序标签页
      reorderTabs: (fromIndex: number, toIndex: number) => {
        const { tabs, activeTabIndex } = get();
        if (fromIndex === toIndex) return;
        if (fromIndex < 0 || fromIndex >= tabs.length) return;
        if (toIndex < 0 || toIndex >= tabs.length) return;

        const movedTab = tabs[fromIndex];
        const pinnedCount = tabs.filter(t => t.isPinned).length;

        // 固定标签只能在固定区域内移动，非固定标签不能移到固定区域
        if (movedTab.isPinned) {
          // 固定标签不能移到非固定区域
          if (toIndex >= pinnedCount) return;
        } else {
          // 非固定标签不能移到固定区域
          if (toIndex < pinnedCount) return;
        }

        const newTabs = [...tabs];
        newTabs.splice(fromIndex, 1);
        newTabs.splice(toIndex, 0, movedTab);

        // 更新活动标签页索引
        let newActiveIndex = activeTabIndex;
        if (activeTabIndex === fromIndex) {
          newActiveIndex = toIndex;
        } else if (fromIndex < activeTabIndex && toIndex >= activeTabIndex) {
          newActiveIndex = activeTabIndex - 1;
        } else if (fromIndex > activeTabIndex && toIndex <= activeTabIndex) {
          newActiveIndex = activeTabIndex + 1;
        }

        set({ tabs: newTabs, activeTabIndex: newActiveIndex });
      },

      // 固定/取消固定标签页
      togglePinTab: (index: number) => {
        const { tabs, activeTabIndex } = get();
        if (index < 0 || index >= tabs.length) return;

        const tab = tabs[index];
        const newIsPinned = !tab.isPinned;
        const newTabs = [...tabs];

        // 更新固定状态
        newTabs[index] = { ...tab, isPinned: newIsPinned };

        // 重新排序：固定的标签移到最前面
        const pinnedTabs = newTabs.filter(t => t.isPinned);
        const unpinnedTabs = newTabs.filter(t => !t.isPinned);
        const sortedTabs = [...pinnedTabs, ...unpinnedTabs];

        // 找到当前活动标签在新数组中的位置
        const activeTabId = tabs[activeTabIndex]?.id;
        const newActiveIndex = sortedTabs.findIndex(t => t.id === activeTabId);

        set({
          tabs: sortedTabs,
          activeTabIndex: newActiveIndex >= 0 ? newActiveIndex : 0
        });
      },

      // 打开图谱标签页
      openGraphTab: () => {
        const { tabs, activeTabIndex, currentContent, isDirty, undoStack, redoStack } = get();

        // 检查是否已经打开
        const existingIndex = tabs.findIndex(tab => tab.type === "graph");
        if (existingIndex !== -1) {
          get().switchTab(existingIndex);
          return;
        }

        // 保存当前标签页状态
        let updatedTabs = [...tabs];
        if (activeTabIndex >= 0 && tabs[activeTabIndex]) {
          updatedTabs[activeTabIndex] = {
            ...updatedTabs[activeTabIndex],
            content: currentContent,
            isDirty,
            undoStack,
            redoStack,
          };
        }

        // 创建图谱标签页
        const graphTab: Tab = {
          id: "__graph__",
          type: "graph",
          path: "",
          name: "关系图谱",
          content: "",
          isDirty: false,
          undoStack: [],
          redoStack: [],
        };

        updatedTabs.push(graphTab);

        set({
          tabs: updatedTabs,
          activeTabIndex: updatedTabs.length - 1,
          currentFile: null,
          currentContent: "",
          isDirty: false,
        });
      },

      // 打开主视图区 AI 聊天标签页
      openAIMainTab: () => {
        const { tabs, activeTabIndex, currentContent, isDirty, undoStack, redoStack } = get();

        // 如果已经有 ai-chat 标签页，直接切换
        const existingIndex = tabs.findIndex((tab) => tab.type === "ai-chat");
        if (existingIndex !== -1) {
          get().switchTab(existingIndex);
          return;
        }

        // 保存当前标签页状态
        let updatedTabs = [...tabs];
        if (activeTabIndex >= 0 && tabs[activeTabIndex]) {
          updatedTabs[activeTabIndex] = {
            ...updatedTabs[activeTabIndex],
            content: currentContent,
            isDirty,
            undoStack,
            redoStack,
          };
        }

        // 创建 AI 聊天标签页
        const aiTab: Tab = {
          id: "__ai_chat__",
          type: "ai-chat",
          path: "",
          name: "AI 聊天",
          content: "",
          isDirty: false,
          undoStack: [],
          redoStack: [],
        };

        updatedTabs.push(aiTab);

        set({
          tabs: updatedTabs,
          activeTabIndex: updatedTabs.length - 1,
          currentFile: null,
          currentContent: "",
          isDirty: false,
          undoStack: [],
          redoStack: [],
          lastSavedContent: "",
        });
      },

      // 打开孤立图谱标签页
      openIsolatedGraphTab: (node: IsolatedNodeInfo) => {
        const { tabs, activeTabIndex, currentContent, isDirty, undoStack, redoStack } = get();

        // 每次都创建新标签页（允许多个孤立视图）
        const tabId = `__isolated_${node.id}_${Date.now()}__`;

        // 保存当前标签页状态
        let updatedTabs = [...tabs];
        if (activeTabIndex >= 0 && tabs[activeTabIndex]) {
          updatedTabs[activeTabIndex] = {
            ...updatedTabs[activeTabIndex],
            content: currentContent,
            isDirty,
            undoStack,
            redoStack,
          };
        }

        // 创建孤立图谱标签页
        const isolatedTab: Tab = {
          id: tabId,
          type: "isolated-graph",
          path: node.path,
          name: `孤立: ${node.label}`,
          content: "",
          isDirty: false,
          undoStack: [],
          redoStack: [],
          isolatedNode: node,
        };

        updatedTabs.push(isolatedTab);

        set({
          tabs: updatedTabs,
          activeTabIndex: updatedTabs.length - 1,
          currentFile: null,
          currentContent: "",
          isDirty: false,
        });
      },

      // 打开视频笔记标签页（单例模式：只允许一个视频标签页）
      openVideoNoteTab: (url: string, title?: string) => {
        const { tabs, activeTabIndex, currentContent, isDirty, undoStack, redoStack } = get();

        // 检查是否已有视频标签页
        const existingVideoIndex = tabs.findIndex(t => t.type === "video-note");

        if (existingVideoIndex >= 0) {
          // 已有视频标签页，更新 URL 并切换过去
          const updatedTabs = [...tabs];

          // 保存当前标签页状态
          if (activeTabIndex >= 0 && tabs[activeTabIndex]) {
            updatedTabs[activeTabIndex] = {
              ...updatedTabs[activeTabIndex],
              content: currentContent,
              isDirty,
              undoStack,
              redoStack,
            };
          }

          // 提取 BV 号
          const bvidMatch = url.match(/BV[A-Za-z0-9]+/);
          const bvid = bvidMatch ? bvidMatch[0] : "";

          // 更新视频标签页
          updatedTabs[existingVideoIndex] = {
            ...updatedTabs[existingVideoIndex],
            videoUrl: url,
            name: title || `视频-${bvid}`,
          };

          set({
            tabs: updatedTabs,
            activeTabIndex: existingVideoIndex,
            currentFile: null,
            currentContent: "",
            isDirty: false,
          });
          return;
        }

        // 没有视频标签页，创建新的
        const bvidMatch = url.match(/BV[A-Za-z0-9]+/);
        const bvid = bvidMatch ? bvidMatch[0] : Date.now().toString();
        const tabId = `__video_${bvid}__`;

        // 保存当前标签页状态
        let updatedTabs = [...tabs];
        if (activeTabIndex >= 0 && tabs[activeTabIndex]) {
          updatedTabs[activeTabIndex] = {
            ...updatedTabs[activeTabIndex],
            content: currentContent,
            isDirty,
            undoStack,
            redoStack,
          };
        }

        // 创建视频笔记标签页
        const videoTab: Tab = {
          id: tabId,
          type: "video-note",
          path: "",
          name: title || `视频-${bvid}`,
          content: "",
          isDirty: false,
          undoStack: [],
          redoStack: [],
          videoUrl: url,
        };

        updatedTabs.push(videoTab);

        set({
          tabs: updatedTabs,
          activeTabIndex: updatedTabs.length - 1,
          currentFile: null,
          currentContent: "",
          isDirty: false,
        });
      },

      // 从已分享的 Markdown 内容打开视频笔记（支持识别并加载时间戳）
      openVideoNoteFromContent: (content: string, title?: string) => {
        const { tabs, activeTabIndex, currentContent, isDirty, undoStack, redoStack } = get();

        try {
          const parsed = parseVideoNoteMd(content);
          if (!parsed) {
            // 如果不是视频笔记格式，降级为创建空视频标签（不设置数据）
            get().openVideoNoteTab('', title);
            return;
          }

          // 单例视频标签：如果已存在则更新数据并切换
          const existingVideoIndex = tabs.findIndex(t => t.type === 'video-note');
          if (existingVideoIndex >= 0) {
            const updatedTabs = [...tabs];
            if (activeTabIndex >= 0 && tabs[activeTabIndex]) {
              updatedTabs[activeTabIndex] = {
                ...updatedTabs[activeTabIndex],
                content: currentContent,
                isDirty,
                undoStack,
                redoStack,
              };
            }

            updatedTabs[existingVideoIndex] = {
              ...updatedTabs[existingVideoIndex],
              videoUrl: parsed.video.url,
              name: title || parsed.video.title || `视频-${parsed.video.bvid}`,
              videoNoteData: parsed,
            } as Tab;

            set({
              tabs: updatedTabs,
              activeTabIndex: existingVideoIndex,
              currentFile: null,
              currentContent: '',
              isDirty: false,
            });
            return;
          }

          // 创建新的 video-note 标签并附带解析后的笔记数据
          const bvidMatch = parsed.video.bvid ? parsed.video.bvid.match(/BV[A-Za-z0-9]+/) : null;
          const bvid = bvidMatch ? bvidMatch[0] : Date.now().toString();
          const tabId = `__video_${bvid}__`;

          let updatedTabs = [...tabs];
          if (activeTabIndex >= 0 && tabs[activeTabIndex]) {
            updatedTabs[activeTabIndex] = {
              ...updatedTabs[activeTabIndex],
              content: currentContent,
              isDirty,
              undoStack,
              redoStack,
            };
          }

          const videoTab: Tab = {
            id: tabId,
            type: 'video-note',
            path: '',
            name: title || parsed.video.title || `视频-${bvid}`,
            content: '',
            isDirty: false,
            undoStack: [],
            redoStack: [],
            videoUrl: parsed.video.url,
            videoNoteData: parsed,
          };

          updatedTabs.push(videoTab);

          set({
            tabs: updatedTabs,
            activeTabIndex: updatedTabs.length - 1,
            currentFile: null,
            currentContent: '',
            isDirty: false,
          });
        } catch (error) {
          console.error('openVideoNoteFromContent failed:', error);
          // fallback
          get().openVideoNoteTab('', title);
        }
      },

      // 打开数据库标签页
      openDatabaseTab: (dbId: string, dbName: string) => {
        const { tabs, activeTabIndex, currentContent, isDirty, undoStack, redoStack } = get();

        // 检查是否已有此数据库的标签页
        const existingDbIndex = tabs.findIndex(t => t.type === "database" && t.databaseId === dbId);

        if (existingDbIndex >= 0) {
          // 已有此数据库标签页，直接切换
          let updatedTabs = [...tabs];

          // 保存当前标签页状态
          if (activeTabIndex >= 0 && tabs[activeTabIndex]) {
            updatedTabs[activeTabIndex] = {
              ...updatedTabs[activeTabIndex],
              content: currentContent,
              isDirty,
              undoStack,
              redoStack,
            };
          }

          set({
            tabs: updatedTabs,
            activeTabIndex: existingDbIndex,
            currentFile: null,
            currentContent: "",
            isDirty: false,
          });
          return;
        }

        // 创建新数据库标签页
        const tabId = `__database_${dbId}__`;

        // 保存当前标签页状态
        let updatedTabs = [...tabs];
        if (activeTabIndex >= 0 && tabs[activeTabIndex]) {
          updatedTabs[activeTabIndex] = {
            ...updatedTabs[activeTabIndex],
            content: currentContent,
            isDirty,
            undoStack,
            redoStack,
          };
        }

        // 创建数据库标签页
        const dbTab: Tab = {
          id: tabId,
          type: "database",
          path: "",
          name: dbName,
          content: "",
          isDirty: false,
          undoStack: [],
          redoStack: [],
          databaseId: dbId,
        };

        updatedTabs.push(dbTab);

        set({
          tabs: updatedTabs,
          activeTabIndex: updatedTabs.length - 1,
          currentFile: null,
          currentContent: "",
          isDirty: false,
        });
      },

      // 打开 PDF 标签页
      openPDFTab: (pdfPath: string) => {
        const { tabs, activeTabIndex, currentContent, isDirty, undoStack, redoStack } = get();

        // 检查是否已有此 PDF 的标签页
        const existingPdfIndex = tabs.findIndex(t => t.type === "pdf" && t.path === pdfPath);

        if (existingPdfIndex >= 0) {
          // 已有此 PDF 标签页，直接切换
          let updatedTabs = [...tabs];

          // 保存当前标签页状态
          if (activeTabIndex >= 0 && tabs[activeTabIndex]) {
            updatedTabs[activeTabIndex] = {
              ...updatedTabs[activeTabIndex],
              content: currentContent,
              isDirty,
              undoStack,
              redoStack,
            };
          }

          set({
            tabs: updatedTabs,
            activeTabIndex: existingPdfIndex,
            currentFile: pdfPath,
            currentContent: "",
            isDirty: false,
          });
          return;
        }

        // 创建新 PDF 标签页
        const pdfName = pdfPath.split(/[/\\]/).pop() || "PDF";
        const tabId = `__pdf_${pdfPath}__`;

        // 保存当前标签页状态
        let updatedTabs = [...tabs];
        if (activeTabIndex >= 0 && tabs[activeTabIndex]) {
          updatedTabs[activeTabIndex] = {
            ...updatedTabs[activeTabIndex],
            content: currentContent,
            isDirty,
            undoStack,
            redoStack,
          };
        }

        // 创建 PDF 标签页
        const pdfTab: Tab = {
          id: tabId,
          type: "pdf",
          path: pdfPath,
          name: pdfName,
          content: "",
          isDirty: false,
          undoStack: [],
          redoStack: [],
        };

        updatedTabs.push(pdfTab);

        set({
          tabs: updatedTabs,
          activeTabIndex: updatedTabs.length - 1,
          currentFile: pdfPath,
          currentContent: "",
          isDirty: false,
        });
      },

      // 打开卡片流标签页
      openCardFlowTab: () => {
        const { tabs, activeTabIndex, currentContent, isDirty, undoStack, redoStack } = get();

        // 检查是否已有 cardflow 标签页
        const existingIndex = tabs.findIndex((tab) => tab.type === "cardflow");
        if (existingIndex !== -1) {
          get().switchTab(existingIndex);
          return;
        }

        // 保存当前标签页状态
        let updatedTabs = [...tabs];
        if (activeTabIndex >= 0 && tabs[activeTabIndex]) {
          updatedTabs[activeTabIndex] = {
            ...updatedTabs[activeTabIndex],
            content: currentContent,
            isDirty,
            undoStack,
            redoStack,
          };
        }

        // 创建卡片流标签页
        const cardFlowTab: Tab = {
          id: "__card_flow__",
          type: "cardflow",
          path: "",
          name: "卡片视图",
          content: "",
          isDirty: false,
          undoStack: [],
          redoStack: [],
        };

        updatedTabs.push(cardFlowTab);

        set({
          tabs: updatedTabs,
          activeTabIndex: updatedTabs.length - 1,
          currentFile: null,
          currentContent: "",
          isDirty: false,
          undoStack: [],
          redoStack: [],
          lastSavedContent: "",
        });
      },

      // 打开网页标签页
      openWebpageTab: (url: string, title?: string) => {
        const { tabs, activeTabIndex, currentContent, isDirty, undoStack, redoStack, switchTab } = get();

        // 如果已有相同 URL 的网页标签，直接切换过去，避免重复创建
        if (url) {
          const existingIndex = tabs.findIndex(
            (t) => t.type === "webpage" && t.webpageUrl === url
          );
          if (existingIndex !== -1) {
            // 在切换前仍然保存当前标签页状态
            if (activeTabIndex >= 0 && tabs[activeTabIndex]) {
              const updatedTabs = [...tabs];
              updatedTabs[activeTabIndex] = {
                ...updatedTabs[activeTabIndex],
                content: currentContent,
                isDirty,
                undoStack,
                redoStack,
              };
              set({ tabs: updatedTabs });
            }
            switchTab(existingIndex);
            return;
          }
        }

        // 生成唯一 ID
        const tabId = `__webpage_${Date.now()}__`;

        // 保存当前标签页状态
        let updatedTabs = [...tabs];
        if (activeTabIndex >= 0 && tabs[activeTabIndex]) {
          updatedTabs[activeTabIndex] = {
            ...updatedTabs[activeTabIndex],
            content: currentContent,
            isDirty,
            undoStack,
            redoStack,
          };
        }

        // 尝试从 URL 提取域名作为默认标题
        let defaultTitle = title || '新标签页';
        if (!title && url) {
          try {
            const urlObj = new URL(url);
            defaultTitle = urlObj.hostname;
          } catch {
            // 无效 URL，使用默认标题
          }
        }

        // 创建网页标签页
        const webpageTab: Tab = {
          id: tabId,
          type: "webpage",
          path: "",
          name: defaultTitle,
          content: "",
          isDirty: false,
          undoStack: [],
          redoStack: [],
          webpageUrl: url,
          webpageTitle: defaultTitle,
        };

        updatedTabs.push(webpageTab);

        set({
          tabs: updatedTabs,
          activeTabIndex: updatedTabs.length - 1,
          currentFile: null,
          currentContent: "",
          isDirty: false,
        });
      },

      // 更新网页标签页信息
      updateWebpageTab: (tabId: string, url?: string, title?: string) => {
        const { tabs } = get();

        const updatedTabs = tabs.map(tab => {
          if (tab.id === tabId && tab.type === 'webpage') {
            return {
              ...tab,
              webpageUrl: url ?? tab.webpageUrl,
              webpageTitle: title ?? tab.webpageTitle,
              name: title ?? tab.name,
            };
          }
          return tab;
        });

        set({ tabs: updatedTabs });
      },

      // 打开闪卡标签页
      openFlashcardTab: (deckId?: string) => {
        const { tabs, activeTabIndex, currentContent, isDirty, undoStack, redoStack, switchTab } = get();

        // 如果已有闪卡标签页，直接切换
        const existingIndex = tabs.findIndex(t => t.type === "flashcard");
        if (existingIndex !== -1) {
          if (activeTabIndex >= 0 && tabs[activeTabIndex]) {
            const updatedTabs = [...tabs];
            updatedTabs[activeTabIndex] = {
              ...updatedTabs[activeTabIndex],
              content: currentContent,
              isDirty,
              undoStack,
              redoStack,
            };
            // 更新牌组 ID
            updatedTabs[existingIndex] = {
              ...updatedTabs[existingIndex],
              flashcardDeckId: deckId,
            };
            set({ tabs: updatedTabs });
          }
          switchTab(existingIndex);
          return;
        }

        // 生成唯一 ID
        const tabId = `__flashcard_${Date.now()}__`;

        // 保存当前标签页状态
        let updatedTabs = [...tabs];
        if (activeTabIndex >= 0 && tabs[activeTabIndex]) {
          updatedTabs[activeTabIndex] = {
            ...updatedTabs[activeTabIndex],
            content: currentContent,
            isDirty,
            undoStack,
            redoStack,
          };
        }

        // 创建闪卡标签页
        const flashcardTab: Tab = {
          id: tabId,
          type: "flashcard",
          path: "",
          name: "闪卡复习",
          content: "",
          isDirty: false,
          undoStack: [],
          redoStack: [],
          flashcardDeckId: deckId,
        };

        updatedTabs.push(flashcardTab);

        set({
          tabs: updatedTabs,
          activeTabIndex: updatedTabs.length - 1,
          currentFile: null,
          currentContent: "",
          isDirty: false,
        });
      },

      // 创建新文件
      createNewFile: async (fileName?: string) => {
        const { vaultPath, refreshFileTree, openFile } = get();
        if (!vaultPath) return;

        const separator = vaultPath.includes("\\") ? "\\" : "/";

        // 生成文件名
        let name = fileName;
        if (!name) {
          // 生成默认文件名：未命名、未命名 1、未命名 2...
          const baseName = "未命名";
          let counter = 0;
          let finalName = baseName;

          // 检查文件是否存在
          const checkPath = () => `${vaultPath}${separator}${finalName}.md`;

          // 简单检查 - 尝试创建，如果失败则增加计数器
          while (true) {
            try {
              await createFile(checkPath());
              break;
            } catch {
              counter++;
              finalName = `${baseName} ${counter}`;
              if (counter > 100) {
                console.error("Too many untitled files");
                return;
              }
            }
          }

          await refreshFileTree();
          await openFile(checkPath());
          return;
        }

        // 使用指定文件名
        const newPath = `${vaultPath}${separator}${name}.md`;
        try {
          await createFile(newPath);
          await refreshFileTree();
          await openFile(newPath);
        } catch (error) {
          console.error("Create file failed:", error);
        }
      },

      // 手动推入历史记录（AI 修改时使用）
      pushHistory: (type: "user" | "ai", description?: string) => {
        const { currentContent, undoStack } = get();
        const entry: HistoryEntry = {
          content: currentContent,
          type,
          timestamp: Date.now(),
          description,
        };
        const newUndoStack = trimUndoStack([...undoStack, entry]);
        set({
          undoStack: newUndoStack,
          redoStack: [], // 清空重做栈
        });
      },

      // Update content (marks as dirty)
      updateContent: (content: string, source: "user" | "ai" = "user", description?: string) => {
        const { currentContent, undoStack } = get();
        const now = Date.now();

        // 如果内容没变，不做任何处理
        if (content === currentContent) return;

        if (source === "ai") {
          // AI 修改：总是创建新的撤销点
          const entry: HistoryEntry = {
            content: currentContent, // 保存修改前的内容
            type: "ai",
            timestamp: now,
            description: description || "AI 修改",
          };
          const newUndoStack = trimUndoStack([...undoStack, entry]);
          set({
            currentContent: content,
            isDirty: true,
            undoStack: newUndoStack,
            redoStack: [],
          });
        } else {
          // 用户编辑：合并短时间内的编辑
          if (now - lastUserEditTime > USER_EDIT_DEBOUNCE || undoStack.length === 0) {
            // 超过 debounce 时间，创建新撤销点
            const entry: HistoryEntry = {
              content: currentContent,
              type: "user",
              timestamp: now,
            };
            const newUndoStack = trimUndoStack([...undoStack, entry]);
            set({
              currentContent: content,
              isDirty: true,
              undoStack: newUndoStack,
              redoStack: [],
            });
          } else {
            // 在 debounce 时间内，只更新内容不创建新撤销点
            set({ currentContent: content, isDirty: true });
          }
          lastUserEditTime = now;
        }
      },

      // 撤销
      undo: () => {
        const { undoStack, currentContent, redoStack } = get();
        if (undoStack.length === 0) return;

        const lastEntry = undoStack[undoStack.length - 1];
        const newUndoStack = undoStack.slice(0, -1);

        // 将当前内容推入重做栈
        const redoEntry: HistoryEntry = {
          content: currentContent,
          type: lastEntry.type,
          timestamp: Date.now(),
          description: lastEntry.description,
        };

        set({
          currentContent: lastEntry.content,
          undoStack: newUndoStack,
          redoStack: [...redoStack, redoEntry],
          isDirty: true,
        });

        // 显示撤销提示
        if (lastEntry.type === "ai") {
          console.log(`[Undo] 撤销 AI 修改: ${lastEntry.description || "未命名"}`);
        }
      },

      // 重做
      redo: () => {
        const { redoStack, currentContent, undoStack } = get();
        if (redoStack.length === 0) return;

        const lastEntry = redoStack[redoStack.length - 1];
        const newRedoStack = redoStack.slice(0, -1);

        // 将当前内容推入撤销栈
        const undoEntry: HistoryEntry = {
          content: currentContent,
          type: lastEntry.type,
          timestamp: Date.now(),
          description: lastEntry.description,
        };

        set({
          currentContent: lastEntry.content,
          redoStack: newRedoStack,
          undoStack: [...undoStack, undoEntry],
          isDirty: true,
        });
      },

      // 检查是否可以撤销/重做
      canUndo: () => get().undoStack.length > 0,
      canRedo: () => get().redoStack.length > 0,

      // Save current file
      save: async () => {
        const { currentFile, currentContent, isDirty } = get();
        if (!currentFile || !isDirty) return;

        set({ isSaving: true });
        try {
          await saveFile(currentFile, currentContent);
          set({ isDirty: false, isSaving: false, lastSavedContent: currentContent });
        } catch (error) {
          console.error("Failed to save file:", error);
          set({ isSaving: false });
        }
      },

      // Close current file (now closes current tab)
      closeFile: () => {
        const { activeTabIndex } = get();
        if (activeTabIndex >= 0) {
          get().closeTab(activeTabIndex);
        }
      },

      // Navigation: Go back
      goBack: () => {
        const { navigationHistory, navigationIndex } = get();
        if (navigationIndex > 0) {
          const newIndex = navigationIndex - 1;
          const path = navigationHistory[newIndex];
          set({ navigationIndex: newIndex });
          get().openFile(path, false); // 不添加到历史
        }
      },

      // Navigation: Go forward
      goForward: () => {
        const { navigationHistory, navigationIndex } = get();
        if (navigationIndex < navigationHistory.length - 1) {
          const newIndex = navigationIndex + 1;
          const path = navigationHistory[newIndex];
          set({ navigationIndex: newIndex });
          get().openFile(path, false); // 不添加到历史
        }
      },

      // Check if can go back/forward
      canGoBack: () => get().navigationIndex > 0,
      canGoForward: () => {
        const { navigationHistory, navigationIndex } = get();
        return navigationIndex < navigationHistory.length - 1;
      },

      // Clear vault and reset to welcome screen
      clearVault: () => {
        set({
          vaultPath: null,
          fileTree: [],
          tabs: [],
          activeTabIndex: -1,
          currentFile: null,
          currentContent: "",
          isDirty: false,
          undoStack: [],
          redoStack: [],
          navigationHistory: [],
          navigationIndex: -1,
        });
      },

      // Reload file if it's currently open (for external updates like database edits)
      reloadFileIfOpen: async (path: string) => {
        const { tabs, activeTabIndex, currentFile } = get();

        // 查找该文件是否在标签页中打开
        const tabIndex = tabs.findIndex(t => t.type === 'file' && t.path === path);
        if (tabIndex === -1) return;

        try {
          const newContent = await readFile(path);
          const updatedTabs = tabs.map((tab, i) =>
            i === tabIndex ? { ...tab, content: newContent, isDirty: false } : tab
          );

          // 如果是当前激活的标签页，同时更新 currentContent
          if (tabIndex === activeTabIndex && currentFile === path) {
            set({
              tabs: updatedTabs,
              currentContent: newContent,
              lastSavedContent: newContent,
              isDirty: false,
            });
          } else {
            set({ tabs: updatedTabs });
          }
        } catch (error) {
          console.error(`Failed to reload file ${path}:`, error);
        }
      },

      // Move file to a target folder
      moveFileToFolder: async (sourcePath: string, targetFolder: string) => {
        const { tabs, currentFile, refreshFileTree } = get();
        
        try {
          // Import moveFile dynamically to avoid circular dependency
          const { moveFile } = await import("@/lib/tauri");
          const newPath = await moveFile(sourcePath, targetFolder);
          useFavoriteStore.getState().updatePath(sourcePath, newPath);
          
          // Update tab path if the moved file is open
          const tabIndex = tabs.findIndex(t => t.type === 'file' && t.path === sourcePath);
          if (tabIndex !== -1) {
            const newFileName = newPath.split(/[/\\]/).pop()?.replace(/\.md$/, "") || "未命名";
            const updatedTabs = tabs.map((tab, i) => {
              if (i === tabIndex) {
                return {
                  ...tab,
                  path: newPath,
                  name: newFileName,
                  id: newPath,
                };
              }
              return tab;
            });
            
            set({
              tabs: updatedTabs,
              currentFile: currentFile === sourcePath ? newPath : currentFile,
            });
          }
          
          // Refresh file tree
          await refreshFileTree();
        } catch (error) {
          console.error("Failed to move file:", error);
          throw error;
        }
      },

      // Move folder to a target folder
      moveFolderToFolder: async (sourcePath: string, targetFolder: string) => {
        const { tabs, currentFile, refreshFileTree } = get();
        
        try {
          // Import moveFolder dynamically to avoid circular dependency
          const { moveFolder } = await import("@/lib/tauri");
          const newPath = await moveFolder(sourcePath, targetFolder);
          useFavoriteStore.getState().updatePathsForFolderMove(sourcePath, newPath);
          
          // Normalize paths for comparison
          const normalize = (p: string) => p.replace(/\\/g, "/");
          const normalizedSource = normalize(sourcePath);
          const normalizedNew = normalize(newPath);
          
          // Update all tabs that are inside the moved folder
          const updatedTabs = tabs.map(tab => {
            if (tab.type === 'file') {
              const normalizedTabPath = normalize(tab.path);
              if (normalizedTabPath.startsWith(normalizedSource + "/") || normalizedTabPath === normalizedSource) {
                // Replace the old folder path with the new one
                const relativePath = normalizedTabPath.slice(normalizedSource.length);
                const newTabPath = normalizedNew + relativePath;
                const newFileName = newTabPath.split(/[/\\]/).pop()?.replace(/\.md$/, "") || "未命名";
                return {
                  ...tab,
                  path: newTabPath,
                  name: newFileName,
                  id: newTabPath,
                };
              }
            }
            return tab;
          });
          
          // Update currentFile if it was inside the moved folder
          let newCurrentFile = currentFile;
          if (currentFile) {
            const normalizedCurrent = normalize(currentFile);
            if (normalizedCurrent.startsWith(normalizedSource + "/") || normalizedCurrent === normalizedSource) {
              const relativePath = normalizedCurrent.slice(normalizedSource.length);
              newCurrentFile = normalizedNew + relativePath;
            }
          }
          
          set({
            tabs: updatedTabs,
            currentFile: newCurrentFile,
          });
          
          // Refresh file tree
          await refreshFileTree();
        } catch (error) {
          console.error("Failed to move folder:", error);
          throw error;
        }
      },
    }),
    {
      name: "lumina-workspace",
      partialize: (state) => ({
        vaultPath: state.vaultPath,  // 只持久化工作空间路径
        recentFiles: state.recentFiles, // 持久化最近文件列表
      }),
    }
  )
);
