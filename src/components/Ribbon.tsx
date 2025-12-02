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
  } = useFileStore();

  // 当前激活的标签
  const activeTab = activeTabIndex >= 0 ? tabs[activeTabIndex] : null;

  // 归一化当前主视图所属的功能区，方便扩展
  type RibbonSection = "ai" | "file" | "graph" | "video" | "database" | "none";

  let activeSection: RibbonSection = "none";
  if (activeTab?.type === "ai-chat") {
    activeSection = "ai";
  } else if (activeTab?.type === "graph" || activeTab?.type === "isolated-graph") {
    activeSection = "graph";
  } else if (activeTab?.type === "video-note") {
    activeSection = "video";
  } else if (activeTab?.type === "database") {
    activeSection = "database";
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
    <div className="w-12 h-full bg-muted/30 border-r border-border flex flex-col items-center py-2 gap-1">
      {/* Top icons */}
      <div className="flex flex-col items-center gap-1">
        {/* Search */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-global-search"))}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          title="全局搜索 (Ctrl+Shift+F)"
        >
          <Search size={20} />
        </button>

        {/* AI Chat - Main View */}
        <button
          onClick={() => {
            openAIMainTab();
            setRightPanelTab("outline");
          }}
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center transition-all",
            activeSection === "ai"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
          title="AI 聊天（主视图）"
        >
          <Bot size={20} />
        </button>

        {/* Files/Editor */}
        <button
          onClick={handleSwitchToFiles}
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center transition-all",
            activeSection === "file"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
          title="文件编辑器"
        >
          <FileText size={20} />
        </button>

        {/* Graph */}
        <button
          onClick={openGraphTab}
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center transition-all",
            activeSection === "graph"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
          title="关系图谱"
        >
          <Network size={20} />
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
            "w-9 h-9 rounded-lg flex items-center justify-center transition-all",
            activeSection === "video"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
          title="视频笔记"
        >
          <Video size={20} />
        </button>

        {/* Database */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-create-database"))}
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center transition-all",
            activeSection === "database"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
          title="数据库"
        >
          <Database size={20} />
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom icons */}
      <div className="flex flex-col items-center gap-1">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          title={isDarkMode ? "切换到亮色模式" : "切换到暗色模式"}
        >
          {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {/* Settings */}
        <button
          onClick={() => setShowSettings(true)}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          title="设置"
        >
          <Settings size={20} />
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