import { useEffect, useCallback, useRef, useState } from "react";
import { useFileStore } from "@/stores/useFileStore";
import { useShallow } from "zustand/react/shallow";
import { useUIStore, EditorMode } from "@/stores/useUIStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { MainAIChatShell } from "@/components/layout/MainAIChatShell";
import { LocalGraph } from "@/components/effects/LocalGraph";
import { debounce, getFileName } from "@/lib/utils";
import {
  CodeMirrorEditor,
  type CodeMirrorEditorRef,
  ViewMode,
} from "./CodeMirrorEditor";
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
let localGraphExpandedState = false;

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
  } = useFileStore(
    useShallow((state) => ({
      tabs: state.tabs,
      activeTabIndex: state.activeTabIndex,
      currentFile: state.currentFile,
      currentContent: state.currentContent,
      updateContent: state.updateContent,
      save: state.save,
      isDirty: state.isDirty,
      isSaving: state.isSaving,
      isLoadingFile: state.isLoadingFile,
      goBack: state.goBack,
      goForward: state.goForward,
      canGoBack: state.canGoBack,
      canGoForward: state.canGoForward,
      undo: state.undo,
      redo: state.redo,
      canUndo: state.canUndo,
      canRedo: state.canRedo,
    })),
  );

  const {
    toggleLeftSidebar,
    toggleRightSidebar,
    editorMode,
    setEditorMode,
    toggleSplitView,
  } = useUIStore();

  const editorRef = useRef<CodeMirrorEditorRef>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastOuterScrollTraceAtRef = useRef(0);
  const editorScrollFadeTimerRef = useRef<number | null>(null);
  const [_isEditorScrollActive, setIsEditorScrollActive] = useState(false);

  const getLineFromScrollPosition = useCallback(
    (container: HTMLElement): number => {
      const scrollTop = container.scrollTop;
      const lineHeight = 28;
      const estimatedLine = Math.floor(scrollTop / lineHeight) + 1;
      const lines = currentContent.split("\n").length;
      return Math.min(Math.max(1, estimatedLine), lines);
    },
    [currentContent],
  );

  const activeTab = activeTabIndex >= 0 ? tabs[activeTabIndex] : null;

  const markEditorTrace = useCallback(
    (type: string, payload: Record<string, unknown> = {}) => {
      if (typeof window === "undefined") return;
      (window as any).__luminaEditorTrace?.mark?.(type, payload);
    },
    [],
  );

  // 局部图谱展开/收起状态
  const [localGraphExpanded, setLocalGraphExpanded] = useState(
    localGraphExpandedState,
  );
  const toggleLocalGraph = useCallback(() => {
    setLocalGraphExpanded((prev) => {
      localGraphExpandedState = !prev;
      return !prev;
    });
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    let lastOuterPointerMoveTraceAt = 0;
    const summarizePointerTarget = (target: EventTarget | null) => {
      const element = target instanceof HTMLElement ? target : null;
      return {
        tag: element?.tagName.toLowerCase() || "unknown",
        className: element?.className || "",
        text: (element?.textContent || "").slice(0, 120),
      };
    };
    const handleOuterScroll = () => {
      setIsEditorScrollActive(true);
      if (editorScrollFadeTimerRef.current !== null) {
        window.clearTimeout(editorScrollFadeTimerRef.current);
      }
      editorScrollFadeTimerRef.current = window.setTimeout(() => {
        setIsEditorScrollActive(false);
        editorScrollFadeTimerRef.current = null;
      }, 720);
      const now = Date.now();
      if (now - lastOuterScrollTraceAtRef.current < 80) return;
      lastOuterScrollTraceAtRef.current = now;
      markEditorTrace("editor-outer-scroll", {
        mode: editorMode,
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
        estimatedLine: getLineFromScrollPosition(container),
      });
    };
    const handleOuterWheel = (event: WheelEvent) => {
      markEditorTrace("editor-outer-wheel", {
        mode: editorMode,
        x: event.clientX,
        y: event.clientY,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        ...summarizePointerTarget(event.target),
      });
    };
    const handleOuterPointerDown = (event: PointerEvent) => {
      markEditorTrace("editor-outer-pointerdown", {
        mode: editorMode,
        x: event.clientX,
        y: event.clientY,
        button: event.button,
        buttons: event.buttons,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        ...summarizePointerTarget(event.target),
      });
    };
    const handleOuterPointerMove = (event: PointerEvent) => {
      const now = Date.now();
      if (event.buttons === 0 && now - lastOuterPointerMoveTraceAt < 120)
        return;
      if (event.buttons !== 0 && now - lastOuterPointerMoveTraceAt < 60) return;
      lastOuterPointerMoveTraceAt = now;
      markEditorTrace("editor-outer-pointermove", {
        mode: editorMode,
        x: event.clientX,
        y: event.clientY,
        buttons: event.buttons,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        ...summarizePointerTarget(event.target),
      });
    };
    const handleOuterPointerUp = (event: PointerEvent) => {
      markEditorTrace("editor-outer-pointerup", {
        mode: editorMode,
        x: event.clientX,
        y: event.clientY,
        button: event.button,
        buttons: event.buttons,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        ...summarizePointerTarget(event.target),
      });
    };
    const handleOuterClick = (event: MouseEvent) => {
      markEditorTrace("editor-outer-click", {
        mode: editorMode,
        x: event.clientX,
        y: event.clientY,
        detail: event.detail,
        button: event.button,
        buttons: event.buttons,
        ...summarizePointerTarget(event.target),
      });
    };
    container.addEventListener("scroll", handleOuterScroll, { passive: true });
    container.addEventListener("wheel", handleOuterWheel, { passive: true });
    container.addEventListener("pointerdown", handleOuterPointerDown);
    container.addEventListener("pointermove", handleOuterPointerMove);
    container.addEventListener("pointerup", handleOuterPointerUp);
    container.addEventListener("click", handleOuterClick);
    return () => {
      if (editorScrollFadeTimerRef.current !== null) {
        window.clearTimeout(editorScrollFadeTimerRef.current);
        editorScrollFadeTimerRef.current = null;
      }
      container.removeEventListener("scroll", handleOuterScroll);
      container.removeEventListener("wheel", handleOuterWheel);
      container.removeEventListener("pointerdown", handleOuterPointerDown);
      container.removeEventListener("pointermove", handleOuterPointerMove);
      container.removeEventListener("pointerup", handleOuterPointerUp);
      container.removeEventListener("click", handleOuterClick);
    };
  }, [editorMode, getLineFromScrollPosition, markEditorTrace]);

  const handleModeChange = useCallback(
    (mode: EditorMode) => {
      if (mode === editorMode) return;
      markEditorTrace("editor-mode-change-requested", {
        previousMode: editorMode,
        mode,
        activeTabType: activeTab?.type || "unknown",
        outerScrollTop: scrollContainerRef.current?.scrollTop ?? null,
      });
      setEditorMode(mode);
    },
    [activeTab?.type, editorMode, markEditorTrace, setEditorMode],
  );

  // 全局键盘快捷键
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      const isMod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const active = document.activeElement as HTMLElement | null;
      const inCodeMirror = !!active?.closest(".cm-editor");
      const inTextInput =
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.isContentEditable);

      // Ctrl+Z: undo (unless in another text input)
      if (isMod && key === "z" && !e.shiftKey) {
        if (!inCodeMirror && inTextInput) return;

        if (canUndo()) {
          e.preventDefault();
          undo();
        }
        return;
      }

      // Ctrl+Y or Ctrl+Shift+Z: redo
      if (isMod && (key === "y" || (key === "z" && e.shiftKey))) {
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
    },
    [undo, redo, canUndo, canRedo, goBack, goForward],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Debounced save (1000ms after user stops typing, matching VS Code default)
  const debouncedSaveRef = useRef<ReturnType<typeof debounce> | null>(null);
  useEffect(() => {
    debouncedSaveRef.current = debounce(() => save(), 1000);
    return () => {
      debouncedSaveRef.current?.cancel();
    };
  }, [save]);

  // Save on window blur (when user switches to another app)
  useEffect(() => {
    const handleBlur = () => {
      if (isDirty && activeTab?.type !== "ai-chat") {
        save();
      }
    };
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [isDirty, save, activeTab?.type]);

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

      {/* Top Navigation Bar — 非 AI 聊天模式下显示 */}
      {activeTab?.type !== "ai-chat" && (
        <div className="ui-compact-row h-10 flex items-center px-4 justify-between select-none border-b border-border shrink-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0 overflow-hidden">
            <button
              onClick={toggleLeftSidebar}
              className="p-1 hover:bg-accent rounded transition-colors hover:text-foreground shrink-0"
              title={t.sidebar.toggleSidebar}
            >
              <Sidebar size={16} />
            </button>

            {/* Navigation buttons */}
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                onClick={goBack}
                disabled={!canGoBack()}
                className={cn(
                  "p-1 rounded transition-colors",
                  canGoBack()
                    ? "hover:bg-accent text-muted-foreground hover:text-foreground"
                    : "text-muted-foreground/30 cursor-not-allowed",
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
                    : "text-muted-foreground/30 cursor-not-allowed",
                )}
                title={t.editor.goForwardShortcut}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <span className="text-muted-foreground/50 shrink-0">/</span>
            <span className="text-foreground font-medium truncate">
              {currentFile ? getFileName(currentFile) : t.common.untitled}
            </span>
            {isDirty && (
              <span
                className="w-2 h-2 rounded-full bg-orange-400 shrink-0"
                title={t.common.unsavedChanges}
              />
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Mode Switcher — single button cycling live → reading → source */}
            <button
              onClick={() => {
                const order: EditorMode[] = ["live", "reading", "source"];
                const next =
                  order[(order.indexOf(editorMode) + 1) % order.length];
                handleModeChange(next);
              }}
              className="p-1 hover:bg-accent rounded transition-colors text-muted-foreground hover:text-foreground"
              title={modeLabels[editorMode]}
            >
              {modeIcons[editorMode]}
            </button>

            <span className="ui-compact-hide text-xs text-muted-foreground">
              {isSaving
                ? t.editor.saving
                : isDirty
                  ? t.editor.edited
                  : t.common.saved}
            </span>
            <button
              onClick={toggleSplitView}
              className="p-1 hover:bg-accent rounded transition-colors text-muted-foreground hover:text-foreground"
              title={t.editor.splitView}
            >
              <Columns size={16} />
            </button>
            <button
              onClick={() =>
                exportToPdf(currentContent, getExportFileName(currentFile))
              }
              className="p-1 hover:bg-accent rounded transition-colors text-muted-foreground hover:text-foreground"
              title={t.editor.exportPdf}
            >
              <Download size={16} />
            </button>
            <button
              onClick={toggleRightSidebar}
              className="p-1 hover:bg-accent rounded transition-colors text-muted-foreground hover:text-foreground"
              title={t.sidebar.toggleAIPanel}
            >
              <MessageSquare size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Main content area */}
      {activeTab?.type === "ai-chat" ? (
        // 主视图区 AI 聊天视图
        <MainAIChatShell />
      ) : (
        // 普通笔记编辑视图
        <div className="flex-1 overflow-hidden relative">
          {/* 局部知识图谱 - 悬浮在右上角，可收起 */}
          {currentFile?.endsWith(".md") &&
            (localGraphExpanded ? (
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
            ))}

          {/* Selection Toolbar - Add to Chat */}
          <SelectionToolbar containerRef={scrollContainerRef} />
          {/* Selection Context Menu - Right Click */}
          <SelectionContextMenu
            containerRef={scrollContainerRef}
            onFormatText={(format, text) => {
              window.dispatchEvent(
                new CustomEvent("editor-format-text", {
                  detail: { format, text },
                }),
              );
            }}
          />

          {/* CodeMirror editor — cm-scroller is the sole scroll container */}
          <CodeMirrorEditor
            ref={editorRef}
            content={currentContent}
            onChange={(newContent, selection) => {
              updateContent(newContent, "user", undefined, selection);
              debouncedSaveRef.current?.();
            }}
            viewMode={editorMode as ViewMode}
            filePath={currentFile}
          />
        </div>
      )}
    </div>
  );
}
