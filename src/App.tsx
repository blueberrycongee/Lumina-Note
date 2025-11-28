import { useEffect, useCallback, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Sidebar } from "@/components/Sidebar";
import { RightPanel } from "@/components/RightPanel";
import { ResizeHandle } from "@/components/ResizeHandle";
import { Ribbon } from "@/components/Ribbon";
import { KnowledgeGraph } from "@/components/KnowledgeGraph";
import { Editor } from "@/editor/Editor";
import { SplitEditor } from "@/components/SplitEditor";
import { useFileStore } from "@/stores/useFileStore";
import { useUIStore } from "@/stores/useUIStore";
import { useNoteIndexStore } from "@/stores/useNoteIndexStore";
import { useRAGStore } from "@/stores/useRAGStore";
import { FolderOpen, Sparkles } from "lucide-react";
import { CommandPalette, PaletteMode } from "@/components/CommandPalette";
import { GlobalSearch } from "@/components/GlobalSearch";
import { TabBar } from "@/components/TabBar";
import { DiffView } from "@/components/DiffView";
import { useAIStore } from "@/stores/useAIStore";
import { saveFile } from "@/lib/tauri";

// Component that shows tabs + graph/editor content
function EditorWithGraph() {
  const { tabs, activeTabIndex } = useFileStore();
  const activeTab = activeTabIndex >= 0 ? tabs[activeTabIndex] : null;
  
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background transition-colors duration-300">
      <TabBar />
      {activeTab?.type === "graph" ? (
        <KnowledgeGraph className="flex-1" />
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
  const { pendingDiff, setPendingDiff, clearPendingEdits } = useAIStore();
  const { updateContent, currentFile } = useFileStore();
  
  const handleAccept = useCallback(async () => {
    if (!pendingDiff) return;
    
    try {
      // Update content in editor (with undo support)
      if (currentFile === pendingDiff.filePath) {
        updateContent(pendingDiff.modified, "ai", pendingDiff.description);
      }
      
      // Save to file
      await saveFile(pendingDiff.filePath, pendingDiff.modified);
      
      // Clear the diff and pending edits
      clearPendingEdits();
      
      console.log(`✅ 已应用修改到 ${pendingDiff.fileName}`);
    } catch (error) {
      console.error("Failed to apply edit:", error);
      alert(`❌ 应用修改失败: ${error}`);
    }
  }, [pendingDiff, currentFile, updateContent, clearPendingEdits]);
  
  const handleReject = useCallback(() => {
    setPendingDiff(null);
    // Also clear pending edits so AI doesn't get confused
    clearPendingEdits();
  }, [setPendingDiff, clearPendingEdits]);
  
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
  const { vaultPath, setVaultPath, currentFile, save, createNewFile, tabs, activeTabIndex, fileTree } = useFileStore();
  const { pendingDiff } = useAIStore();
  const { buildIndex } = useNoteIndexStore();
  const { initialize: initializeRAG, config: ragConfig } = useRAGStore();
  
  // Get active tab
  const activeTab = activeTabIndex >= 0 ? tabs[activeTabIndex] : null;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("command");
  const [searchOpen, setSearchOpen] = useState(false);
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
    window.addEventListener("open-vault", onOpenVault);
    window.addEventListener("open-global-search", onOpenSearch);
    return () => {
      window.removeEventListener("open-vault", onOpenVault);
      window.removeEventListener("open-global-search", onOpenSearch);
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
      <div className="h-full flex items-center justify-center bg-background">
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
    );
  }

  return (
    <>
    <div className="h-full flex bg-background transition-colors duration-300">
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

      {/* Left Resize Handle */}
      {leftSidebarOpen && (
        <ResizeHandle
          direction="left"
          onResize={handleLeftResize}
          onDoubleClick={toggleLeftSidebar}
        />
      )}

      {/* Main content - switches between Editor, Graph, Split, and Diff based on state */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {pendingDiff ? (
          // Show diff view when there's a pending AI edit
          <DiffViewWrapper />
        ) : splitView && currentFile ? (
          // Show split editor when enabled
          <SplitEditor />
        ) : activeTab?.type === "graph" ? (
          <EditorWithGraph />
        ) : currentFile ? (
          <Editor />
        ) : tabs.length > 0 ? (
          <EditorWithGraph />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2">
              <p className="text-lg">从侧边栏选择一个笔记开始编辑</p>
              <p className="text-sm opacity-70">或按 Ctrl+N 创建新笔记</p>
            </div>
          </div>
        )}
      </main>

      {/* Right Resize Handle */}
      {rightSidebarOpen && (
        <ResizeHandle
          direction="right"
          onResize={handleRightResize}
          onDoubleClick={toggleRightSidebar}
        />
      )}

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
  </>);
}

export default App;
