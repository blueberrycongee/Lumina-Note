import { useEffect, useCallback, useState } from "react";
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
import { FolderOpen, Sparkles, PanelLeftClose, PanelRightClose, PanelLeft, PanelRight } from "lucide-react";
import { CommandPalette, PaletteMode } from "@/components/search/CommandPalette";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { TabBar } from "@/components/layout/TabBar";
import { DiffView } from "@/components/effects/DiffView";
import { AIFloatingBall } from "@/components/ai/AIFloatingBall";
import { VideoNoteView } from "@/components/video/VideoNoteView";
import { DatabaseView, CreateDatabaseDialog, DatabaseSplitView } from "@/components/database";
import { PDFViewer } from "@/components/pdf";
import { BrowserView } from "@/components/browser";
import { useAIStore } from "@/stores/useAIStore";
import { saveFile } from "@/lib/tauri";
import { TitleBar } from "@/components/layout/TitleBar";
import { VoiceInputBall } from "@/components/ai/VoiceInputBall";
import { enableDebugLogger } from "@/lib/debugLogger";

// 启用调试日志收集（开发模式下）
if (import.meta.env.DEV) {
  enableDebugLogger();
}

// Component that shows tabs + graph/editor content
function EditorWithGraph() {
  const { tabs, activeTabIndex } = useFileStore();
  const activeTab = activeTabIndex >= 0 ? tabs[activeTabIndex] : null;
  
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background transition-colors duration-300">
      <TabBar />
      {activeTab?.type === "graph" ? (
        <KnowledgeGraph className="flex-1" />
      ) : activeTab?.type === "isolated-graph" && activeTab.isolatedNode ? (
        <KnowledgeGraph className="flex-1" isolatedNode={activeTab.isolatedNode} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center space-y-2">
            <p className="text-lg">从侧边栏选择一个笔记开始编辑</p>
            <p className="text-sm opacity-70">或按 Ctrl+N 创建新笔记</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Component that shows diff view
function DiffViewWrapper() {
  const { pendingDiff, setPendingDiff, clearPendingEdits, diffResolver } = useAIStore();
  const { openFile } = useFileStore();
  
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
      alert(`❌ 应用修改失败: ${error}`);
    }
  }, [pendingDiff, clearPendingEdits, openFile, diffResolver]);
  
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

function App() {
  const { vaultPath, setVaultPath, currentFile, save, createNewFile, tabs, activeTabIndex, fileTree, refreshFileTree, openAIMainTab } = useFileStore();
  const { pendingDiff } = useAIStore();
  const { buildIndex } = useNoteIndexStore();
  const { initialize: initializeRAG, config: ragConfig } = useRAGStore();
  
  // Get active tab
  const activeTab = activeTabIndex >= 0 ? tabs[activeTabIndex] : null;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("command");
  const [searchOpen, setSearchOpen] = useState(false);
  const [isLoadingVault, setIsLoadingVault] = useState(false);
  const [createDbOpen, setCreateDbOpen] = useState(false);
  
  // 首次启动时默认打开 AI Chat
  useEffect(() => {
    if (tabs.length === 0) {
      openAIMainTab();
    }
  }, []);
  
  // 启动时自动加载保存的工作空间
  useEffect(() => {
    if (vaultPath && fileTree.length === 0 && !isLoadingVault) {
      setIsLoadingVault(true);
      refreshFileTree().finally(() => setIsLoadingVault(false));
    }
  }, []);
  
  // 启动文件监听器，自动刷新文件树
  useEffect(() => {
    if (!vaultPath) return;
    
    let unlisten: (() => void) | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    
    const setupWatcher = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const { startFileWatcher } = await import("@/lib/tauri");
        
        // 启动后端文件监听
        await startFileWatcher(vaultPath);
        console.log("[FileWatcher] Started watching:", vaultPath);
        
        // 监听文件变化事件（带防抖）
        unlisten = await listen("fs:change", (event) => {
          console.log("[FileWatcher] File changed:", event.payload);
          
          // 防抖：500ms 内多次变化只刷新一次
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            refreshFileTree();
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
  const {
    leftSidebarOpen,
    rightSidebarOpen,
    leftSidebarWidth,
    rightSidebarWidth,
    setLeftSidebarWidth,
    setRightSidebarWidth,
    toggleLeftSidebar,
    toggleRightSidebar,
    splitView,
  } = useUIStore();

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
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [save, vaultPath, createNewFile]);

  // Open folder dialog
  const handleOpenVault = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择笔记文件夹",
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
  const handleLeftResize = useCallback(
    (delta: number) => {
      setLeftSidebarWidth(leftSidebarWidth + delta);
    },
    [leftSidebarWidth, setLeftSidebarWidth]
  );

  const handleRightResize = useCallback(
    (delta: number) => {
      setRightSidebarWidth(rightSidebarWidth + delta);
    },
    [rightSidebarWidth, setRightSidebarWidth]
  );

  // Welcome screen when no vault is open
  if (!vaultPath) {
    return (
      <div className="h-full flex flex-col bg-background">
        <TitleBar />
        <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-8">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-lg">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              Lumina Note
            </h1>
          </div>

          <p className="text-muted-foreground text-lg">
            本地优先的 AI 驱动笔记应用
          </p>

          <button
            onClick={handleOpenVault}
            className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-all font-medium shadow-lg hover:shadow-xl hover:scale-105"
          >
            <FolderOpen className="w-5 h-5" />
            打开笔记文件夹
          </button>

          <p className="text-sm text-muted-foreground">
            选择一个包含 Markdown 笔记的文件夹
          </p>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <TitleBar />
      <div className="flex-1 flex overflow-hidden transition-colors duration-300">
        {/* Left Ribbon (Icon Bar) */}
        <Ribbon />

      {/* Left Sidebar (File Tree) */}
      <div
        className={`flex-shrink-0 transition-all duration-300 ease-out overflow-hidden ${
          leftSidebarOpen ? "opacity-100" : "w-0 opacity-0"
        }`}
        style={{ width: leftSidebarOpen ? leftSidebarWidth : 0 }}
      >
        <Sidebar />
      </div>

      {/* Left Resize Handle + Collapse Button */}
      <div className="relative flex-shrink-0 h-full">
        {leftSidebarOpen && (
          <ResizeHandle
            direction="left"
            onResize={handleLeftResize}
            onDoubleClick={toggleLeftSidebar}
          />
        )}
        {/* Left Collapse Button */}
        <button
          onClick={toggleLeftSidebar}
          className={`absolute top-1/2 -translate-y-1/2 z-10 p-1 rounded-md bg-muted/80 hover:bg-accent border border-border shadow-sm transition-all ${
            leftSidebarOpen ? "left-0 -translate-x-1/2" : "left-1"
          }`}
          title={leftSidebarOpen ? "收起左侧栏" : "展开左侧栏"}
        >
          {leftSidebarOpen ? (
            <PanelLeftClose className="w-4 h-4 text-muted-foreground" />
          ) : (
            <PanelLeft className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Main content - switches between Editor, Graph, Split, Diff, VideoNote and AI Chat based on state */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {pendingDiff ? (
          // Show diff view when there's a pending AI edit
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
      <div className="relative flex-shrink-0 h-full">
        {rightSidebarOpen && (
          <ResizeHandle
            direction="right"
            onResize={handleRightResize}
            onDoubleClick={toggleRightSidebar}
          />
        )}
        {/* Right Collapse Button */}
        <button
          onClick={toggleRightSidebar}
          className={`absolute top-1/2 -translate-y-1/2 z-10 p-1 rounded-md bg-muted/80 hover:bg-accent border border-border shadow-sm transition-all ${
            rightSidebarOpen ? "right-0 translate-x-1/2" : "right-1"
          }`}
          title={rightSidebarOpen ? "收起右侧栏" : "展开右侧栏"}
        >
          {rightSidebarOpen ? (
            <PanelRightClose className="w-4 h-4 text-muted-foreground" />
          ) : (
            <PanelRight className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Right Sidebar */}
      <div
        className={`flex-shrink-0 transition-all duration-300 ease-out overflow-hidden ${
          rightSidebarOpen ? "opacity-100" : "w-0 opacity-0"
        }`}
        style={{ width: rightSidebarOpen ? rightSidebarWidth : 0 }}
      >
        <RightPanel />
      </div>
    </div>
    
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
    
    {/* AI Floating Ball */}
    <AIFloatingBall />

    {/* Voice Input Floating Ball - 语音输入悬浮球 */}
    <VoiceInputBall />
    </div>
  );
}

export default App;
