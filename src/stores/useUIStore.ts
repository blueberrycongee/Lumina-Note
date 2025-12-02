import { create } from "zustand";
import { persist } from "zustand/middleware";
import { applyTheme, getThemeById } from "@/lib/themes";

// Editor modes similar to Obsidian
export type EditorMode = "reading" | "live" | "source";

// Main view types - what shows in center area
export type MainView = "editor" | "graph";

// AI 面板模式
export type AIPanelMode = "docked" | "floating";

interface UIState {
  // Theme
  isDarkMode: boolean;
  themeId: string;
  toggleTheme: () => void;
  setThemeId: (id: string) => void;

  // Panels
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;

  // Panel widths (in pixels)
  leftSidebarWidth: number;
  rightSidebarWidth: number;
  setLeftSidebarWidth: (width: number) => void;
  setRightSidebarWidth: (width: number) => void;

  // Right panel tabs
  rightPanelTab: "chat" | "outline" | "backlinks" | "tags";
  setRightPanelTab: (tab: "chat" | "outline" | "backlinks" | "tags") => void;

  // Chat mode (simple chat vs agent)
  chatMode: "chat" | "agent";
  setChatMode: (mode: "chat" | "agent") => void;

  // AI Panel (docked in right panel or floating)
  aiPanelMode: AIPanelMode;
  floatingBallPosition: { x: number; y: number };
  floatingPanelOpen: boolean;
  isFloatingBallDragging: boolean; // 悬浮球是否正在被拖拽
  setAIPanelMode: (mode: AIPanelMode) => void;
  setFloatingBallPosition: (pos: { x: number; y: number }) => void;
  setFloatingPanelOpen: (open: boolean) => void;
  toggleFloatingPanel: () => void;
  setFloatingBallDragging: (dragging: boolean) => void;

  // Main view (center area)
  mainView: MainView;
  setMainView: (view: MainView) => void;

  // Editor mode
  editorMode: EditorMode;
  setEditorMode: (mode: EditorMode) => void;

  // Split view
  splitView: boolean;
  splitDirection: "horizontal" | "vertical";
  toggleSplitView: () => void;
  setSplitView: (open: boolean) => void;
  setSplitDirection: (dir: "horizontal" | "vertical") => void;

  // Video note view
  videoNoteOpen: boolean;
  videoNoteUrl: string | null;
  setVideoNoteOpen: (open: boolean) => void;
  setVideoNoteUrl: (url: string | null) => void;
  openVideoNote: (url: string) => void;
  toggleVideoNote: () => void;
  
  // Settings modal
  isSettingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Theme - default to light mode
      isDarkMode: false,
      themeId: "default",
      toggleTheme: () =>
        set((state) => {
          const newMode = !state.isDarkMode;
          // Update document class for Tailwind dark mode
          if (newMode) {
            document.documentElement.classList.add("dark");
          } else {
            document.documentElement.classList.remove("dark");
          }
          // Apply theme colors
          const theme = getThemeById(state.themeId);
          if (theme) {
            applyTheme(theme, newMode);
          }
          return { isDarkMode: newMode };
        }),
      setThemeId: (id: string) =>
        set((state) => {
          const theme = getThemeById(id);
          if (theme) {
            applyTheme(theme, state.isDarkMode);
          }
          return { themeId: id };
        }),

      // Panels
      leftSidebarOpen: true,
      rightSidebarOpen: true,
      toggleLeftSidebar: () =>
        set((state) => ({ leftSidebarOpen: !state.leftSidebarOpen })),
      toggleRightSidebar: () =>
        set((state) => ({ rightSidebarOpen: !state.rightSidebarOpen })),

      // Panel widths
      leftSidebarWidth: 256,
      rightSidebarWidth: 320,
      setLeftSidebarWidth: (width) =>
        set({ leftSidebarWidth: Math.max(200, Math.min(480, width)) }),
      setRightSidebarWidth: (width) =>
        set({ rightSidebarWidth: Math.max(280, Math.min(560, width)) }),

      // Right panel tabs
      rightPanelTab: "chat",
      setRightPanelTab: (tab) => set({ rightPanelTab: tab }),

      // Chat mode
      chatMode: "agent",  // 默认使用 Agent 模式
      setChatMode: (mode) => set({ chatMode: mode }),

      // AI Panel floating
      aiPanelMode: "docked",
      floatingBallPosition: { x: window.innerWidth - 80, y: window.innerHeight - 120 },
      floatingPanelOpen: false,
      isFloatingBallDragging: false,
      setAIPanelMode: (mode) => set({ aiPanelMode: mode }),
      setFloatingBallPosition: (pos) => set({ floatingBallPosition: pos }),
      setFloatingPanelOpen: (open) => set({ floatingPanelOpen: open }),
      toggleFloatingPanel: () => set((state) => ({ floatingPanelOpen: !state.floatingPanelOpen })),
      setFloatingBallDragging: (dragging) => set({ isFloatingBallDragging: dragging }),

      // Main view
      mainView: "editor",
      setMainView: (view) => set({ mainView: view }),

      // Editor mode - default to live preview
      editorMode: "live",
      setEditorMode: (mode) => set({ editorMode: mode }),

      // Split view
      splitView: false,
      splitDirection: "horizontal",
      toggleSplitView: () => set((state) => ({ splitView: !state.splitView })),
      setSplitView: (open) => set({ splitView: open }),
      setSplitDirection: (dir) => set({ splitDirection: dir }),

      // Video note
      videoNoteOpen: false,
      videoNoteUrl: null,
      setVideoNoteOpen: (open) => set({ videoNoteOpen: open }),
      setVideoNoteUrl: (url) => set({ videoNoteUrl: url }),
      openVideoNote: (url) => set({ videoNoteUrl: url, videoNoteOpen: true }),
      toggleVideoNote: () => set((state) => ({ videoNoteOpen: !state.videoNoteOpen })),
      
      // Settings modal
      isSettingsOpen: false,
      setSettingsOpen: (open) => set({ isSettingsOpen: open }),
    }),
    {
      name: "neurone-ui",
      // 不持久化视频笔记状态，避免重启后自动打开
      partialize: (state) => {
        const { videoNoteOpen, videoNoteUrl, ...rest } = state;
        return rest;
      },
      onRehydrateStorage: () => (state) => {
        // Apply dark mode class on hydration
        if (state?.isDarkMode) {
          document.documentElement.classList.add("dark");
        }
        // Apply saved theme on hydration (or default theme)
        const themeId = state?.themeId || "default";
        const theme = getThemeById(themeId);
        if (theme) {
          applyTheme(theme, state?.isDarkMode || false);
        }
        // 强制重置视频笔记状态（不应从 localStorage 恢复）
        if (state) {
          state.videoNoteOpen = false;
          state.videoNoteUrl = null;
        }
      },
    }
  )
);
