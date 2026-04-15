import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createLegacyKeyJSONStorage } from "@/lib/persistStorage";
import { applyTheme, getThemeById } from "@/config/themePlugin";
import { pluginThemeRuntime } from "@/services/plugins/themeRuntime";

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
  setLeftSidebarOpen: (open: boolean) => void;
  setRightSidebarOpen: (open: boolean) => void;
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

  // Chat mode — agent-only (codex moved to plugin system)
  chatMode: "agent";
  setChatMode: (mode: "agent") => void;

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

  // Skills manager
  isSkillManagerOpen: boolean;
  setSkillManagerOpen: (open: boolean) => void;

  // Diagnostics
  diagnosticsEnabled: boolean;
  setDiagnosticsEnabled: (enabled: boolean) => void;
  editorInteractionTraceEnabled: boolean;
  setEditorInteractionTraceEnabled: (enabled: boolean) => void;

  // Editor font size
  editorFontSize: number;
  setEditorFontSize: (size: number) => void;

  // Proxy
  proxyUrl: string;
  proxyEnabled: boolean;
  setProxyUrl: (url: string) => void;
  setProxyEnabled: (enabled: boolean) => void;
}

const getDefaultFloatingBallPosition = () => ({
  x: window.innerWidth - 80,
  y: window.innerHeight - 120,
});

const partializeUIState = (state: UIState) => ({
  isDarkMode: state.isDarkMode,
  themeId: state.themeId,
  leftSidebarOpen: state.leftSidebarOpen,
  rightSidebarOpen: state.rightSidebarOpen,
  leftSidebarWidth: state.leftSidebarWidth,
  rightSidebarWidth: state.rightSidebarWidth,
  rightPanelTab: state.rightPanelTab,
  chatMode: state.chatMode,
  aiPanelMode: state.aiPanelMode,
  mainView: state.mainView,
  editorMode: state.editorMode,
  splitView: state.splitView,
  splitDirection: state.splitDirection,
  diagnosticsEnabled: state.diagnosticsEnabled,
  editorInteractionTraceEnabled: state.editorInteractionTraceEnabled,
  editorFontSize: state.editorFontSize,
  proxyUrl: state.proxyUrl,
  proxyEnabled: state.proxyEnabled,
});

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
            pluginThemeRuntime.reapply();
          }
          return { isDarkMode: newMode };
        }),
      setThemeId: (id: string) =>
        set((state) => {
          const theme = getThemeById(id);
          if (theme) {
            applyTheme(theme, state.isDarkMode);
            pluginThemeRuntime.reapply();
          }
          return { themeId: id };
        }),

      // Panels
      leftSidebarOpen: true,
      rightSidebarOpen: true,
      setLeftSidebarOpen: (open) => set({ leftSidebarOpen: open }),
      setRightSidebarOpen: (open) => set({ rightSidebarOpen: open }),
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
      chatMode: "agent", // 默认使用 Agent 模式
      setChatMode: (mode) => set({ chatMode: mode }),

      // AI Panel floating
      aiPanelMode: "docked",
      floatingBallPosition: getDefaultFloatingBallPosition(),
      floatingPanelOpen: false,
      isFloatingBallDragging: false,
      setAIPanelMode: (mode) => set({ aiPanelMode: mode }),
      setFloatingBallPosition: (pos) => set({ floatingBallPosition: pos }),
      setFloatingPanelOpen: (open) => set({ floatingPanelOpen: open }),
      toggleFloatingPanel: () =>
        set((state) => ({ floatingPanelOpen: !state.floatingPanelOpen })),
      setFloatingBallDragging: (dragging) =>
        set({ isFloatingBallDragging: dragging }),

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
      toggleVideoNote: () =>
        set((state) => ({ videoNoteOpen: !state.videoNoteOpen })),

      // Settings modal
      isSettingsOpen: false,
      setSettingsOpen: (open) => set({ isSettingsOpen: open }),

      // Skills manager
      isSkillManagerOpen: false,
      setSkillManagerOpen: (open) => set({ isSkillManagerOpen: open }),

      // Diagnostics
      diagnosticsEnabled: false,
      setDiagnosticsEnabled: (enabled) => set({ diagnosticsEnabled: enabled }),
      editorInteractionTraceEnabled: false,
      setEditorInteractionTraceEnabled: (enabled) =>
        set({ editorInteractionTraceEnabled: enabled }),

      // Editor font size (10-32px)
      editorFontSize: 16,
      setEditorFontSize: (size) =>
        set({ editorFontSize: Math.max(10, Math.min(32, size)) }),

      // Proxy
      proxyUrl: "",
      proxyEnabled: false,
      setProxyUrl: (url) => set({ proxyUrl: url }),
      setProxyEnabled: (enabled) => set({ proxyEnabled: enabled }),
    }),
    {
      name: "lumina-ui",
      storage: createLegacyKeyJSONStorage(["neurone-ui"]),
      // 不持久化视频笔记状态，避免重启后自动打开
      partialize: partializeUIState,
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
          pluginThemeRuntime.reapply();
        }
        // Migrate removed chat/codex modes → agent
        if (
          state &&
          ((state.chatMode as string) === "chat" ||
            (state.chatMode as string) === "codex")
        ) {
          state.chatMode = "agent";
        }
        // 强制重置视频笔记状态（不应从 localStorage 恢复）
        if (state) {
          state.videoNoteOpen = false;
          state.videoNoteUrl = null;
          state.isSettingsOpen = false;
          state.isSkillManagerOpen = false;
          state.floatingPanelOpen = false;
          state.isFloatingBallDragging = false;
          state.floatingBallPosition = getDefaultFloatingBallPosition();
          localStorage.setItem(
            "lumina-ui",
            JSON.stringify({ state: partializeUIState(state), version: 0 }),
          );
        }
      },
    },
  ),
);
