import { Suspense, lazy, useEffect, useCallback, useState, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { open } from "@tauri-apps/plugin-dialog";
import { Sidebar } from "@/components/layout/Sidebar";
import { RightPanel } from "@/components/layout/RightPanel";
import { ResizeHandle } from "@/components/toolbar/ResizeHandle";
import { Ribbon } from "@/components/layout/Ribbon";
import { KnowledgeGraph } from "@/components/effects/KnowledgeGraph";
import { Editor } from "@/editor/Editor";
import { SplitEditor } from "@/components/layout/SplitEditor";
import { useFileStore } from "@/stores/useFileStore";
import { useUIStore } from "@/stores/useUIStore";
import { useNoteIndexStore } from "@/stores/useNoteIndexStore";
import { useRAGStore } from "@/stores/useRAGStore";
import { PanelRight } from "lucide-react";
import { CommandPalette, PaletteMode } from "@/components/search/CommandPalette";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { TabBar } from "@/components/layout/TabBar";
import { DiffView } from "@/components/effects/DiffView";
import { AIFloatingBall } from "@/components/ai/AIFloatingBall";
import { SkillManagerModal } from "@/components/ai/SkillManagerModal";
import { VideoNoteView } from "@/components/video/VideoNoteView";
import { DatabaseView, CreateDatabaseDialog, DatabaseSplitView } from "@/components/database";
import { PDFViewer } from "@/components/pdf";
import { BrowserView } from "@/components/browser";
import { FlashcardView } from "@/components/flashcard";
import { CardFlowView } from "@/components/cardflow/CardFlowView";
import { TypesettingPreviewPane } from "@/components/typesetting/TypesettingPreviewPane";
import { TypesettingDocumentPane } from "@/components/typesetting/TypesettingDocumentPane";
import { TypesettingExportHarness } from "@/components/typesetting/TypesettingExportHarness";
import { useAIStore } from "@/stores/useAIStore";
import { initRustAgentListeners } from "@/stores/useRustAgentStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { saveFile } from "@/lib/tauri";
import { TitleBar } from "@/components/layout/TitleBar";
import { VoiceInputBall } from "@/components/ai/VoiceInputBall";
import { enableDebugLogger, disableDebugLogger } from "@/lib/debugLogger";
import { AgentEvalPanel } from "@/tests/agent-eval/AgentEvalPanel";
import { CodexVscodeHostPanel } from "@/components/debug/CodexVscodeHostPanel";
import { CodexPanelHost } from "@/components/codex/CodexPanelHost";
import { WelcomeScreen } from "@/components/onboarding/WelcomeScreen";
import { OverviewDashboard } from "@/components/overview/OverviewDashboard";
import { ProfilePreview } from "@/components/profile/ProfilePreview";
import { DevProfiler } from "@/perf/DevProfiler";
import type { FsChangePayload } from "@/lib/fsChange";
import { usePluginStore } from "@/stores/usePluginStore";
import { pluginRuntime } from "@/services/plugins/runtime";
import { PluginViewPane } from "@/components/plugins/PluginViewPane";
import { PluginPanelDock } from "@/components/plugins/PluginPanelDock";
import { PluginStatusBar } from "@/components/layout/PluginStatusBar";
import { PluginContextMenuHost } from "@/components/plugins/PluginContextMenuHost";
import { PluginShellSlotHost } from "@/components/plugins/PluginShellSlotHost";

// Debug logging is enabled via a runtime toggle (or always in dev).

const IS_TYPESETTING_HARNESS =
  new URLSearchParams(window.location.search).get("typesettingHarness") === "1";
const DiagramView = lazy(async () => {
  const mod = await import("@/components/diagram/DiagramView");
  return { default: mod.DiagramView };
});

// Component that shows tabs + graph/editor content
function EditorWithGraph() {
  const { tabs, activeTabIndex } = useFileStore(
    useShallow((state) => ({
      tabs: state.tabs,
      activeTabIndex: state.activeTabIndex,
    }))
  );
  const activeTab = activeTabIndex >= 0 ? tabs[activeTabIndex] : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background transition-colors duration-300">
      <TabBar />
      {activeTab?.type === "graph" ? (
        <KnowledgeGraph className="flex-1" />
      ) : activeTab?.type === "isolated-graph" && activeTab.isolatedNode ? (
        <KnowledgeGraph className="flex-1" isolatedNode={activeTab.isolatedNode} />
      ) : (
        <OverviewDashboard />
      )}
    </div>
  );
}

// Component that shows diff view
function DiffViewWrapper() {
  const { t } = useLocaleStore();
  const { pendingDiff, setPendingDiff, clearPendingEdits, diffResolver } = useAIStore();
  const openFile = useFileStore((state) => state.openFile);

  const handleAccept = useCallback(async () => {
    if (!pendingDiff) return;

    try {
      // Save to file first
      await saveFile(pendingDiff.filePath, pendingDiff.modified);

      // Clear the diff and pending edits
      clearPendingEdits();

      // Refresh the file in editor (forceReload = true)
      await openFile(pendingDiff.filePath, false, true);

      console.log(`✅ 已应用修改到 ${pendingDiff.fileName}`);

      // Resolve promise if exists
      if (diffResolver) {
        diffResolver(true);
      }
    } catch (error) {
      console.error("Failed to apply edit:", error);
      alert(`❌ ${t.ai.applyEditFailed}: ${error}`);
    }
  }, [pendingDiff, clearPendingEdits, openFile, diffResolver, t]);

  const handleReject = useCallback(() => {
    setPendingDiff(null);
    // Also clear pending edits so AI doesn't get confused
    clearPendingEdits();

    // Resolve promise if exists
    if (diffResolver) {
      diffResolver(false);
    }
  }, [setPendingDiff, clearPendingEdits, diffResolver]);

  if (!pendingDiff) return null;

  return (
    <DiffView
      fileName={pendingDiff.fileName}
      original={pendingDiff.original}
      modified={pendingDiff.modified}
      description={pendingDiff.description}
      onAccept={handleAccept}
      onReject={handleReject}
    />
  );
}

function MobileWorkspaceToast() {
  const mobileWorkspaceSync = useFileStore((state) => state.mobileWorkspaceSync);
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (mobileWorkspaceSync.status !== "error" || !mobileWorkspaceSync.error) {
      return;
    }
    const pathLabel = mobileWorkspaceSync.path ? ` (${mobileWorkspaceSync.path})` : "";
    const nextMessage = `Workspace sync failed${pathLabel}: ${mobileWorkspaceSync.error}`;
    setMessage(nextMessage);
    setVisible(true);
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => {
      setVisible(false);
    }, 6000);
    return () => {
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, [
    mobileWorkspaceSync.status,
    mobileWorkspaceSync.error,
    mobileWorkspaceSync.path,
    mobileWorkspaceSync.lastInvokeAt,
  ]);

  if (!visible || !message) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-[200] max-w-sm rounded-lg border border-red-500/30 bg-background/90 px-3 py-2 text-xs text-red-500 shadow-lg">
      {message}
    </div>
  );
}

interface BrowserNewTabEventPayload {
  parent_tab_id: string;
  url: string;
}

// 避免在 React 严格模式和 HMR 下重复注册浏览器新标签事件监听
let browserNewTabListenerRegistered = false;

function App() {
  if (IS_TYPESETTING_HARNESS) {
    return <TypesettingExportHarness />;
  }
  const {
    vaultPath,
    setVaultPath,
    currentFile,
    save,
    createNewFile,
    tabs,
    activeTabIndex,
    fileTree,
    refreshFileTree,
    openAIMainTab,
    syncMobileWorkspace,
  } = useFileStore(
    useShallow((state) => ({
      vaultPath: state.vaultPath,
      setVaultPath: state.setVaultPath,
      currentFile: state.currentFile,
      save: state.save,
      createNewFile: state.createNewFile,
      tabs: state.tabs,
      activeTabIndex: state.activeTabIndex,
      fileTree: state.fileTree,
      refreshFileTree: state.refreshFileTree,
      openAIMainTab: state.openAIMainTab,
      syncMobileWorkspace: state.syncMobileWorkspace,
    }))
  );
  const pendingDiff = useAIStore((state) => state.pendingDiff);
  const buildIndex = useNoteIndexStore((state) => state.buildIndex);
  const { initialize: initializeRAG, config: ragConfig } = useRAGStore(
    useShallow((state) => ({
      initialize: state.initialize,
      config: state.config,
    }))
  );
  const t = useLocaleStore((state) => state.t);
  const loadPlugins = usePluginStore((state) => state.loadPlugins);
  const setAppearanceSafeMode = usePluginStore((state) => state.setAppearanceSafeMode);

  // Get active tab
  const activeTab = activeTabIndex >= 0 ? tabs[activeTabIndex] : null;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("command");
  const [searchOpen, setSearchOpen] = useState(false);
  const [isLoadingVault, setIsLoadingVault] = useState(false);
  const [createDbOpen, setCreateDbOpen] = useState(false);
  const [evalPanelOpen, setEvalPanelOpen] = useState(false);
  const [codexPanelOpen, setCodexPanelOpen] = useState(false);

  // 首次启动时默认打开 AI Chat
  useEffect(() => {
    if (tabs.length === 0) {
      openAIMainTab();
    }
  }, []);

  // 初始化 Rust Agent 监听（用于移动端会话指令）
  useEffect(() => {
    initRustAgentListeners();
  }, []);

  // 启动时自动加载保存的工作空间
  useEffect(() => {
    if (vaultPath && fileTree.length === 0 && !isLoadingVault) {
      setIsLoadingVault(true);
      refreshFileTree().finally(() => setIsLoadingVault(false));
    }
  }, []);

  // Load and sync plugins whenever workspace changes.
  useEffect(() => {
    void loadPlugins(vaultPath || undefined);
  }, [vaultPath, loadPlugins]);

  // Plugin lifecycle events.
  useEffect(() => {
    pluginRuntime.emit("app:ready", { timestamp: Date.now() });
  }, []);

  useEffect(() => {
    pluginRuntime.emit("workspace:changed", { workspacePath: vaultPath ?? null });
  }, [vaultPath]);

  useEffect(() => {
    pluginRuntime.emit("active-file:changed", { path: currentFile ?? null });
  }, [currentFile]);

  // Crash recovery for appearance plugins and theme overrides.
  useEffect(() => {
    const crashFlagKey = "lumina-plugin-appearance-crash-flag";
    const marked = localStorage.getItem(crashFlagKey) === "1";
    if (marked) {
      document.documentElement.removeAttribute("style");
      document.head
        .querySelectorAll(
          "style[data-lumina-plugin-style], style[data-lumina-plugin-theme-dark], style[data-lumina-plugin-editor-decoration]",
        )
        .forEach((node) => node.remove());
      void setAppearanceSafeMode(true, vaultPath || undefined);
      localStorage.removeItem(crashFlagKey);
    }
    localStorage.setItem(crashFlagKey, "1");
    return () => {
      localStorage.removeItem(crashFlagKey);
    };
  }, [setAppearanceSafeMode, vaultPath]);

  // 兼容兜底：确保移动端网关拿到当前 workspace
  useEffect(() => {
    if (!vaultPath) return;
    syncMobileWorkspace({ path: vaultPath, force: true });
  }, [vaultPath, syncMobileWorkspace]);

  // 启动文件监听器，自动刷新文件树
  useEffect(() => {
    if (!vaultPath) return;

    let unlisten: (() => void) | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const setupWatcher = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const { startFileWatcher } = await import("@/lib/tauri");
        const { handleFsChangeEvent } = await import("@/lib/fsChange");
        const { reloadFileIfOpen } = useFileStore.getState();
        const { reloadSecondaryIfOpen } = (await import("@/stores/useSplitStore")).useSplitStore.getState();

        // 启动后端文件监听
        await startFileWatcher(vaultPath);
        console.log("[FileWatcher] Started watching:", vaultPath);

        // 监听文件变化事件（带防抖）
        unlisten = await listen<FsChangePayload | null>("fs:change", (event) => {
          if (import.meta.env.DEV) {
            console.log("[FileWatcher] File changed:", event.payload);
          }

          // 防抖：500ms 内多次变化只刷新一次
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            refreshFileTree();
            handleFsChangeEvent(event.payload, (path) => {
              reloadFileIfOpen(path, { skipIfDirty: true });
              reloadSecondaryIfOpen(path, { skipIfDirty: true });
            });
          }, 500);
        });
      } catch (error) {
        console.warn("[FileWatcher] Failed to start:", error);
      }
    };

    setupWatcher();

    return () => {
      if (unlisten) unlisten();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [vaultPath, refreshFileTree]);

  // 监听后端触发的浏览器新标签事件（window.open）
  useEffect(() => {
    if (browserNewTabListenerRegistered) return;
    browserNewTabListenerRegistered = true;

    let unlisten: (() => void) | null = null;

    const setup = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<BrowserNewTabEventPayload>("browser:new-tab", (event) => {
          const payload = event.payload;
          if (!payload || !payload.url) return;
          // 使用最新的 store 状态创建网页标签，避免依赖闭包
          useFileStore.getState().openWebpageTab(payload.url);
        });
      } catch (error) {
        console.warn("[Browser] Failed to setup new-tab listener:", error);
      }
    };

    setup();

    return () => {
      if (unlisten) {
        unlisten();
      }
      browserNewTabListenerRegistered = false;
    };
  }, []);
  const {
    leftSidebarOpen,
    rightSidebarOpen,
    leftSidebarWidth,
    rightSidebarWidth,
    setLeftSidebarOpen,
    setLeftSidebarWidth,
    setRightSidebarWidth,
    toggleLeftSidebar,
    toggleRightSidebar,
    splitView,
    isSkillManagerOpen,
    setSkillManagerOpen,
    diagnosticsEnabled,
  } = useUIStore(
    useShallow((state) => ({
      leftSidebarOpen: state.leftSidebarOpen,
      rightSidebarOpen: state.rightSidebarOpen,
      leftSidebarWidth: state.leftSidebarWidth,
      rightSidebarWidth: state.rightSidebarWidth,
      setLeftSidebarOpen: state.setLeftSidebarOpen,
      setLeftSidebarWidth: state.setLeftSidebarWidth,
      setRightSidebarWidth: state.setRightSidebarWidth,
      toggleLeftSidebar: state.toggleLeftSidebar,
      toggleRightSidebar: state.toggleRightSidebar,
      splitView: state.splitView,
      isSkillManagerOpen: state.isSkillManagerOpen,
      setSkillManagerOpen: state.setSkillManagerOpen,
      diagnosticsEnabled: state.diagnosticsEnabled,
    }))
  );
  const diagnosticsActive = diagnosticsEnabled || import.meta.env.DEV;

  // Diagnostics logging (runtime toggle)
  useEffect(() => {
    if (diagnosticsActive) {
      enableDebugLogger();
    } else {
      disableDebugLogger();
    }
  }, [diagnosticsActive]);

  // Attach crash handlers only when diagnostics are enabled.
  useEffect(() => {
    if (!diagnosticsActive) return;
    const onError = (event: ErrorEvent) => {
      console.error(
        "[WindowError]",
        event.message,
        event.filename,
        event.lineno,
        event.colno
      );
      if (event.error) {
        console.error("[WindowErrorStack]", event.error.stack || event.error);
      }
    };
    const onUnhandled = (event: PromiseRejectionEvent) => {
      const reason =
        (event.reason && ((event.reason as any).stack || event.reason)) ||
        "unknown";
      console.error("[UnhandledRejection]", reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandled);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandled);
    };
  }, [diagnosticsActive]);

  // Build note index when file tree changes
  useEffect(() => {
    if (fileTree.length > 0) {
      buildIndex(fileTree);
    }
  }, [fileTree, buildIndex]);

  // Initialize RAG system when vault is opened (if enabled and configured)
  useEffect(() => {
    if (vaultPath && ragConfig.enabled && ragConfig.embeddingApiKey) {
      initializeRAG(vaultPath).catch((error) => {
        console.warn("[RAG] Failed to initialize:", error);
      });
    }
  }, [vaultPath, ragConfig.enabled, ragConfig.embeddingApiKey, initializeRAG]);

  // 全局鼠标拖拽处理：模拟从文件树拖拽文件创建双链
  useEffect(() => {
    let dragIndicator: HTMLDivElement | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      const dragData = (window as any).__lumina_drag_data;
      if (!dragData) return;

      // 检测是否开始拖拽（移动超过 5px）
      const dx = e.clientX - dragData.startX;
      const dy = e.clientY - dragData.startY;

      if (!dragData.isDragging && Math.sqrt(dx * dx + dy * dy) > 5) {
        dragData.isDragging = true;

        // 创建拖拽指示器 - VS Code/Cursor 风格
        dragIndicator = document.createElement('div');
        dragIndicator.className = 'fixed pointer-events-none z-[9999] flex items-center gap-2 px-3 py-2 bg-popover/95 backdrop-blur-sm text-popover-foreground text-sm rounded-lg border border-border shadow-xl';

        // 根据是文件还是文件夹显示不同图标
        const icon = dragData.isFolder
          ? `<svg class="w-4 h-4 text-yellow-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>`
          : `<svg class="w-4 h-4 text-blue-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>`;

        dragIndicator.innerHTML = `
          ${icon}
          <span class="truncate max-w-[200px]">${dragData.fileName.replace(/\.(md|db\.json)$/i, '')}</span>
        `;
        document.body.appendChild(dragIndicator);
      }

      if (dragData.isDragging && dragIndicator) {
        dragIndicator.style.left = `${e.clientX - 8}px`;
        dragIndicator.style.top = `${e.clientY + 2}px`;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      const dragData = (window as any).__lumina_drag_data;
      if (!dragData) return;

      // 清理拖拽指示器
      if (dragIndicator) {
        dragIndicator.remove();
        dragIndicator = null;
      }

      if (dragData.isDragging) {
        // 检查是否放置在文件夹上
        const folderTarget = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-folder-path]');
        if (folderTarget) {
          const targetPath = folderTarget.getAttribute('data-folder-path');
          if (targetPath && targetPath !== dragData.filePath) {
            // 触发文件夹放置事件
            const folderDropEvent = new CustomEvent('lumina-folder-drop', {
              detail: {
                sourcePath: dragData.filePath,
                targetFolder: targetPath,
                isFolder: dragData.isFolder,
              }
            });
            window.dispatchEvent(folderDropEvent);
            // 清理全局数据
            (window as any).__lumina_drag_data = null;
            return;
          }
        }

        // 文件夹不能插入链接，只触发文件的 lumina-drop
        if (!dragData.isFolder) {
          // 触发自定义事件，让编辑器和 AI 对话框处理
          const dropEvent = new CustomEvent('lumina-drop', {
            detail: {
              wikiLink: dragData.wikiLink,
              filePath: dragData.filePath,
              fileName: dragData.fileName,
              x: e.clientX,
              y: e.clientY,
            }
          });
          window.dispatchEvent(dropEvent);
        }
      }

      // 清理全局数据
      (window as any).__lumina_drag_data = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (dragIndicator) dragIndicator.remove();
    };
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;

      // Ctrl+S: Save
      if (isCtrl && e.key === "s") {
        e.preventDefault();
        save();
        return;
      }

      // Ctrl+P: Command palette
      if (isCtrl && e.key === "p") {
        e.preventDefault();
        setPaletteMode("command");
        setPaletteOpen(true);
        return;
      }

      // Ctrl+O: Quick open file
      if (isCtrl && e.key === "o") {
        e.preventDefault();
        setPaletteMode("file");
        setPaletteOpen(true);
        return;
      }

      // Ctrl+N: New file
      if (isCtrl && e.key === "n") {
        e.preventDefault();
        if (vaultPath) {
          createNewFile();
        }
        return;
      }

      // Ctrl+Shift+F: Global search
      if (isCtrl && e.shiftKey && e.key === "F") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }

      // Ctrl+Shift+E: Agent Eval Panel (Dev only)
      if (import.meta.env.DEV && isCtrl && e.shiftKey && e.key === "E") {
        e.preventDefault();
        setEvalPanelOpen(true);
        return;
      }

      // Ctrl+Shift+C: Codex VS Code extension host (Dev only)
      if (import.meta.env.DEV && isCtrl && e.shiftKey && e.key === "C") {
        e.preventDefault();
        setCodexPanelOpen(true);
        return;
      }

      if (pluginRuntime.handleHotkey(e)) {
        return;
      }

      // Esc: Close eval panel
      if (e.key === "Escape" && evalPanelOpen) {
        e.preventDefault();
        setEvalPanelOpen(false);
        return;
      }

      // Esc: Close codex panel
      if (e.key === "Escape" && codexPanelOpen) {
        e.preventDefault();
        setCodexPanelOpen(false);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [save, vaultPath, createNewFile, evalPanelOpen, codexPanelOpen]);

  // Open folder dialog
  const handleOpenVault = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t.welcome.openFolder,
    });

    if (selected && typeof selected === "string") {
      setVaultPath(selected);
    }
  }, [setVaultPath]);

  // Listen for open-vault event from command palette
  useEffect(() => {
    const onOpenVault = () => handleOpenVault();
    const onOpenSearch = () => setSearchOpen(true);
    const onOpenCreateDb = () => setCreateDbOpen(true);
    window.addEventListener("open-vault", onOpenVault);
    window.addEventListener("open-global-search", onOpenSearch);
    window.addEventListener("open-create-database", onOpenCreateDb);
    return () => {
      window.removeEventListener("open-vault", onOpenVault);
      window.removeEventListener("open-global-search", onOpenSearch);
      window.removeEventListener("open-create-database", onOpenCreateDb);
    };
  }, [handleOpenVault, setSearchOpen]);

  // Handle resize - must be before conditional returns
  // VS Code 风格：拖动可以折叠/展开面板
  const LEFT_MIN_WIDTH = 200;  // store 中的最小值
  const RIGHT_MIN_WIDTH = 280; // store 中的最小值
  const MAIN_MIN_WIDTH = 480;
  const MAIN_RESTORE_WIDTH = 520;

  const layoutRef = useRef<HTMLDivElement>(null);
  const ribbonRef = useRef<HTMLDivElement>(null);
  const [isMainCollapsed, setIsMainCollapsed] = useState(false);

  // 累计拖拽距离（用于折叠状态下展开）
  const dragAccumulatorRef = useRef(0);

  const handleLeftResize = useCallback(
    (delta: number) => {
      if (!leftSidebarOpen) {
        // 面板已折叠：累计向右拖拽距离
        dragAccumulatorRef.current += delta;
        if (dragAccumulatorRef.current > 50) {
          // 累计拖动超过 50px，打开面板并设置宽度
          const newWidth = Math.max(LEFT_MIN_WIDTH, dragAccumulatorRef.current);
          setLeftSidebarOpen(true);
          setLeftSidebarWidth(newWidth);
          dragAccumulatorRef.current = 0;
        }
      } else {
        // 面板已打开：调整宽度或折叠
        dragAccumulatorRef.current = 0; // 重置累计器
        if (leftSidebarWidth <= LEFT_MIN_WIDTH && delta < 0) {
          setLeftSidebarOpen(false);
        } else {
          setLeftSidebarWidth(leftSidebarWidth + delta);
        }
      }
    },
    [leftSidebarOpen, leftSidebarWidth, setLeftSidebarOpen, setLeftSidebarWidth]
  );

  const handleRightResize = useCallback(
    (delta: number) => {
      const newWidth = rightSidebarWidth + delta;
      // 当已经是最小宽度且继续向内拖时，折叠面板
      if (rightSidebarWidth <= RIGHT_MIN_WIDTH && delta < 0) {
        toggleRightSidebar();
      } else {
        setRightSidebarWidth(newWidth);
      }
    },
    [rightSidebarWidth, setRightSidebarWidth, toggleRightSidebar]
  );

  const getAvailableMainWidth = useCallback(() => {
    const totalWidth = layoutRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    const ribbonWidth = ribbonRef.current?.getBoundingClientRect().width ?? 0;
    const leftWidth = leftSidebarOpen ? leftSidebarWidth : 0;
    const rightWidth = rightSidebarOpen ? rightSidebarWidth : 0;
    return totalWidth - ribbonWidth - leftWidth - rightWidth;
  }, [leftSidebarOpen, leftSidebarWidth, rightSidebarOpen, rightSidebarWidth]);

  useEffect(() => {
    const updateMainCollapse = () => {
      if (!rightSidebarOpen) {
        if (isMainCollapsed) setIsMainCollapsed(false);
        return;
      }

      const availableWidth = getAvailableMainWidth();
      if (!isMainCollapsed && availableWidth < MAIN_MIN_WIDTH) {
        setIsMainCollapsed(true);
      } else if (isMainCollapsed && availableWidth >= MAIN_RESTORE_WIDTH) {
        setIsMainCollapsed(false);
      }
    };

    updateMainCollapse();
    window.addEventListener("resize", updateMainCollapse);
    return () => window.removeEventListener("resize", updateMainCollapse);
  }, [getAvailableMainWidth, isMainCollapsed, rightSidebarOpen]);

  // Welcome screen when no vault is open
  if (!vaultPath) {
    return <WelcomeScreen onOpenVault={handleOpenVault} />;
  }

  return (
    <div className="h-full flex flex-col bg-background ui-app-bg">
      <TitleBar />
      <PluginShellSlotHost slotId="app-top" />
      <div ref={layoutRef} className="flex-1 flex overflow-hidden transition-colors duration-300">
        {/* Left Ribbon (Icon Bar) */}
        <div ref={ribbonRef} className="flex-shrink-0">
          <Ribbon />
        </div>

        {/* Left Sidebar (File Tree) */}
        <div
          className={`flex-shrink-0 transition-all duration-300 ease-out overflow-hidden ${leftSidebarOpen ? "opacity-100" : "w-0 opacity-0"
            }`}
          style={{ width: leftSidebarOpen ? leftSidebarWidth : 0 }}
        >
          <DevProfiler id="Sidebar">
            <Sidebar />
          </DevProfiler>
        </div>

        {/* Left Resize Handle - VS Code 风格，始终显示，可拖拽展开/折叠 */}
        <div className="relative flex-shrink-0 h-full z-20">
          <ResizeHandle
            direction="left"
            onResize={handleLeftResize}
            onDoubleClick={toggleLeftSidebar}
          />
        </div>

        {/* Main content - switches between Editor, Graph, Split, Diff, VideoNote and AI Chat based on state */}
        <main
          className={`flex flex-col overflow-hidden min-w-0 transition-[width,opacity] duration-200 ${
            isMainCollapsed ? "flex-none w-0 opacity-0 pointer-events-none" : "flex-1 w-auto opacity-100"
          }`}
        >
          {pendingDiff && activeTab?.type !== "ai-chat" ? (
            // Show diff view when there's a pending AI edit (non chat context)
            <DiffViewWrapper />
          ) : activeTab?.type === "database" && activeTab.databaseId ? (
            // 数据库标签页（支持分栏）
            <div className="flex-1 flex flex-col overflow-hidden bg-background">
              <TabBar />
              {splitView ? (
                // 数据库 + 分栏：左边数据库，右边笔记
                <DatabaseSplitView dbId={activeTab.databaseId} />
              ) : (
                // 纯数据库
                <DatabaseView dbId={activeTab.databaseId} className="flex-1" />
              )}
            </div>
          ) : activeTab?.type === "video-note" ? (
            // 视频笔记标签页
            <div className="flex-1 flex flex-col overflow-hidden bg-background">
              <TabBar />
              <VideoNoteView
                initialUrl={activeTab.videoUrl}
                initialNoteFile={activeTab.videoNoteData}
                isActive={true}
              />
            </div>
          ) : activeTab?.type === "webpage" ? (
            // 网页浏览器标签页
            <div className="flex-1 flex flex-col overflow-hidden bg-background">
              <TabBar />
              <BrowserView
                tabId={activeTab.id}
                initialUrl={activeTab.webpageUrl}
                isActive={true}
              />
            </div>
          ) : activeTab?.type === "pdf" && activeTab.path ? (
            // PDF 标签页
            <div className="flex-1 flex flex-col overflow-hidden bg-background">
              <TabBar />
              <PDFViewer filePath={activeTab.path} className="flex-1" />
            </div>
          ) : activeTab?.type === "diagram" && activeTab.path ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-background">
              <TabBar />
              <Suspense
                fallback={
                  <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                    Loading diagram editor...
                  </div>
                }
              >
                <DiagramView key={activeTab.path} filePath={activeTab.path} className="flex-1" />
              </Suspense>
            </div>
          ) : activeTab?.type === "typesetting-doc" && activeTab.path ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-background">
              <TabBar />
              <TypesettingDocumentPane path={activeTab.path} />
            </div>
          ) : activeTab?.type === "typesetting-preview" ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-background">
              <TabBar />
              <TypesettingPreviewPane />
            </div>
          ) : activeTab?.type === "flashcard" ? (
            // 闪卡复习标签页
            <div className="flex-1 flex flex-col overflow-hidden bg-background">
              <TabBar />
              <FlashcardView deckId={activeTab.flashcardDeckId} />
            </div>
          ) : activeTab?.type === "cardflow" ? (
            // 卡片流视图
            <div className="flex-1 flex flex-col overflow-hidden bg-background">
              <TabBar />
              <CardFlowView />
            </div>
          ) : activeTab?.type === "profile-preview" ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-background">
              <TabBar />
              <ProfilePreview />
            </div>
          ) : activeTab?.type === "plugin-view" ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-background">
              <TabBar />
              <PluginViewPane
                title={activeTab.name}
                html={activeTab.pluginViewHtml || "<p>Empty plugin view</p>"}
                scopeId={activeTab.pluginViewType}
              />
            </div>
          ) : activeTab?.type === "ai-chat" ? (
            // 主视图区 AI 聊天标签页，交给 Editor 内部根据 tab 类型渲染
            <Editor />
          ) : splitView && currentFile ? (
            // Show split editor when enabled
            <SplitEditor />
          ) : activeTab?.type === "graph" || activeTab?.type === "isolated-graph" ? (
            // 图谱标签页
            <EditorWithGraph />
          ) : currentFile ? (
            // 文件编辑
            <Editor />
          ) : (
            // 空状态或其他标签页类型 - 统一使用 EditorWithGraph 保持 TabBar 一致
            <EditorWithGraph />
          )}
        </main>

        {/* Right Resize Handle + Collapse Button */}
        <div className="relative flex-shrink-0 h-full z-20">
          {rightSidebarOpen && (
            <ResizeHandle
              direction="right"
              onResize={handleRightResize}
              onDoubleClick={toggleRightSidebar}
            />
          )}
          {/* Right Collapse Button - 只在面板收起时显示 */}
          {!rightSidebarOpen && (
            <button
              onClick={toggleRightSidebar}
              className="absolute top-1/2 -translate-y-1/2 z-10 right-1 w-7 h-7 bg-background/55 backdrop-blur-md border border-border/60 shadow-ui-card ui-icon-btn"
              title={t.layout.expandRightPanel}
            >
              <PanelRight className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Right Sidebar */}
        <div
          className={`transition-all duration-300 ease-out overflow-hidden ${
            rightSidebarOpen ? "opacity-100" : "w-0 opacity-0"
          } ${isMainCollapsed && rightSidebarOpen ? "flex-1" : "flex-shrink-0"}`}
          style={{ width: rightSidebarOpen && !isMainCollapsed ? rightSidebarWidth : rightSidebarOpen ? undefined : 0 }}
        >
          <DevProfiler id="RightPanel">
            <RightPanel />
          </DevProfiler>
        </div>
      </div>

      <CodexPanelHost />

      {/* Command Palette */}
      <CommandPalette
        isOpen={paletteOpen}
        mode={paletteMode}
        onClose={() => setPaletteOpen(false)}
        onModeChange={setPaletteMode}
      />

      {/* Global Search */}
      <GlobalSearch
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
      />

      {/* Create Database Dialog */}
      <CreateDatabaseDialog
        isOpen={createDbOpen}
        onClose={() => setCreateDbOpen(false)}
      />

      {/* Skill Manager */}
      <SkillManagerModal
        isOpen={isSkillManagerOpen}
        onClose={() => setSkillManagerOpen(false)}
      />

      {/* AI Floating Ball */}
      <AIFloatingBall />

      {/* Voice Input Floating Ball - 语音输入悬浮球 */}
      <VoiceInputBall />

      {/* Agent Eval Panel (Dev only) */}
      {import.meta.env.DEV && evalPanelOpen && (
        <div className="fixed inset-0 z-[100] bg-background">
          <div className="absolute top-2 right-2 z-10">
            <button
              onClick={() => setEvalPanelOpen(false)}
              className="px-4 py-2 bg-muted rounded hover:bg-muted/80"
            >
              ✕ {t.common.close} (Esc)
            </button>
          </div>
          <AgentEvalPanel />
        </div>
      )}

      {/* Codex VS Code extension host panel (Dev only) */}
      {import.meta.env.DEV && codexPanelOpen && (
        <div className="fixed inset-0 z-[100] bg-background">
          <div className="hidden">
            <button
              onClick={() => setCodexPanelOpen(false)}
              className="px-4 py-2 bg-muted rounded hover:bg-muted/80"
            >
              ✕ {t.common.close} (Esc)
            </button>
          </div>
          <CodexVscodeHostPanel onClose={() => setCodexPanelOpen(false)} />
        </div>
      )}

      <PluginStatusBar />
      <PluginShellSlotHost slotId="app-bottom" />
      <PluginContextMenuHost />
      <MobileWorkspaceToast />
      <PluginPanelDock />
    </div>
  );
}

export default App;
