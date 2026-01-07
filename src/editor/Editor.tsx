import { useEffect, useMemo, useCallback, useRef, useState } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { useUIStore, EditorMode } from "@/stores/useUIStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useAIStore } from "@/stores/useAIStore";
import { useRustAgentStore } from "@/stores/useRustAgentStore";
import { MainAIChatShell } from "@/components/layout/MainAIChatShell";
import { LocalGraph } from "@/components/effects/LocalGraph";
import { debounce, getFileName } from "@/lib/utils";
import { CodeMirrorEditor, CodeMirrorEditorRef, ViewMode } from "./CodeMirrorEditor";
import { SelectionToolbar } from "@/components/toolbar/SelectionToolbar";
import { SelectionContextMenu } from "@/components/toolbar/SelectionContextMenu";
import {
  Sidebar,
  MessageSquare,
  BookOpen,
  Eye,
  Code2,
  ChevronLeft,
  ChevronRight,
  Columns,
  Download,
  Network,
  X,
} from "lucide-react";
import { exportToPdf, getExportFileName } from "@/services/pdf/exportPdf";
import { TabBar } from "@/components/layout/TabBar";
import { cn } from "@/lib/utils";

const modeIcons: Record<EditorMode, React.ReactNode> = {
  reading: <BookOpen size={14} />,
  live: <Eye size={14} />,
  source: <Code2 size={14} />,
};

// 局部图谱展开状态（组件外部以保持状态）
let localGraphExpandedState = true;

export function Editor() {
  const { t } = useLocaleStore();

  const modeLabels: Record<EditorMode, string> = {
    reading: t.editor.reading,
    live: t.editor.live,
    source: t.editor.source,
  };

  const {
    tabs,
    activeTabIndex,
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
    undo,
    redo,
    canUndo,
    canRedo,
  } = useFileStore();
  const { openVideoNoteFromContent } = useFileStore();

  const {
    toggleLeftSidebar,
    toggleRightSidebar,
    editorMode,
    setEditorMode,
    toggleSplitView,
    chatMode,
  } = useUIStore();

  // 获取当前会话标题
  const { sessions: chatSessions, currentSessionId: chatSessionId } = useAIStore();
  const { sessions: agentSessions, currentSessionId: agentSessionId } = useRustAgentStore();

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

  const activeTab = activeTabIndex >= 0 ? tabs[activeTabIndex] : null;

  // 局部图谱展开/收起状态
  const [localGraphExpanded, setLocalGraphExpanded] = useState(localGraphExpandedState);
  const toggleLocalGraph = useCallback(() => {
    setLocalGraphExpanded(prev => {
      localGraphExpandedState = !prev;
      return !prev;
    });
  }, []);

  // 当前会话标题（AI 聊天页使用）
  const currentSessionTitle = useMemo(() => {
    if (activeTab?.type !== "ai-chat") return null;
    const sessions = chatMode === "agent" ? agentSessions : chatSessions;
    const sessionId = chatMode === "agent" ? agentSessionId : chatSessionId;
    const session = sessions.find(s => s.id === sessionId);
    return session?.title || t.common.newConversation;
  }, [activeTab?.type, chatMode, agentSessions, chatSessions, agentSessionId, chatSessionId]);

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
    const isMod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const active = document.activeElement as HTMLElement | null;
    const inCodeMirror = !!active?.closest('.cm-editor');
    const inTextInput =
      active &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.isContentEditable);

    // Ctrl+Z: 撤销（仅当不在其他输入框中时生效）
    if (isMod && key === 'z') {
      // 让 CodeMirror 自己处理：live 模式且焦点在编辑器内
      if (editorMode === 'live' && inCodeMirror) return;
      // 其他输入框（如 Chat 文本框）使用浏览器/组件自己的撤销
      if (!inCodeMirror && inTextInput) return;

      if (canUndo()) {
        e.preventDefault();
        undo();
      }
      return;
    }

    // Ctrl+Y 或 Ctrl+Shift+Z: 重做
    if (
      isMod &&
      (key === 'y' || (key === 'z' && e.shiftKey))
    ) {
      if (editorMode === 'live' && inCodeMirror) return;
      if (!inCodeMirror && inTextInput) return;

      if (canRedo()) {
        e.preventDefault();
        redo();
      }
      return;
    }

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
  }, [editorMode, undo, redo, canUndo, canRedo, goBack, goForward]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Debounced save (1000ms after user stops typing, matching VS Code default)
  const debouncedSave = useMemo(
    () => debounce(() => save(), 1000),
    [save]
  );

  // Save on window blur (when user switches to another app)
  useEffect(() => {
    const handleBlur = () => {
      if (isDirty && activeTab?.type !== 'ai-chat') {
        save();
      }
    };
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [isDirty, save, activeTab?.type]);

  // 打开文件时自动检测是否是视频笔记 Markdown，给出提示
  // 注意：必须在 early return 之前，否则违反 React Hooks 规则
  const isVideoNoteFile = useMemo(() => {
    if (!currentContent) return false;
    // 简单检测 frontmatter 中是否包含 video_bvid 字段
    // 或正文中包含 "# 视频笔记" 标题
    const hasFrontmatterBvid = /---[\s\S]*?video_bvid:\s*BV[\w-]+[\s\S]*?---/.test(currentContent);
    const hasVideoNoteHeading = /# \s*视频笔记/.test(currentContent);
    return hasFrontmatterBvid || hasVideoNoteHeading;
  }, [currentContent]);

  if (isLoadingFile) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-muted-foreground">{t.common.loading}</div>
      </div>
    );
  }

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
            title={t.sidebar.toggleSidebar}
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
              title={t.editor.goBackShortcut}
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
              title={t.editor.goForwardShortcut}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <span className="text-muted-foreground/50">/</span>
          <span className="text-foreground font-medium">
            {activeTab?.type === "ai-chat"
              ? currentSessionTitle
              : (currentFile ? getFileName(currentFile) : t.common.untitled)}
          </span>
          {isDirty && activeTab?.type !== "ai-chat" && (
            <span className="w-2 h-2 rounded-full bg-orange-400" title={t.common.unsavedChanges} />
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* 只在非 AI 聊天页显示编辑器工具栏 */}
          {activeTab?.type !== "ai-chat" && (
            <>
              {/* Mode Switcher */}
              <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5">
                {(Object.keys(modeLabels) as EditorMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => handleModeChange(mode)}
                    className={cn(
                      "mode-switcher-btn flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium",
                      editorMode === mode
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                    )}
                    title={modeLabels[mode]}
                  >
                    {modeIcons[mode]}
                    <span className="hidden sm:inline">{modeLabels[mode]}</span>
                  </button>
                ))}
              </div>

              <span className="text-xs text-muted-foreground">
                {isSaving ? t.editor.saving : isDirty ? t.editor.edited : t.common.saved}
              </span>
              <button
                onClick={toggleSplitView}
                className="p-1 hover:bg-accent rounded transition-colors text-muted-foreground hover:text-foreground"
                title={t.editor.splitView}
              >
                <Columns size={16} />
              </button>
              <button
                onClick={() => exportToPdf(currentContent, getExportFileName(currentFile))}
                className="p-1 hover:bg-accent rounded transition-colors text-muted-foreground hover:text-foreground"
                title={t.editor.exportPdf}
              >
                <Download size={16} />
              </button>
            </>
          )}
          <button
            onClick={toggleRightSidebar}
            className="p-1 hover:bg-accent rounded transition-colors text-muted-foreground hover:text-foreground"
            title={t.sidebar.toggleAIPanel}
          >
            <MessageSquare size={16} />
          </button>
        </div>
      </div>

      {/* Main content area */}
      {activeTab?.type === "ai-chat" ? (
        // 主视图区 AI 聊天视图
        <MainAIChatShell />
      ) : (
        // 普通笔记编辑视图
        <div className="flex-1 overflow-hidden relative">
          {/* 局部知识图谱 - 悬浮在右上角，可收起 */}
          {currentFile?.endsWith('.md') && (
            localGraphExpanded ? (
              <div className="absolute top-3 right-3 w-80 h-56 bg-background/90 backdrop-blur-sm border border-border/50 rounded-lg shadow-lg z-20 overflow-hidden transition-all duration-300">
                <button
                  onClick={toggleLocalGraph}
                  className="absolute top-1.5 right-1.5 p-1 rounded hover:bg-accent/80 text-muted-foreground hover:text-foreground z-10 transition-colors"
                  title={t.common.collapse}
                >
                  <X size={14} />
                </button>
                <LocalGraph className="w-full h-full" />
              </div>
            ) : (
              <button
                onClick={toggleLocalGraph}
                className="absolute top-3 right-3 p-2.5 bg-background/90 backdrop-blur-sm border border-border/50 rounded-lg shadow-lg z-20 text-muted-foreground hover:text-foreground hover:bg-accent/80 transition-all duration-300"
                title={t.common.localGraph}
              >
                <Network size={18} />
              </button>
            )
          )}

          <div ref={scrollContainerRef} className="h-full overflow-auto">
            {/* Selection Toolbar - Add to Chat */}
            <SelectionToolbar containerRef={scrollContainerRef} />
            {/* Selection Context Menu - Right Click */}
            <SelectionContextMenu
              containerRef={scrollContainerRef}
              onFormatText={(format, text) => {
                // 通过事件通知 CodeMirror 编辑器执行格式化
                window.dispatchEvent(new CustomEvent('editor-format-text', {
                  detail: { format, text }
                }));
              }}
            />

            <div className="max-w-4xl mx-auto px-8 py-4 editor-mode-container">
              {isVideoNoteFile && (
                <div className="mb-3 flex items-center justify-between px-3 py-2 bg-blue-500/5 border border-blue-500/30 rounded-md text-xs text-blue-700 dark:text-blue-300">
                  <span>{t.editor.videoNoteDetected}</span>
                  <button
                    onClick={() => openVideoNoteFromContent(currentContent, getFileName(currentFile || 'VideoNote'))}
                    className="ml-3 px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 text-xs font-medium"
                  >
                    {t.editor.openAsVideoNote}
                  </button>
                </div>
              )}
              {/* 统一使用 CodeMirrorEditor，通过 viewMode 切换模式 */}
              <div key="editor" className="editor-mode-content h-full">
                <CodeMirrorEditor
                  ref={codeMirrorRef}
                  content={currentContent}
                  onChange={(newContent) => {
                    updateContent(newContent);
                    debouncedSave();
                  }}
                  viewMode={editorMode as ViewMode}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
