import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useUIStore } from "@/stores/useUIStore";
import { useFileStore } from "@/stores/useFileStore";
import { useNoteIndexStore } from "@/stores/useNoteIndexStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { getDragData } from "@/lib/dragState";
import { getFileName } from "@/lib/utils";
import {
  FileText,
  Loader2,
  Hash,
  List,
  Link2,
  Tag,
  ArrowUpRight,
  ChevronRight,
} from "lucide-react";
import { extractMarkdownHeadings } from "@/services/markdown/headings";
import { useShallow } from "zustand/react/shallow";

// Backlinks view component
function BacklinksView() {
  const { t } = useLocaleStore();
  const { currentFile, openFile } = useFileStore(
    useShallow((state) => ({
      currentFile: state.currentFile,
      openFile: state.openFile,
    })),
  );
  const { getBacklinks, isIndexing } = useNoteIndexStore();

  const currentFileName = useMemo(() => {
    if (!currentFile) return "";
    return getFileName(currentFile);
  }, [currentFile]);

  const backlinks = useMemo(() => {
    if (!currentFileName) return [];
    return getBacklinks(currentFileName);
  }, [currentFileName, getBacklinks]);

  if (!currentFile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-[13px] p-4">
        <Link2 size={32} className="text-primary/25 mb-2" />
        <p>{t.panel.openNoteToShowBacklinks}</p>
      </div>
    );
  }

  if (isIndexing) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-[13px] p-4">
        <Loader2 size={24} className="animate-spin mb-2" />
        <p>{t.panel.buildingIndex}</p>
      </div>
    );
  }

  if (backlinks.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-[13px] p-4">
        <Link2 size={32} className="text-primary/25 mb-2" />
        <p>{t.panel.noBacklinks}</p>
        <p className="text-xs opacity-70 mt-1">
          {t.panel.backlinkHint.replace("{name}", currentFileName)}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-2 border-b border-border/50 flex items-center gap-2">
        <Link2 size={12} className="text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground">
          {backlinks.length} {t.panel.backlinks}
        </span>
      </div>

      {/* Backlinks list */}
      <div className="flex-1 overflow-y-auto py-2">
        {backlinks.map((backlink, idx) => (
          <button
            key={`${backlink.path}-${idx}`}
            onClick={() => openFile(backlink.path, { preview: true })}
            className="w-full text-left px-3 py-2 hover:bg-accent transition-colors group"
          >
            <div className="flex items-center gap-2 mb-1">
              <FileText size={12} className="text-primary shrink-0" />
              <span className="text-[13px] font-medium truncate group-hover:text-primary">
                {backlink.name}
              </span>
              <ArrowUpRight
                size={12}
                className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </div>
            {backlink.context && (
              <p className="text-xs text-muted-foreground line-clamp-2 pl-5">
                {backlink.context}
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// Tags view component
function TagsView() {
  const { t } = useLocaleStore();
  const { allTags, isIndexing } = useNoteIndexStore();
  const openFile = useFileStore((state) => state.openFile);
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());

  const toggleTag = useCallback((tag: string) => {
    setExpandedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }, []);

  if (isIndexing) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-[13px] p-4">
        <Loader2 size={24} className="animate-spin mb-2" />
        <p>{t.panel.buildingIndex}</p>
      </div>
    );
  }

  if (allTags.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-[13px] p-4">
        <Tag size={32} className="text-primary/25 mb-2" />
        <p>{t.panel.noTags}</p>
        <p className="text-xs opacity-70 mt-1">{t.panel.tagHint}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-2 border-b border-border/50 flex items-center gap-2">
        <Tag size={12} className="text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground">
          {allTags.length} {t.panel.tags}
        </span>
      </div>

      {/* Tags list */}
      <div className="flex-1 overflow-y-auto py-2">
        {allTags.map((tagInfo) => (
          <div key={tagInfo.tag}>
            <button
              onClick={() => toggleTag(tagInfo.tag)}
              className="w-full text-left px-3 py-2 hover:bg-accent transition-colors flex items-center gap-2"
            >
              <ChevronRight
                size={12}
                className={`text-muted-foreground transition-transform ${expandedTags.has(tagInfo.tag) ? "rotate-90" : ""}`}
              />
              <Hash size={12} className="text-primary" />
              <span className="text-[13px] flex-1">{tagInfo.tag}</span>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {tagInfo.count}
              </span>
            </button>

            {/* Expanded files */}
            {expandedTags.has(tagInfo.tag) && (
              <div className="bg-muted/30 border-l-2 border-primary/30 ml-4">
                {tagInfo.files.map((filePath) => (
                  <button
                    key={filePath}
                    onClick={() => openFile(filePath, { preview: true })}
                    className="w-full text-left px-3 py-1.5 hover:bg-accent transition-colors flex items-center gap-2 text-[13px]"
                  >
                    <FileText size={12} className="text-muted-foreground" />
                    <span className="truncate">{getFileName(filePath)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Outline view component
function OutlineView() {
  const { t } = useLocaleStore();
  const { currentContent, currentFile } = useFileStore(
    useShallow((state) => ({
      currentContent: state.currentContent,
      currentFile: state.currentFile,
    })),
  );
  const [expandedLevels, setExpandedLevels] = useState<Set<number>>(
    new Set([1, 2, 3]),
  );

  const headings = useMemo(
    () => extractMarkdownHeadings(currentContent),
    [currentContent],
  );

  const toggleLevel = useCallback((level: number) => {
    setExpandedLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  }, []);

  // Scroll to heading (broadcast event)
  const scrollToHeading = useCallback(
    (line: number, text: string, pos: number) => {
      // Dispatch custom event for editor to scroll to
      window.dispatchEvent(
        new CustomEvent("outline-scroll-to", { detail: { line, text, pos } }),
      );
    },
    [],
  );

  if (!currentFile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-[13px] p-4">
        <List size={32} className="text-primary/25 mb-2" />
        <p>{t.panel.openNoteToShowOutline}</p>
      </div>
    );
  }

  if (headings.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-[13px] p-4">
        <Hash size={32} className="text-primary/25 mb-2" />
        <p>{t.panel.noHeadings}</p>
        <p className="text-xs opacity-70 mt-1">{t.panel.headingHint}</p>
      </div>
    );
  }

  // Build tree structure
  const minLevel = Math.min(...headings.map((h) => h.level));

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-2 border-b border-border/50 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
          <List size={12} />
          {headings.length} {t.panel.headings}
        </span>
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5, 6].map((level) => {
            const hasLevel = headings.some((h) => h.level === level);
            if (!hasLevel) return null;
            return (
              <button
                key={level}
                onClick={() => toggleLevel(level)}
                className={`w-5 h-5 text-xs rounded transition-colors ${
                  expandedLevels.has(level)
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
                title={`${t.panel.toggleLevel}${level}`}
              >
                {level}
              </button>
            );
          })}
        </div>
      </div>

      {/* Headings list */}
      <div className="flex-1 overflow-y-auto py-2">
        {headings.map((heading) => {
          if (!expandedLevels.has(heading.level)) return null;

          const indent = (heading.level - minLevel) * 12;

          return (
            <button
              key={heading.from}
              onClick={() =>
                scrollToHeading(heading.line, heading.text, heading.from)
              }
              className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-accent transition-colors flex items-center gap-2 group"
              style={{ paddingLeft: 12 + indent }}
            >
              <span className="text-muted-foreground text-xs opacity-50 shrink-0 group-hover:opacity-100">
                H{heading.level}
              </span>
              <span className="truncate">{heading.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RightPanel() {
  const { t } = useLocaleStore();
  const { rightPanelTab, setRightPanelTab, aiPanelMode } = useUIStore();
  const { tabs, activeTabIndex } = useFileStore(
    useShallow((state) => ({
      tabs: state.tabs,
      activeTabIndex: state.activeTabIndex,
    })),
  );

  const [isDraggingFileOver, setIsDraggingFileOver] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  const activeTab = activeTabIndex >= 0 ? tabs[activeTabIndex] : null;
  const isMainAIActive = activeTab?.type === "ai-chat";

  // Listen for tag-clicked events to switch to Tags tab
  useEffect(() => {
    const handleTagClicked = () => {
      setRightPanelTab("tags");
      // Optionally scroll to or highlight the clicked tag
    };

    window.addEventListener("tag-clicked", handleTagClicked as EventListener);
    return () => {
      window.removeEventListener(
        "tag-clicked",
        handleTagClicked as EventListener,
      );
    };
  }, [setRightPanelTab]);

  // 文件拖拽进入面板时的视觉反馈
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const dragData = getDragData();
      if (!dragData?.isDragging || !panelRef.current) {
        if (isDraggingFileOver) setIsDraggingFileOver(false);
        return;
      }

      const rect = panelRef.current.getBoundingClientRect();
      const isOver =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      if (isOver !== isDraggingFileOver) {
        setIsDraggingFileOver(isOver);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingFileOver(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingFileOver]);

  // 监听文件拖拽放置，如果在面板区域内，转发给 ChatInput
  useEffect(() => {
    const handleLuminaDrop = (e: Event) => {
      const { filePath, fileName, x, y } = (e as CustomEvent).detail;
      if (!filePath || !fileName || !panelRef.current) return;

      // 检查是否在面板区域内
      const rect = panelRef.current.getBoundingClientRect();
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom)
        return;

      // 如果当前是 chat tab，转发事件给 ChatInput
      if (
        rightPanelTab === "chat" &&
        aiPanelMode === "docked" &&
        !isMainAIActive
      ) {
        window.dispatchEvent(
          new CustomEvent("chat-input-file-drop", {
            detail: { filePath, fileName },
          }),
        );
      }
    };

    window.addEventListener("lumina-drop", handleLuminaDrop);
    return () => window.removeEventListener("lumina-drop", handleLuminaDrop);
  }, [rightPanelTab, aiPanelMode, isMainAIActive]);

  // 使用统一的会话管理 hook

  return (
    <aside
      ref={panelRef}
      className={`w-full h-full shadow-[inset_1px_0_0_hsl(var(--border)/0.5)] bg-background flex flex-col transition-opacity duration-200 ${
        isDraggingFileOver ? "ring-2 ring-primary ring-inset bg-primary/5" : ""
      }`}
    >
      {/* Tabs */}
      <div className="ui-compact-row flex h-11 items-stretch border-b border-border/50 bg-background shadow-[inset_1px_0_0_hsl(var(--border)/0.5)] min-w-0">
        <button
          onClick={() => setRightPanelTab("outline")}
          className={`flex-1 py-2.5 text-xs font-medium transition-colors flex items-center justify-center gap-1 whitespace-nowrap hover:bg-accent/50 ${
            rightPanelTab === "outline"
              ? "text-primary border-b-2 border-primary bg-primary/5"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title={t.graph.outline}
        >
          <List size={12} />
          <span className="ui-compact-text ui-compact-hide">
            {t.graph.outline}
          </span>
        </button>
        <button
          onClick={() => setRightPanelTab("backlinks")}
          className={`flex-1 py-2.5 text-xs font-medium transition-colors flex items-center justify-center gap-1 whitespace-nowrap hover:bg-accent/50 ${
            rightPanelTab === "backlinks"
              ? "text-primary border-b-2 border-primary bg-primary/5"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title={t.graph.backlinks}
        >
          <Link2 size={12} />
          <span className="ui-compact-text ui-compact-hide">
            {t.graph.backlinks}
          </span>
        </button>
        <button
          onClick={() => setRightPanelTab("tags")}
          className={`flex-1 py-2.5 text-xs font-medium transition-colors flex items-center justify-center gap-1 whitespace-nowrap hover:bg-accent/50 ${
            rightPanelTab === "tags"
              ? "text-primary border-b-2 border-primary bg-primary/5"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title={t.graph.tags}
        >
          <Tag size={12} />
          <span className="ui-compact-text ui-compact-hide">
            {t.graph.tags}
          </span>
        </button>
      </div>

      {/* Outline View */}
      {rightPanelTab === "outline" && <OutlineView />}

      {/* Backlinks View */}
      {rightPanelTab === "backlinks" && <BacklinksView />}

      {/* Tags View */}
      {rightPanelTab === "tags" && <TagsView />}
    </aside>
  );
}
