import {
  Suspense,
  lazy,
  useEffect,
  useCallback,
  useState,
  useRef,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { getVersion } from "@/lib/host";
import { listen } from "@/lib/host";
import { invoke } from "@/lib/host";
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
import {
  CommandPalette,
  PaletteMode,
} from "@/components/search/CommandPalette";
import { TabBar } from "@/components/layout/TabBar";
import { DiffView } from "@/components/effects/DiffView";
import { SkillManagerModal } from "@/components/ai/SkillManagerModal";
import { CommandMenu, CommandMenuProvider } from "@/components/ui";
import { PDFViewer } from "@/components/pdf";
import { ImageManagerView } from "@/components/images/ImageManagerView";
import { useAIStore } from "@/stores/useAIStore";
import { initOpencodeAgentListeners } from "@/stores/useOpencodeAgent";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { getDragData, clearDragData } from "@/lib/dragState";
import {
  openDialog,
  saveFile,
  setWindowSize,
  startFileWatcher,
} from "@/lib/host";
import { TitleBar } from "@/components/layout/TitleBar";
import { useMacTopChromeEnabled } from "@/components/layout/MacTopChrome";
import { MacLeftPaneTopBar } from "@/components/layout/MacLeftPaneTopBar";
import { enableDebugLogger, disableDebugLogger } from "@/lib/debugLogger";
import { WelcomeScreen } from "@/components/onboarding/WelcomeScreen";
import { OverviewDashboard } from "@/components/overview/OverviewDashboard";
import { ProfilePreview } from "@/components/profile/ProfilePreview";
import { DevProfiler } from "@/perf/DevProfiler";
import type { FsChangePayload } from "@/lib/fsChange";
import { usePluginStore } from "@/stores/usePluginStore";
import { pluginRuntime } from "@/services/plugins/runtime";
import { applyTheme, getThemeById } from "@/config/themePlugin";
import { PluginViewPane } from "@/components/plugins/PluginViewPane";
import { PluginPanelDock } from "@/components/plugins/PluginPanelDock";
import { PluginStatusBar } from "@/components/layout/PluginStatusBar";
import { PluginContextMenuHost } from "@/components/plugins/PluginContextMenuHost";
import { PluginShellSlotHost } from "@/components/plugins/PluginShellSlotHost";
import { ErrorNotifications } from "@/components/layout/ErrorNotifications";
import { reportOperationError, reportUnhandledError } from "@/lib/reportError";
import {
  initAutoUpdateCheck,
  initResumableUpdateListeners,
  useUpdateStore,
} from "@/stores/useUpdateStore";
import { isTauriAvailable } from "@/lib/host";
import { hydrateProxyConfigOnStartup } from "@/lib/proxyStartup";

// Debug logging is enabled via a runtime toggle (or always in dev).

const DiagramView = lazy(async () => {
  const mod = await import("@/components/diagram/DiagramView");
  return { default: mod.DiagramView };
});

const MAIN_WORKSPACE_WINDOW_WIDTH = 1280;
const MAIN_WORKSPACE_WINDOW_HEIGHT = 840;

// Component that shows tabs + graph/editor content
function EditorWithGraph() {
  const { tabs, activeTabIndex } = useFileStore(
    useShallow((state) => ({
      tabs: state.tabs,
      activeTabIndex: state.activeTabIndex,
    })),
  );
  const activeTab = activeTabIndex >= 0 ? tabs[activeTabIndex] : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background transition-colors duration-300">
      <TabBar />
      {activeTab?.type === "graph" ? (
        <KnowledgeGraph className="flex-1" />
      ) : activeTab?.type === "isolated-graph" && activeTab.isolatedNode ? (
        <KnowledgeGraph
          className="flex-1"
          isolatedNode={activeTab.isolatedNode}
        />
      ) : (
        <OverviewDashboard />
      )}
    </div>
  );
}

// Component that shows diff view
function DiffViewWrapper() {
  const { t } = useLocaleStore();
  const { pendingDiff, setPendingDiff, clearPendingEdits, diffResolver } =
    useAIStore();
  const openFile = useFileStore((state) => state.openFile);

  const handleAccept = useCallback(async () => {
    if (!pendingDiff) return;

    try {
      // Save to file first
      await saveFile(pendingDiff.filePath, pendingDiff.modified);

      // Clear the diff and pending edits
      clearPendingEdits();

      // Refresh the file in editor (forceReload = true)
      await openFile(pendingDiff.filePath, {
        addToHistory: false,
        forceReload: true,
      });

      console.log(`✅ 已应用修改到 ${pendingDiff.fileName}`);

      // Resolve promise if exists
      if (diffResolver) {
        diffResolver(true);
      }
    } catch (error) {
      reportOperationError({
        source: "App.DiffViewWrapper.handleAccept",
        action: "Apply AI edit diff",
        error,
        userMessage: t.ai.applyEditFailed,
        context: { filePath: pendingDiff.filePath },
      });
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

const AUTO_TOOLTIP_FLAG = "data-lumina-auto-tooltip";

function inferButtonTooltip(button: HTMLButtonElement): string {
  const ariaLabel = button.getAttribute("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;

  const dataTooltip = button.getAttribute("data-tooltip")?.trim();
  if (dataTooltip) return dataTooltip;

  const text = button.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (text.length > 0) {
    return text.length > 80 ? `${text.slice(0, 79)}…` : text;
  }

  return "点击执行此操作";
}

function applyAutoButtonTooltips(root: ParentNode) {
  const buttons = root.querySelectorAll<HTMLButtonElement>("button");
  buttons.forEach((button) => {
    const currentTitle = button.getAttribute("title")?.trim() ?? "";
    const autoTitle = button.getAttribute(AUTO_TOOLTIP_FLAG)?.trim() ?? "";
    const hasExplicitTitle =
      currentTitle.length > 0 && currentTitle !== autoTitle;
    if (hasExplicitTitle) {
      button.removeAttribute(AUTO_TOOLTIP_FLAG);
      return;
    }

    const inferred = inferButtonTooltip(button);
    if (currentTitle !== inferred) {
      button.setAttribute("title", inferred);
    }
    if (autoTitle !== inferred) {
      button.setAttribute(AUTO_TOOLTIP_FLAG, inferred);
    }
  });
}

function App() {
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
    })),
  );
  const pendingDiff = useAIStore((state) => state.pendingDiff);
  const buildIndex = useNoteIndexStore((state) => state.buildIndex);
  const t = useLocaleStore((state) => state.t);
  const loadPlugins = usePluginStore((state) => state.loadPlugins);
  const setAppearanceSafeMode = usePluginStore(
    (state) => state.setAppearanceSafeMode,
  );
  const setCurrentUpdateVersion = useUpdateStore(
    (state) => state.setCurrentVersion,
  );

  // Get active tab
  const activeTab = activeTabIndex >= 0 ? tabs[activeTabIndex] : null;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("command");
  const [isLoadingVault, setIsLoadingVault] = useState(false);
  const [welcomePreview, setWelcomePreview] = useState(false);
  const welcomeTapRef = useRef<{
    count: number;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ count: 0, timer: null });

  // Global button tooltip fallback: auto-fill title for buttons that don't define one.
  useEffect(() => {
    applyAutoButtonTooltips(document);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (!(node instanceof HTMLElement)) return;
            if (node.tagName === "BUTTON") {
              applyAutoButtonTooltips(node.parentElement ?? document);
              return;
            }
            applyAutoButtonTooltips(node);
          });
        }

        if (
          mutation.type === "attributes" &&
          mutation.target instanceof HTMLButtonElement
        ) {
          const button = mutation.target;
          applyAutoButtonTooltips(button.parentElement ?? document);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-label", "data-tooltip", "title"],
    });

    return () => observer.disconnect();
  }, []);

  // 首次启动时默认打开 AI Chat
  useEffect(() => {
    if (tabs.length === 0) {
      openAIMainTab();
    }
  }, []);

  // Start the opencode event stream + session list at app boot so the UI
  // is warm before MainAIChatShell mounts. Idempotent.
  useEffect(() => {
    initOpencodeAgentListeners();
  }, []);

  // 启动时自动检查更新（延迟 5 秒，避免影响启动性能）
  useEffect(() => {
    initAutoUpdateCheck(5000);
    void initResumableUpdateListeners();
  }, []);

  // Hydrate the Rust-side proxy state from persisted UI settings before delayed update checks run.
  useEffect(() => {
    void hydrateProxyConfigOnStartup(useUIStore.getState()).catch((err) => {
      console.warn("[Proxy] Failed to hydrate proxy config on startup:", err);
    });
  }, []);

  useEffect(() => {
    if (!isTauriAvailable()) {
      setCurrentUpdateVersion(null);
      return;
    }

    getVersion()
      .then((version) => setCurrentUpdateVersion(version))
      .catch(() => setCurrentUpdateVersion(null));
  }, [setCurrentUpdateVersion]);

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
    pluginRuntime.emit("workspace:changed", {
      workspacePath: vaultPath ?? null,
    });
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
          "style[data-lumina-plugin-style], style[data-lumina-plugin-theme-light], style[data-lumina-plugin-theme-dark], style[data-lumina-plugin-editor-decoration]",
        )
        .forEach((node) => node.remove());

      // 关键兜底：清理插件样式后要立即恢复用户基础主题变量，
      // 否则会退回到 globals.css 的默认 dark 配色（偏蓝），看起来像主题错乱。
      const uiState = useUIStore.getState();
      const baseTheme = getThemeById(uiState.themeId || "default");
      if (baseTheme) {
        if (uiState.isDarkMode) {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
        applyTheme(baseTheme, uiState.isDarkMode);
      }

      void setAppearanceSafeMode(true, vaultPath || undefined);
      localStorage.removeItem(crashFlagKey);
    }
    localStorage.setItem(crashFlagKey, "1");
    return () => {
      localStorage.removeItem(crashFlagKey);
    };
  }, [setAppearanceSafeMode, vaultPath]);

  // 启动文件监听器，自动刷新文件树
  useEffect(() => {
    if (!vaultPath) return;

    let unlisten: (() => void) | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const setupWatcher = async () => {
      try {
        const { getFsChangePath, handleFsChangeEvent } =
          await import("@/lib/fsChange");
        const { reloadFileIfOpen } = useFileStore.getState();
        const { reloadSecondaryIfOpen } = (
          await import("@/stores/useSplitStore")
        ).useSplitStore.getState();

        // 启动后端文件监听（去重，避免重复创建 watcher 线程）
        await startFileWatcher(vaultPath);
        console.log("[FileWatcher] Started watching:", vaultPath);

        // 监听文件变化事件（带防抖）
        unlisten = await listen<FsChangePayload | null>(
          "fs:change",
          (event) => {
            if (import.meta.env.DEV) {
              console.log("[FileWatcher] File changed:", event.payload);
            }

            // 防抖：500ms 内多次变化只刷新一次
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              const changedPath = getFsChangePath(event.payload);
              if (changedPath) {
                const fileStore = useFileStore.getState();
                const dirtyPaths = fileStore.tabs
                  .filter((tab) => tab.type === "file" && tab.isDirty)
                  .map((tab) => tab.path);
                if (fileStore.currentFile && fileStore.isDirty) {
                  dirtyPaths.push(fileStore.currentFile);
                }
                const normalize = (path: string) => path.replace(/\\/g, "/");
                const vaultPrefix = `${normalize(vaultPath).replace(/\/+$/, "")}/`;
                const normalizedChangedPath = normalize(changedPath);
                if (!normalizedChangedPath.startsWith(vaultPrefix)) {
                  handleFsChangeEvent(event.payload, (path) => {
                    reloadFileIfOpen(path, { skipIfDirty: true });
                    reloadSecondaryIfOpen(path, { skipIfDirty: true });
                  });
                  return;
                }
              }
              refreshFileTree();
              handleFsChangeEvent(event.payload, (path) => {
                reloadFileIfOpen(path, { skipIfDirty: true });
                reloadSecondaryIfOpen(path, { skipIfDirty: true });
              });
            }, 500);
          },
        );
        // Listen for watcher degradation (EMFILE)
        const unlistenDegraded = await listen<{
          path: string;
          reason: string;
        }>("fs:watcher-degraded", (event) => {
          console.warn(
            "[FileWatcher] Watcher degraded for",
            event.payload.path,
            "reason:",
            event.payload.reason,
          );
          reportOperationError({
            source: "App.setupWatcher",
            action: "File watcher degraded — auto-refresh disabled",
            error: new Error(`Watcher stopped: ${event.payload.reason}`),
            level: "warning",
            context: { path: event.payload.path },
          });
        });

        const origUnlisten = unlisten;
        unlisten = () => {
          origUnlisten?.();
          unlistenDegraded();
        };
      } catch (error) {
        reportOperationError({
          source: "App.setupWatcher",
          action: "Start filesystem watcher",
          error,
          level: "warning",
          context: { vaultPath },
        });
      }
    };

    setupWatcher();

    return () => {
      if (unlisten) unlisten();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [vaultPath, refreshFileTree]);
  const {
    leftSidebarOpen,
    rightSidebarOpen,
    leftSidebarWidth,
    rightSidebarWidth,
    setLeftSidebarOpen,
    setLeftSidebarWidth,
    setRightSidebarWidth,
    setRightSidebarOpen,
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
      setRightSidebarOpen: state.setRightSidebarOpen,
      toggleLeftSidebar: state.toggleLeftSidebar,
      toggleRightSidebar: state.toggleRightSidebar,
      splitView: state.splitView,
      isSkillManagerOpen: state.isSkillManagerOpen,
      setSkillManagerOpen: state.setSkillManagerOpen,
      diagnosticsEnabled: state.diagnosticsEnabled,
    })),
  );
  const showMacTopChrome = useMacTopChromeEnabled();
  const showMacLeftPaneTopBar = showMacTopChrome && leftSidebarOpen;
  const showMacRibbonTrafficLightSafeArea =
    showMacTopChrome && !showMacLeftPaneTopBar;
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
        event.colno,
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

  // Always surface unhandled runtime errors to users so they can report actionable issues.
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      reportUnhandledError("window.error", event.error ?? event.message, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    };
    const onUnhandled = (event: PromiseRejectionEvent) => {
      reportUnhandledError("window.unhandledrejection", event.reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandled);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandled);
    };
  }, []);

  // Build note index when file tree changes
  useEffect(() => {
    if (fileTree.length > 0) {
      buildIndex(fileTree);
    }
  }, [fileTree, buildIndex]);

  // Prevent accidental close when there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const { isDirty, tabs } = useFileStore.getState();
      const hasDirty =
        isDirty || tabs.some((t) => t.isDirty && t.type === "file");
      if (hasDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Send dirty state to Electron main process for close protection
  useEffect(() => {
    if (!isTauriAvailable()) return;

    const sendDirtyState = () => {
      const { isDirty, tabs } = useFileStore.getState();
      const count =
        tabs.filter((t) => t.isDirty && t.type === "file").length +
        (isDirty ? 1 : 0);
      invoke("set_dirty_state", { count });
    };

    // Send initial state
    sendDirtyState();

    // Subscribe to store changes
    const unsubscribe = useFileStore.subscribe((state, prevState) => {
      if (
        state.isDirty !== prevState.isDirty ||
        state.tabs !== prevState.tabs
      ) {
        sendDirtyState();
      }
    });

    return unsubscribe;
  }, []);

  // 全局鼠标拖拽处理：模拟从文件树拖拽文件创建双链
  useEffect(() => {
    let dragIndicator: HTMLDivElement | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      const dragData = getDragData();
      if (!dragData) return;

      // 检测是否开始拖拽（移动超过 5px）
      const dx = e.clientX - dragData.startX;
      const dy = e.clientY - dragData.startY;

      if (!dragData.isDragging && Math.sqrt(dx * dx + dy * dy) > 5) {
        dragData.isDragging = true;

        // 创建拖拽指示器 - VS Code/Cursor 风格
        dragIndicator = document.createElement("div");
        dragIndicator.className =
          "fixed pointer-events-none z-[9999] flex items-center gap-2 px-3 py-2 bg-popover/95 backdrop-blur-sm text-popover-foreground text-sm rounded-lg border border-border shadow-xl";

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
          <span class="truncate max-w-[200px]">${dragData.fileName.replace(/\.(md|db\.json)$/i, "")}</span>
        `;
        document.body.appendChild(dragIndicator);
      }

      if (dragData.isDragging && dragIndicator) {
        dragIndicator.style.left = `${e.clientX - 8}px`;
        dragIndicator.style.top = `${e.clientY + 2}px`;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      const dragData = getDragData();
      if (!dragData) return;

      // 清理拖拽指示器
      if (dragIndicator) {
        dragIndicator.remove();
        dragIndicator = null;
      }

      if (dragData.isDragging) {
        // 检查是否放置在文件夹上
        const folderTarget = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest("[data-folder-path]");
        if (folderTarget) {
          const targetPath = folderTarget.getAttribute("data-folder-path");
          if (targetPath && targetPath !== dragData.filePath) {
            // 触发文件夹放置事件
            const folderDropEvent = new CustomEvent("lumina-folder-drop", {
              detail: {
                sourcePath: dragData.filePath,
                targetFolder: targetPath,
                isFolder: dragData.isFolder,
              },
            });
            window.dispatchEvent(folderDropEvent);
            // 清理全局数据
            clearDragData();
            return;
          }
        }

        // 文件夹不能插入链接，只触发文件的 lumina-drop
        if (!dragData.isFolder) {
          // 触发自定义事件，让编辑器和 AI 对话框处理
          const dropEvent = new CustomEvent("lumina-drop", {
            detail: {
              wikiLink: dragData.wikiLink,
              filePath: dragData.filePath,
              fileName: dragData.fileName,
              x: e.clientX,
              y: e.clientY,
            },
          });
          window.dispatchEvent(dropEvent);
        }
      }

      // 清理全局数据
      clearDragData();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
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

      // Ctrl+Shift+F: Global search → switch left sidebar to search mode
      if (isCtrl && e.shiftKey && e.key === "F") {
        e.preventDefault();
        const ui = useUIStore.getState();
        if (!ui.leftSidebarOpen) ui.setLeftSidebarOpen(true);
        ui.setLeftSidebarMode("search");
        return;
      }

      if (pluginRuntime.handleHotkey(e)) {
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [save, vaultPath, createNewFile]);

  // Open folder dialog
  const handleOpenVault = useCallback(async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: t.welcome.openFolder,
      });

      if (selected && typeof selected === "string") {
        setVaultPath(selected);
      }
    } catch (error) {
      console.error("[App.handleOpenVault] Open folder dialog failed:", error);
    }
  }, [setVaultPath, t.welcome.openFolder]);

  // Listen for window-level entry actions dispatched from top-level chrome
  useEffect(() => {
    const onOpenVault = () => handleOpenVault();
    const onOpenSearch = () => {
      const ui = useUIStore.getState();
      if (!ui.leftSidebarOpen) ui.setLeftSidebarOpen(true);
      ui.setLeftSidebarMode("search");
    };
    const onOpenCommandPalette = () => setPaletteOpen(true);
    window.addEventListener("open-vault", onOpenVault);
    window.addEventListener("open-global-search", onOpenSearch);
    window.addEventListener("open-command-palette", onOpenCommandPalette);
    return () => {
      window.removeEventListener("open-vault", onOpenVault);
      window.removeEventListener("open-global-search", onOpenSearch);
      window.removeEventListener("open-command-palette", onOpenCommandPalette);
    };
  }, [handleOpenVault, setPaletteOpen]);

  useEffect(() => {
    if (!vaultPath) return;
    void setWindowSize(
      MAIN_WORKSPACE_WINDOW_WIDTH,
      MAIN_WORKSPACE_WINDOW_HEIGHT,
    ).catch((error) => {
      console.warn("[App] Failed to restore workspace window size:", error);
    });
  }, [vaultPath]);

  // Handle resize - must be before conditional returns
  // VS Code 风格：拖动可以折叠/展开面板
  const LEFT_MIN_WIDTH = 200; // store 中的最小值
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
    [
      leftSidebarOpen,
      leftSidebarWidth,
      setLeftSidebarOpen,
      setLeftSidebarWidth,
    ],
  );

  const handleRightResize = useCallback(
    (delta: number) => {
      if (!rightSidebarOpen) {
        // 面板已折叠：累计向左拖拽距离
        dragAccumulatorRef.current += delta;
        if (dragAccumulatorRef.current > 50) {
          // 累计拖动超过 50px，打开面板并设置宽度
          const newWidth = Math.max(
            RIGHT_MIN_WIDTH,
            dragAccumulatorRef.current,
          );
          setRightSidebarOpen(true);
          setRightSidebarWidth(newWidth);
          dragAccumulatorRef.current = 0;
        }
      } else {
        // 面板已打开：调整宽度或折叠
        dragAccumulatorRef.current = 0; // 重置累计器
        if (rightSidebarWidth <= RIGHT_MIN_WIDTH && delta < 0) {
          setRightSidebarOpen(false);
        } else {
          setRightSidebarWidth(rightSidebarWidth + delta);
        }
      }
    },
    [
      rightSidebarOpen,
      rightSidebarWidth,
      setRightSidebarOpen,
      setRightSidebarWidth,
    ],
  );

  const getAvailableMainWidth = useCallback(() => {
    const totalWidth =
      layoutRef.current?.getBoundingClientRect().width ?? window.innerWidth;
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
    <div className="h-full flex flex-col bg-background">
      <TitleBar />
      <PluginShellSlotHost slotId="app-top" />
      <div
        ref={layoutRef}
        className="flex-1 flex overflow-hidden transition-colors duration-300"
      >
        <div className="flex min-h-0 flex-shrink-0 flex-col">
          {showMacLeftPaneTopBar ? <MacLeftPaneTopBar /> : null}

          <div className="flex min-h-0 flex-1">
            {/* Left Ribbon (Icon Bar) */}
            <div ref={ribbonRef} className="flex-shrink-0">
              <Ribbon
                showMacTrafficLightSafeArea={showMacRibbonTrafficLightSafeArea}
                flushTopSpacing={showMacLeftPaneTopBar}
              />
            </div>

            {/* Left Sidebar (File Tree) */}
            <div
              data-side="left"
              data-open={leftSidebarOpen ? "true" : "false"}
              className={`app-sidebar-shell flex-shrink-0 ${
                leftSidebarOpen ? "opacity-100" : "opacity-0"
              }`}
              style={{ width: leftSidebarOpen ? leftSidebarWidth : 0 }}
            >
              <div
                className="app-sidebar-inner"
                style={{ width: leftSidebarWidth }}
              >
                <DevProfiler id="Sidebar">
                  <Sidebar />
                </DevProfiler>
              </div>
            </div>
          </div>
        </div>

        {/* Left Resize Handle - VS Code 风格，始终显示，可拖拽展开/折叠 */}
        <div className="relative flex-shrink-0 h-full z-20 bg-background">
          <ResizeHandle
            direction="left"
            onResize={handleLeftResize}
            onDoubleClick={toggleLeftSidebar}
          />
        </div>

        {/* Main content - switches between Editor, Graph, Split, Diff and AI Chat based on state */}
        <main
          className={`relative flex flex-col overflow-hidden min-w-0 bg-background transition-[width,opacity] duration-200 ${
            isMainCollapsed
              ? "flex-none w-0 opacity-0 pointer-events-none"
              : "flex-1 w-auto opacity-100"
          }`}
        >
          {pendingDiff && activeTab?.type !== "ai-chat" ? (
            // Show diff view when there's a pending AI edit (non chat context)
            <DiffViewWrapper />
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
                    {t.diagramView.loadingEditor}
                  </div>
                }
              >
                <DiagramView
                  key={activeTab.path}
                  filePath={activeTab.path}
                  externalContent={activeTab.content || undefined}
                  className="flex-1"
                />
              </Suspense>
            </div>
          ) : activeTab?.type === "image-manager" ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-background">
              <TabBar />
              <ImageManagerView />
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
                onAction={(action, data) => {
                  const scopedType = activeTab.pluginViewType;
                  if (!scopedType) return;
                  const actions = pluginRuntime.getTabActions(scopedType);
                  const handler = actions[action];
                  if (handler) {
                    void handler(data);
                  } else {
                    console.warn(
                      `[PluginViewPane] No handler for action "${action}" on tab type "${scopedType}"`,
                    );
                  }
                }}
              />
            </div>
          ) : activeTab?.type === "ai-chat" ? (
            // 主视图区 AI 聊天标签页，交给 Editor 内部根据 tab 类型渲染
            <Editor />
          ) : splitView && currentFile ? (
            // Show split editor when enabled
            <SplitEditor />
          ) : activeTab?.type === "graph" ||
            activeTab?.type === "isolated-graph" ? (
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

        {/* Right Resize Handle - VS Code 风格，始终显示，可拖拽展开/折叠 */}
        <div className="relative flex-shrink-0 h-full z-20 bg-background">
          <ResizeHandle
            direction="right"
            onResize={handleRightResize}
            onDoubleClick={toggleRightSidebar}
          />
        </div>

        {/* Right Sidebar */}
        <div
          data-side="right"
          data-open={rightSidebarOpen ? "true" : "false"}
          className={`app-sidebar-shell ${
            rightSidebarOpen ? "opacity-100" : "opacity-0"
          } ${isMainCollapsed && rightSidebarOpen ? "min-w-0 flex-1" : "flex-shrink-0"}`}
          style={{
            width:
              rightSidebarOpen && !isMainCollapsed
                ? rightSidebarWidth
                : rightSidebarOpen
                  ? undefined
                  : 0,
          }}
        >
          <div
            className="app-sidebar-inner"
            style={{
              width:
                isMainCollapsed && rightSidebarOpen
                  ? "100%"
                  : rightSidebarWidth,
            }}
          >
            <DevProfiler id="RightPanel">
              <RightPanel />
            </DevProfiler>
          </div>
        </div>
      </div>

      {/* Command Palette */}
      <CommandPalette
        isOpen={paletteOpen}
        mode={paletteMode}
        onClose={() => setPaletteOpen(false)}
        onModeChange={setPaletteMode}
      />

      {/* Skill Manager */}
      <SkillManagerModal
        isOpen={isSkillManagerOpen}
        onClose={() => setSkillManagerOpen(false)}
      />

      {/* Cmd+K command palette */}
      <CommandMenuProvider />
      <CommandMenu />

      {/* Hidden welcome preview: tap top-right corner 5 times to activate */}
      {welcomePreview && (
        <div className="fixed inset-0 z-[200]">
          <WelcomeScreen onOpenVault={() => setWelcomePreview(false)} />
        </div>
      )}
      <div
        className="fixed top-0 right-0 w-4 h-4 z-[99]"
        onClick={() => {
          const ref = welcomeTapRef.current;
          ref.count++;
          if (ref.timer) clearTimeout(ref.timer);
          if (ref.count >= 5) {
            ref.count = 0;
            setWelcomePreview(true);
          } else {
            ref.timer = setTimeout(() => {
              ref.count = 0;
            }, 2000);
          }
        }}
      />

      <PluginStatusBar />
      <PluginShellSlotHost slotId="app-bottom" />
      <PluginContextMenuHost />
      <ErrorNotifications />
      <PluginPanelDock />
    </div>
  );
}

export default App;
