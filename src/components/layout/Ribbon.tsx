import { useState } from "react";
import { useUIStore } from "@/stores/useUIStore";
import { useFileStore } from "@/stores/useFileStore";
import {
  FileText,
  Network,
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
} from "lucide-react";

import { cn } from "@/lib/utils";
import { exists } from "@/lib/tauri";
import { SettingsModal } from "./SettingsModal";

export function Ribbon() {
  const [showSettings, setShowSettings] = useState(false);
  const { isDarkMode, toggleTheme, setRightPanelTab } = useUIStore();
  const {
    tabs,
    activeTabIndex,
    openGraphTab,
    switchTab,
    openVideoNoteTab,
    recentFiles,
    openFile,
    fileTree,
    openAIMainTab,
    currentFile,
    openWebpageTab,
    openFlashcardTab,
    openCardFlowTab,
  } = useFileStore();

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

  return (
    <div className="w-11 h-full bg-background/55 backdrop-blur-md border-r border-border/60 shadow-[inset_-1px_0_0_hsl(var(--border)/0.6)] flex flex-col items-center py-2 gap-0.5">
      {/* Top icons */}
      <div className="flex flex-col items-center gap-0.5">
        {/* Search */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-global-search"))}
          className="w-8 h-8 ui-icon-btn"
          title="全局搜索 (Ctrl+Shift+F)"
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
          title="AI 聊天（主视图）"
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
          title="文件编辑器"
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
          title="卡片视图"
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
          title="关系图谱"
        >
          <Network size={18} />
        </button>

        {/* Video Note */}
        <button
          onClick={() => {
            const videoTabIndex = tabs.findIndex(t => t.type === "video-note");
            if (videoTabIndex >= 0) {
              switchTab(videoTabIndex);
            } else {
              openVideoNoteTab("", "视频笔记");
            }
          }}
          className={cn(
            "w-8 h-8 ui-icon-btn",
            activeSection === "video"
              ? "bg-primary/12 text-primary border border-primary/25 hover:bg-primary/18"
              : ""
          )}
          title="视频笔记"
        >
          <Video size={18} />
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
          title="数据库"
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
          title="闪卡复习"
        >
          <Brain size={18} />
        </button>

        {/* Browser */}
        <button
          onClick={() => {
            // 查找已有的空网页标签页或创建新的
            const webpageTabIndex = tabs.findIndex(t => t.type === "webpage" && !t.webpageUrl);
            if (webpageTabIndex >= 0) {
              switchTab(webpageTabIndex);
            } else {
              openWebpageTab("", "新标签页");
            }
          }}
          className={cn(
            "w-8 h-8 ui-icon-btn",
            activeSection === "browser"
              ? "bg-primary/12 text-primary border border-primary/25 hover:bg-primary/18"
              : ""
          )}
          title="浏览器"
        >
          <Globe size={18} />
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom icons */}
      <div className="flex flex-col items-center gap-0.5">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-8 h-8 ui-icon-btn"
          title={isDarkMode ? "切换到亮色模式" : "切换到暗色模式"}
        >
          {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Settings */}
        <button
          onClick={() => setShowSettings(true)}
          className="w-8 h-8 ui-icon-btn"
          title="设置"
        >
          <Settings size={18} />
        </button>
      </div>

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)} 
      />
    </div>
  );
}
