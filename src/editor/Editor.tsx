import { useEffect, useMemo, useCallback, useRef } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { useUIStore, EditorMode } from "@/stores/useUIStore";
import { debounce, getFileName } from "@/lib/utils";
import { ReadingView } from "./ReadingView";
import { CodeMirrorEditor, CodeMirrorEditorRef } from "./CodeMirrorEditor";
import { SelectionToolbar } from "@/components/SelectionToolbar";
import { 
  Sidebar, 
  MessageSquare, 
  BookOpen, 
  Eye, 
  Code2,
  ChevronLeft,
  ChevronRight,
  Columns,
} from "lucide-react";
import { TabBar } from "@/components/TabBar";
import { cn } from "@/lib/utils";

const modeConfig: Record<EditorMode, { icon: React.ReactNode; label: string }> = {
  reading: { icon: <BookOpen size={14} />, label: "阅读" },
  live: { icon: <Eye size={14} />, label: "实时" },
  source: { icon: <Code2 size={14} />, label: "源码" },
};

export function Editor() {
  const {
    currentFile,
    currentContent,
    updateContent,
    save,
    isDirty,
    isSaving,
    isLoadingFile,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
  } = useFileStore();
  const { openVideoNoteFromContent } = useFileStore();

  const { 
    toggleLeftSidebar, 
    toggleRightSidebar, 
    editorMode, 
    setEditorMode,
    toggleSplitView,
  } = useUIStore();

  // 滚动位置保持（基于行号）
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const codeMirrorRef = useRef<CodeMirrorEditorRef>(null);
  const scrollLineRef = useRef<number>(1);
  const prevModeRef = useRef<EditorMode>(editorMode);
  const pendingScrollRef = useRef<number | null>(null);

  // 从滚动位置计算行号（用于阅读/源码模式）
  const getLineFromScrollPosition = useCallback((container: HTMLElement): number => {
    const scrollTop = container.scrollTop;
    // 估算每行高度（约 28px）
    const lineHeight = 28;
    const estimatedLine = Math.floor(scrollTop / lineHeight) + 1;
    const lines = currentContent.split('\n').length;
    return Math.min(Math.max(1, estimatedLine), lines);
  }, [currentContent]);

  // 滚动到指定行号
  const scrollToLine = useCallback((container: HTMLElement, line: number) => {
    const lineHeight = 28;
    container.scrollTop = (line - 1) * lineHeight;
  }, []);

  // 保存当前滚动位置（行号）- 在切换前同步调用
  const saveScrollPosition = useCallback(() => {
    // 优先从 CodeMirror 获取（更精确）
    if (codeMirrorRef.current) {
      const line = codeMirrorRef.current.getScrollLine();
      if (line > 0) {
        scrollLineRef.current = line;
        return;
      }
    }
    // 否则从外层容器获取
    if (scrollContainerRef.current) {
      scrollLineRef.current = getLineFromScrollPosition(scrollContainerRef.current);
    }
  }, [getLineFromScrollPosition]);

  // 尝试恢复滚动位置（带重试逻辑）
  const tryRestoreScroll = useCallback((targetLine: number, retries: number = 0) => {
    const maxRetries = 5;
    const delay = 50;

    if (editorMode === 'live') {
      if (codeMirrorRef.current) {
        codeMirrorRef.current.scrollToLine(targetLine);
        pendingScrollRef.current = null;
      } else if (retries < maxRetries) {
        // CodeMirror 还没初始化，稍后重试
        setTimeout(() => tryRestoreScroll(targetLine, retries + 1), delay);
      }
    } else {
      if (scrollContainerRef.current) {
        scrollToLine(scrollContainerRef.current, targetLine);
        pendingScrollRef.current = null;
      } else if (retries < maxRetries) {
        setTimeout(() => tryRestoreScroll(targetLine, retries + 1), delay);
      }
    }
  }, [editorMode, scrollToLine]);

  // 模式切换时恢复滚动位置
  useEffect(() => {
    if (prevModeRef.current !== editorMode && scrollLineRef.current > 1) {
      pendingScrollRef.current = scrollLineRef.current;
      // 等待组件渲染后尝试恢复
      requestAnimationFrame(() => {
        tryRestoreScroll(scrollLineRef.current);
      });
    }
    prevModeRef.current = editorMode;
  }, [editorMode, tryRestoreScroll]);

  // CodeMirror 初始化后检查是否有待处理的滚动
  useEffect(() => {
    if (editorMode === 'live' && pendingScrollRef.current && codeMirrorRef.current) {
      codeMirrorRef.current.scrollToLine(pendingScrollRef.current);
      pendingScrollRef.current = null;
    }
  });

  // 带保存滚动位置的模式切换
  const handleModeChange = useCallback((mode: EditorMode) => {
    saveScrollPosition();
    setEditorMode(mode);
  }, [saveScrollPosition, setEditorMode]);

  // 全局键盘快捷键
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Alt + 左/右箭头: 导航历史
    if (e.altKey && e.key === "ArrowLeft") {
      e.preventDefault();
      goBack();
      return;
    }
    if (e.altKey && e.key === "ArrowRight") {
      e.preventDefault();
      goForward();
      return;
    }
    
    // live 模式使用 CodeMirror 自带的撤销/重做，不拦截
    // 其他模式不需要拦截
  }, [goBack, goForward]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Debounced save (500ms after user stops typing)
  const debouncedSave = useMemo(
    () => debounce(() => save(), 500),
    [save]
  );

  if (isLoadingFile) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  // 打开文件时自动检测是否是视频笔记 Markdown，给出提示
  const isVideoNoteFile = useMemo(() => {
    if (!currentContent) return false;
    // 简单检测 frontmatter 中是否包含 video_bvid 字段
    // 或正文中包含 "# 视频笔记" 标题
    const hasFrontmatterBvid = /---[\s\S]*?video_bvid:\s*BV[\w-]+[\s\S]*?---/.test(currentContent);
    const hasVideoNoteHeading = /# \s*视频笔记/.test(currentContent);
    return hasFrontmatterBvid || hasVideoNoteHeading;
  }, [currentContent]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background transition-colors duration-300">
      {/* Tab Bar */}
      <TabBar />
      
      {/* Top Navigation Bar */}
      <div className="h-10 flex items-center px-4 justify-between select-none border-b border-border shrink-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button
            onClick={toggleLeftSidebar}
            className="p-1 hover:bg-accent rounded transition-colors hover:text-foreground"
            title="切换侧边栏"
          >
            <Sidebar size={16} />
          </button>
          
          {/* Navigation buttons */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={goBack}
              disabled={!canGoBack()}
              className={cn(
                "p-1 rounded transition-colors",
                canGoBack()
                  ? "hover:bg-accent text-muted-foreground hover:text-foreground"
                  : "text-muted-foreground/30 cursor-not-allowed"
              )}
              title="返回 (Alt+←)"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={goForward}
              disabled={!canGoForward()}
              className={cn(
                "p-1 rounded transition-colors",
                canGoForward()
                  ? "hover:bg-accent text-muted-foreground hover:text-foreground"
                  : "text-muted-foreground/30 cursor-not-allowed"
              )}
              title="前进 (Alt+→)"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <span className="text-muted-foreground/50">/</span>
          <span className="text-foreground font-medium">
            {currentFile ? getFileName(currentFile) : "未命名"}
          </span>
          {isDirty && (
            <span className="w-2 h-2 rounded-full bg-orange-400" title="未保存更改" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Undo/Redo: live 模式由 CodeMirror 处理 (Ctrl+Z/Y)，不显示按钮 */}

          {/* Mode Switcher */}
          <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5">
            {(Object.keys(modeConfig) as EditorMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => handleModeChange(mode)}
                className={cn(
                  "mode-switcher-btn flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium",
                  editorMode === mode
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                )}
                title={modeConfig[mode].label}
              >
                {modeConfig[mode].icon}
                <span className="hidden sm:inline">{modeConfig[mode].label}</span>
              </button>
            ))}
          </div>

          <span className="text-xs text-muted-foreground">
            {isSaving ? "保存中..." : isDirty ? "已编辑" : "已保存"}
          </span>
          <button
            onClick={toggleSplitView}
            className="p-1 hover:bg-accent rounded transition-colors text-muted-foreground hover:text-foreground"
            title="分屏编辑"
          >
            <Columns size={16} />
          </button>
          <button
            onClick={toggleRightSidebar}
            className="p-1 hover:bg-accent rounded transition-colors text-muted-foreground hover:text-foreground"
            title="切换 AI 面板"
          >
            <MessageSquare size={16} />
          </button>
        </div>
      </div>

      {/* Editor area - different modes */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto relative">
        {/* Selection Toolbar - Add to Chat */}
        <SelectionToolbar containerRef={scrollContainerRef} />
        
        <div className="max-w-3xl mx-auto px-6 py-4 editor-mode-container">
            {isVideoNoteFile && (
              <div className="mb-3 flex items-center justify-between px-3 py-2 bg-blue-500/5 border border-blue-500/30 rounded-md text-xs text-blue-700 dark:text-blue-300">
                <span>检测到这是一个视频笔记 Markdown，可以在专用的视频笔记视图中查看和编辑。</span>
                <button
                  onClick={() => openVideoNoteFromContent(currentContent, getFileName(currentFile || '视频笔记'))}
                  className="ml-3 px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 text-xs font-medium"
                >
                  以视频笔记方式打开
                </button>
              </div>
            )}
          {editorMode === "reading" && (
            <div key="reading" className="editor-mode-content">
              <ReadingView content={currentContent} />
            </div>
          )}
          
          {editorMode === "live" && (
            <div key="live" className="editor-mode-content h-full">
              <CodeMirrorEditor 
                ref={codeMirrorRef}
                content={currentContent} 
                onChange={(newContent) => {
                  updateContent(newContent);
                  debouncedSave();
                }}
              />
            </div>
          )}
          
          {editorMode === "source" && (
            <div key="source" className="editor-mode-content h-full">
              <CodeMirrorEditor 
                ref={codeMirrorRef}
                content={currentContent} 
                onChange={(newContent) => {
                  updateContent(newContent);
                  debouncedSave();
                }}
                livePreview={false}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
