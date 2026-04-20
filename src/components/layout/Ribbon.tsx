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
  Bot,
  Images,
  Star,
  Download,
  Loader2,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { openExternal } from "@/lib/host";

import { cn } from "@/lib/utils";
import { exists, isTauriAvailable } from "@/lib/host";
import { SettingsModal } from "./SettingsModal";
import { UpdateModal } from "./UpdateModal";
import {
  type PluginRibbonItem,
  usePluginUiStore,
} from "@/stores/usePluginUiStore";
import { InstalledPluginsModal } from "@/components/plugins/InstalledPluginsModal";
import { useUpdateStore } from "@/stores/useUpdateStore";
import { getRibbonUpdateState } from "./ribbonUpdateState";

interface RibbonProps {
  showMacTrafficLightSafeArea?: boolean;
  flushTopSpacing?: boolean;
}

export function Ribbon({
  showMacTrafficLightSafeArea = false,
  flushTopSpacing = false,
}: RibbonProps) {
  const REPO_URL = "https://github.com/blueberrycongee/Lumina-Note";
  const [showSettings, setShowSettings] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showPlugins, setShowPlugins] = useState(false);
  const closeSettings = useCallback(() => setShowSettings(false), []);
  const closeUpdateModal = useCallback(() => setShowUpdateModal(false), []);
  const closePlugins = useCallback(() => setShowPlugins(false), []);
  const { t } = useLocaleStore();
  const { isDarkMode, toggleTheme, setRightPanelTab } = useUIStore();
  const isRibbonItemEnabled = usePluginStore(
    (state) => state.isRibbonItemEnabled,
  );
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
    openImageManagerTab,
  } = useFileStore();
  const ribbonItems = usePluginUiStore((state) => state.ribbonItems);
  const {
    availableUpdate,
    hasUnreadUpdate,
    installTelemetry,
    currentVersion,
    isChecking,
  } = useUpdateStore(
    useShallow((state) => ({
      availableUpdate: state.availableUpdate,
      hasUnreadUpdate: state.hasUnreadUpdate,
      installTelemetry: state.installTelemetry,
      currentVersion: state.currentVersion,
      isChecking: state.isChecking,
    })),
  );
  const imageManagerTitle =
    (t.ribbon as typeof t.ribbon & { imageManager?: string }).imageManager ??
    "Image Manager";

  // 当前激活的标签
  const activeTab = activeTabIndex >= 0 ? tabs[activeTabIndex] : null;

  // 归一化当前主视图所属的功能区，方便扩展
  type RibbonSection = "ai" | "file" | "graph" | "image-manager" | "none";

  let activeSection: RibbonSection = "none";
  if (activeTab?.type === "ai-chat") {
    activeSection = "ai";
  } else if (
    activeTab?.type === "graph" ||
    activeTab?.type === "isolated-graph"
  ) {
    activeSection = "graph";
  } else if (activeTab?.type === "image-manager") {
    activeSection = "image-manager";
  } else if (activeTab?.type === "file" || currentFile) {
    // 没有特殊类型时，只要在编辑文件，就认为是文件编辑区
    activeSection = "file";
  }

  // Find first file tab to switch to
  const handleSwitchToFiles = async () => {
    const fileTabIndex = tabs.findIndex((tab) => tab.type === "file");
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
      return (
        Array.isArray(item.activeWhenTabTypes) &&
        item.activeWhenTabTypes.includes(activeTab.type)
      );
    },
    [activeTab?.type],
  );

  const renderPluginRibbonIcon = (item: PluginRibbonItem) => {
    return <span>{item.icon || "◎"}</span>;
  };

  const topPluginRibbonItems = ribbonItems
    .filter(
      (item) =>
        item.section === "top" &&
        isRibbonItemEnabled(
          item.pluginId,
          item.itemId,
          item.defaultEnabled ?? true,
        ),
    )
    .sort((a, b) => a.order - b.order);

  const bottomPluginRibbonItems = ribbonItems
    .filter(
      (item) =>
        item.section === "bottom" &&
        isRibbonItemEnabled(
          item.pluginId,
          item.itemId,
          item.defaultEnabled ?? true,
        ),
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
            ? t.updateChecker.descAvailable.replace(
                "{version}",
                availableUpdate.version,
              )
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
    updateRibbonState === "available" && "text-primary",
    updateRibbonState === "in-progress" && "text-primary",
    updateRibbonState === "ready" && "text-success",
    updateRibbonState === "cancelled" && "text-warning",
    updateRibbonState === "error" && "text-warning",
  );
  const showUpdateDot =
    updateRibbonState === "available" || updateRibbonState === "ready";
  const updateDotClassName =
    updateRibbonState === "ready" ? "bg-success" : "bg-primary";

  const renderUpdateIcon = () => {
    if (updateRibbonState === "available") return <Download size={18} />;
    if (updateRibbonState === "in-progress")
      return <Loader2 size={18} className="animate-spin" />;
    if (updateRibbonState === "ready") return <RotateCcw size={18} />;
    if (updateRibbonState === "cancelled") return <AlertCircle size={18} />;
    if (updateRibbonState === "error") return <AlertCircle size={18} />;
    return (
      <RefreshCw
        size={18}
        className={updateRibbonState === "checking" ? "animate-spin" : ""}
      />
    );
  };

  return (
    <div
      className={cn(
        "w-11 h-full bg-background flex flex-col items-center",
      )}
    >
      {showMacTrafficLightSafeArea ? (
        <div
          className="h-11 w-full shrink-0 border-b border-border"
          data-tauri-drag-region
          data-testid="mac-ribbon-traffic-lights-safe-area"
        />
      ) : null}
      <div
        data-testid="ribbon-content"
        className={cn(
          "w-full min-h-0 flex-1 border-r border-border flex flex-col items-center pb-2 gap-0.5",
          showMacTrafficLightSafeArea || flushTopSpacing ? "pt-0" : "pt-2",
        )}
      >
        {/* Top icons */}
        <div className="flex flex-col items-center gap-0.5">
          {/* Search */}
          <button
            onClick={() =>
              window.dispatchEvent(new CustomEvent("open-global-search"))
            }
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
                ? "bg-primary/10 text-primary"
                : "",
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
                ? "bg-primary/10 text-primary"
                : "",
            )}
            title={t.ribbon.fileEditor}
          >
            <FileText size={18} />
          </button>

          <button
            onClick={openImageManagerTab}
            className={cn(
              "w-8 h-8 ui-icon-btn",
              activeSection === "image-manager"
                ? "bg-primary/10 text-primary"
                : "",
            )}
            title={imageManagerTitle}
          >
            <Images size={18} />
          </button>

          {/* Graph */}
          <button
            onClick={openGraphTab}
            className={cn(
              "w-8 h-8 ui-icon-btn",
              activeSection === "graph"
                ? "bg-primary/10 text-primary"
                : "",
            )}
            title={t.graph.title}
          >
            <Network size={18} />
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
                  ? "bg-primary/10 text-primary"
                  : "",
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
                className={cn(
                  "absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full",
                  updateDotClassName,
                )}
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
                  ? "bg-primary/10 text-primary"
                  : "",
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
