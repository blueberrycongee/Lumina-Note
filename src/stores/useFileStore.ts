import { create } from "zustand";
import { persist } from "zustand/middleware";
import { FileEntry, listDirectory, readFile, saveFile, createFile } from "@/lib/tauri";
import { VideoNoteFile, parseVideoNoteMd } from '@/types/videoNote';

// 历史记录条目
interface HistoryEntry {
  content: string;
  type: "user" | "ai";
  timestamp: number;
  description?: string;
}

// 标签页类型
export type TabType = "file" | "graph" | "isolated-graph" | "video-note" | "database" | "pdf";

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
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  isolatedNode?: IsolatedNodeInfo; // 孤立视图的目标节点
  videoUrl?: string; // 视频笔记的 URL
  videoNoteData?: VideoNoteFile; // 从分享或内容打开时传入的笔记数据
  databaseId?: string; // 数据库 ID
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
  
  // Create new file
  createNewFile: (fileName?: string) => Promise<void>;
  
  // Open special tabs
  openGraphTab: () => void;
  openIsolatedGraphTab: (node: IsolatedNodeInfo) => void;
  openVideoNoteTab: (url: string, title?: string) => void;
  openVideoNoteFromContent: (content: string, title?: string) => void;
  openDatabaseTab: (dbId: string, dbName: string) => void;
  openPDFTab: (pdfPath: string) => void;
  
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
  
  // Workspace actions
  clearVault: () => void;
}

// 用户编辑的 debounce 时间（毫秒）
const USER_EDIT_DEBOUNCE = 1000;
let lastUserEditTime = 0;

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
    
    // 如果要关闭的是当前标签页且有未保存的更改，先保存
    if (index === activeTabIndex && isDirty) {
      await get().save();
    } else if (tabs[index].isDirty) {
      // 非当前标签页但有未保存更改，也保存
      await saveFile(tabs[index].path, tabs[index].content);
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

  // 关闭其他标签页
  closeOtherTabs: async (index: number) => {
    const { tabs } = get();
    if (index < 0 || index >= tabs.length) return;
    
    // 保存所有标签页
    for (const tab of tabs) {
      if (tab.isDirty) {
        await saveFile(tab.path, tab.content);
      }
    }
    
    const targetTab = tabs[index];
    set({
      tabs: [targetTab],
      activeTabIndex: 0,
      currentFile: targetTab.path,
      currentContent: targetTab.content,
      isDirty: false,
      undoStack: targetTab.undoStack,
      redoStack: targetTab.redoStack,
    });
  },

  // 关闭所有标签页
  closeAllTabs: async () => {
    const { tabs } = get();
    
    // 保存所有标签页
    for (const tab of tabs) {
      if (tab.isDirty) {
        await saveFile(tab.path, tab.content);
      }
    }
    
    set({
      tabs: [],
      activeTabIndex: -1,
      currentFile: null,
      currentContent: "",
      isDirty: false,
      undoStack: [],
      redoStack: [],
    });
  },

  // 重新排序标签页
  reorderTabs: (fromIndex: number, toIndex: number) => {
    const { tabs, activeTabIndex } = get();
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= tabs.length) return;
    if (toIndex < 0 || toIndex >= tabs.length) return;
    
    const newTabs = [...tabs];
    const [movedTab] = newTabs.splice(fromIndex, 1);
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
    set({ 
      undoStack: [...undoStack, entry],
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
      set({ 
        currentContent: content, 
        isDirty: true,
        undoStack: [...undoStack, entry],
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
        set({ 
          currentContent: content, 
          isDirty: true,
          undoStack: [...undoStack, entry],
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
