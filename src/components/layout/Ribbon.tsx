import { useCallback, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useUIStore } from "@/stores/useUIStore";
import { useFileStore } from "@/stores/useFileStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { usePluginStore } from "@/stores/usePluginStore";
import {
  AlertCircle,
  FileText,
  Network,
  Puzzle,
  Search,
  Settings,
  Sun,
  Moon,
  Video,
  Database,
  Bot,
  Globe,
  Brain,
  LayoutGrid,
  Star,
  Download,
  Loader2,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { open as openExternal } from "@tauri-apps/plugin-shell";

import { cn } from "@/lib/utils";
import { exists, isTauriAvailable } from "@/lib/tauri";
import { SettingsModal } from "./SettingsModal";
import { UpdateModal } from "./UpdateModal";
import { type PluginRibbonItem, usePluginUiStore } from "@/stores/usePluginUiStore";
import { InstalledPluginsModal } from "@/components/plugins/InstalledPluginsModal";
import { useUpdateStore } from "@/stores/useUpdateStore";
import { getRibbonUpdateState } from "./ribbonUpdateState";

export function Ribbon() {
  const REPO_URL = "https://github.com/blueberrycongee/Lumina-Note";
  const [showSettings, setShowSettings] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showPlugins, setShowPlugins] = useState(false);
  const closeSettings = useCallback(() => setShowSettings(false), []);
  const closeUpdateModal = useCallback(() => setShowUpdateModal(false), []);
  const closePlugins = useCallback(() => setShowPlugins(false), []);
  const { t } = useLocaleStore();
  const { isDarkMode, toggleTheme, setRightPanelTab } = useUIStore();
  const isRibbonItemEnabled = usePluginStore((state) => state.isRibbonItemEnabled);
  const {
    tabs,
    activeTabIndex,
    openGraphTab,
    switchTab,
    recentFiles,
    openFile,
    fileTree,
    openAIMainTab,
    currentFile,
    openFlashcardTab,
    openCardFlowTab,
  } = useFileStore();
  const ribbonItems = usePluginUiStore((state) => state.ribbonItems);
  const { availableUpdate, hasUnreadUpdate, installTelemetry, currentVersion, isChecking } = useUpdateStore(
    useShallow((state) => ({
      availableUpdate: state.availableUpdate,
      hasUnreadUpdate: state.hasUnreadUpdate,
      installTelemetry: state.installTelemetry,
      currentVersion: state.currentVersion,
      isChecking: state.isChecking,
    })),
  );

  // 当前激活的标签
  const activeTab = activeTabIndex >= 0 ? tabs[activeTabIndex] : null;

  // 归一化当前主视图所属的功能区，方便扩展
  type RibbonSection = "ai" | "file" | "graph" | "video" | "database" | "browser" | "flashcard" | "cardflow" | "none";

  let activeSection: RibbonSection = "none";
  if (activeTab?.type === "ai-chat") {
    activeSection = "ai";
  } else if (activeTab?.type === "graph" || activeTab?.type === "isolated-graph") {
    activeSection = "graph";
  } else if (activeTab?.type === "video-note") {
    activeSection = "video";
  } else if (activeTab?.type === "database") {
    activeSection = "database";
  } else if (activeTab?.type === "webpage") {
    activeSection = "browser";
  } else if (activeTab?.type === "flashcard") {
    activeSection = "flashcard";
  } else if (activeTab?.type === "cardflow") {
    activeSection = "cardflow";
  } else if (activeTab?.type === "file" || currentFile) {
    // 没有特殊类型时，只要在编辑文件，就认为是文件编辑区
    activeSection = "file";
  }

  // Find first file tab to switch to
  const handleSwitchToFiles = async () => {
    const fileTabIndex = tabs.findIndex(tab => tab.type === "file");
    if (fileTabIndex !== -1) {
      switchTab(fileTabIndex);
      return;
    }

    // If no files open, try to open recent file
    if (recentFiles && recentFiles.length > 0) {
      for (let i = recentFiles.length - 1; i >= 0; i--) {
        const path = recentFiles[i];
        try {
          if (await exists(path)) {
            await openFile(path);
            return;
          }
        } catch (e) {
          console.warn(`Failed to check existence of ${path}:`, e);
        }
      }
    }

    // Fallback: Open the first file in the file tree
    const findFirstFile = (entries: typeof fileTree): string | null => {
      for (const entry of entries) {
        if (!entry.is_dir) return entry.path;
        if (entry.children) {
          const found = findFirstFile(entry.children);
          if (found) return found;
        }
      }
      return null;
    };

    const firstFile = findFirstFile(fileTree);
    if (firstFile) {
      openFile(firstFile);
    }
  };

  const handleOpenRepository = useCallback(async () => {
    try {
      await openExternal(REPO_URL);
    } catch (error) {
      console.warn("Failed to open repository link with shell plugin:", error);
      window.open(REPO_URL, "_blank", "noopener,noreferrer");
    }
  }, []);

  const handleOpenSettings = useCallback(() => setShowSettings(true), []);
  const handleOpenUpdateModal = useCallback(() => setShowUpdateModal(true), []);
  const handleOpenUpdateFromSettings = useCallback(() => {
    setShowSettings(false);
    setShowUpdateModal(true);
  }, []);

  const isPluginRibbonItemActive = useCallback(
    (item: PluginRibbonItem) => {
      if (!activeTab?.type) return false;
      return Array.isArray(item.activeWhenTabTypes) && item.activeWhenTabTypes.includes(activeTab.type);
    },
    [activeTab?.type],
  );

  const renderPluginRibbonIcon = (item: PluginRibbonItem) => {
    if (item.iconName === "video") return <Video size={18} />;
    if (item.iconName === "browser") return <Globe size={18} />;
    return <span>{item.icon || "◎"}</span>;
  };

  const topPluginRibbonItems = ribbonItems
    .filter(
      (item) =>
        item.section === "top" &&
        isRibbonItemEnabled(item.pluginId, item.itemId, item.defaultEnabled ?? true),
    )
    .sort((a, b) => a.order - b.order);

  const bottomPluginRibbonItems = ribbonItems
    .filter(
      (item) =>
        item.section === "bottom" &&
        isRibbonItemEnabled(item.pluginId, item.itemId, item.defaultEnabled ?? true),
    )
    .sort((a, b) => a.order - b.order);

  const updateRibbonState = getRibbonUpdateState({
    availableUpdate,
    hasUnreadUpdate,
    installPhase: installTelemetry.phase,
    installVersion: installTelemetry.version,
    currentVersion,
    isChecking,
  });
  const updatesSupported = isTauriAvailable();
  const updateTitleDetail =
    updateRibbonState === "ready"
      ? t.updateChecker.descReady
      : updateRibbonState === "in-progress"
        ? installTelemetry.phase === "verifying"
          ? t.updateChecker.descVerifying
          : installTelemetry.phase === "installing"
            ? t.updateChecker.descInstalling
            : t.updateChecker.descDownloading
        : updateRibbonState === "available"
          ? availableUpdate
            ? t.updateChecker.descAvailable.replace("{version}", availableUpdate.version)
            : t.updateChecker.descIdle
          : updateRibbonState === "cancelled"
            ? t.updateChecker.descCancelled
          : updateRibbonState === "error"
            ? t.updateChecker.descError
            : updateRibbonState === "checking"
              ? t.ribbon.softwareUpdateChecking
              : updatesSupported
                ? t.updateChecker.descIdle
                : t.updateChecker.descUnsupported;
  const updateTitle = `${t.updateChecker.title} · ${updateTitleDetail}`;
  const updateButtonClassName = cn(
    "relative w-8 h-8 ui-icon-btn",
    updateRibbonState === "available" && "text-primary border border-primary/25 bg-primary/10 hover:bg-primary/15",
    updateRibbonState === "in-progress" && "text-primary border border-primary/30 bg-primary/10 hover:bg-primary/15",
    updateRibbonState === "ready" && "text-green-600 border border-green-500/35 bg-green-500/10 hover:bg-green-500/15 hover:text-green-700",
    updateRibbonState === "cancelled" && "text-amber-600 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15",
    updateRibbonState === "error" && "text-amber-600 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15",
  );
  const showUpdateDot = updateRibbonState === "available" || updateRibbonState === "ready";
  const updateDotClassName = updateRibbonState === "ready" ? "bg-green-600" : "bg-primary";

  const renderUpdateIcon = () => {
    if (updateRibbonState === "available") return <Download size={18} />;
    if (updateRibbonState === "in-progress") return <Loader2 size={18} className="animate-spin" />;
    if (updateRibbonState === "ready") return <RotateCcw size={18} />;
    if (updateRibbonState === "cancelled") return <AlertCircle size={18} />;
    if (updateRibbonState === "error") return <AlertCircle size={18} />;
    return <RefreshCw size={18} className={updateRibbonState === "checking" ? "animate-spin" : ""} />;
  };

  return (
    <div className="w-11 h-full bg-background/55 backdrop-blur-md border-r border-border/60 shadow-[inset_-1px_0_0_hsl(var(--border)/0.6)] flex flex-col items-center py-2 gap-0.5">
      {/* Top icons */}
      <div className="flex flex-col items-center gap-0.5">
        {/* Search */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-global-search"))}
          className="w-8 h-8 ui-icon-btn"
          title={t.ribbon.globalSearch}
        >
          <Search size={18} />
        </button>

        {/* AI Chat - Main View */}
        <button
          onClick={() => {
            openAIMainTab();
            setRightPanelTab("outline");
          }}
          className={cn(
            "w-8 h-8 ui-icon-btn",
            activeSection === "ai"
              ? "bg-primary/12 text-primary border border-primary/25 hover:bg-primary/18"
              : ""
          )}
          title={t.ribbon.aiChatMain}
        >
          <Bot size={18} />
        </button>

        {/* Files/Editor */}
        <button
          onClick={handleSwitchToFiles}
          className={cn(
            "w-8 h-8 ui-icon-btn",
            activeSection === "file"
              ? "bg-primary/12 text-primary border border-primary/25 hover:bg-primary/18"
              : ""
          )}
          title={t.ribbon.fileEditor}
        >
          <FileText size={18} />
        </button>

        {/* Card Flow */}
        <button
          onClick={openCardFlowTab}
          className={cn(
            "w-8 h-8 ui-icon-btn",
            activeSection === "cardflow"
              ? "bg-primary/12 text-primary border border-primary/25 hover:bg-primary/18"
              : ""
          )}
          title={t.ribbon.cardView}
        >
          <LayoutGrid size={18} />
        </button>

        {/* Graph */}
        <button
          onClick={openGraphTab}
          className={cn(
            "w-8 h-8 ui-icon-btn",
            activeSection === "graph"
              ? "bg-primary/12 text-primary border border-primary/25 hover:bg-primary/18"
              : ""
          )}
          title={t.graph.title}
        >
          <Network size={18} />
        </button>

        {/* Database */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-create-database"))}
          className={cn(
            "w-8 h-8 ui-icon-btn",
            activeSection === "database"
              ? "bg-primary/12 text-primary border border-primary/25 hover:bg-primary/18"
              : ""
          )}
          title={t.ribbon.database}
        >
          <Database size={18} />
        </button>

        {/* Flashcard */}
        <button
          onClick={() => openFlashcardTab()}
          className={cn(
            "w-8 h-8 ui-icon-btn",
            activeSection === "flashcard"
              ? "bg-primary/12 text-primary border border-primary/25 hover:bg-primary/18"
              : ""
          )}
          title={t.ribbon.flashcardReview}
        >
          <Brain size={18} />
        </button>

        {/* Plugins */}
        <button
          onClick={() => setShowPlugins(true)}
          className="w-8 h-8 ui-icon-btn"
          title={t.ribbon.plugins}
        >
          <Puzzle size={18} />
        </button>

        {topPluginRibbonItems.map((item) => (
            <button
              key={`${item.pluginId}:${item.itemId}`}
              onClick={() => item.run()}
              className={cn(
                "w-8 h-8 ui-icon-btn text-xs",
                isPluginRibbonItemActive(item)
                  ? "bg-primary/12 text-primary border border-primary/25 hover:bg-primary/18"
                  : ""
              )}
              title={item.title}
            >
              {renderPluginRibbonIcon(item)}
            </button>
          ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom icons */}
      <div className="flex flex-col items-center gap-0.5">
        <button
          onClick={handleOpenUpdateModal}
          className={updateButtonClassName}
          title={updateTitle}
          aria-label={updateTitle}
        >
          {renderUpdateIcon()}
          {showUpdateDot && (
            <span
              aria-hidden="true"
              className={cn("absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full", updateDotClassName)}
            />
          )}
        </button>

        {/* Star on GitHub */}
        <button
          onClick={() => {
            void handleOpenRepository();
          }}
          className="w-8 h-8 ui-icon-btn"
          title={t.ribbon.starProject}
          aria-label={t.ribbon.starProject}
        >
          <Star size={18} />
        </button>

        {bottomPluginRibbonItems.map((item) => (
            <button
              key={`${item.pluginId}:${item.itemId}`}
              onClick={() => item.run()}
              className={cn(
                "w-8 h-8 ui-icon-btn text-xs",
                isPluginRibbonItemActive(item)
                  ? "bg-primary/12 text-primary border border-primary/25 hover:bg-primary/18"
                  : ""
              )}
              title={item.title}
            >
              {renderPluginRibbonIcon(item)}
            </button>
          ))}

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-8 h-8 ui-icon-btn"
          title={isDarkMode ? t.ribbon.switchToLight : t.ribbon.switchToDark}
        >
          {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Settings */}
        <button
          onClick={handleOpenSettings}
          className="w-8 h-8 ui-icon-btn"
          title={t.ribbon.settings}
        >
          <Settings size={18} />
        </button>
      </div>

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={showSettings} 
        onClose={closeSettings} 
        onOpenUpdateModal={handleOpenUpdateFromSettings}
      />
      <UpdateModal isOpen={showUpdateModal} onClose={closeUpdateModal} />
      <InstalledPluginsModal isOpen={showPlugins} onClose={closePlugins} />
    </div>
  );
}
