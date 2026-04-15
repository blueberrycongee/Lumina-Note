import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useUIStore } from "@/stores/useUIStore";
import { useAIStore } from "@/stores/useAIStore";
import { useRustAgentStore } from "@/stores/useRustAgentStore";
import { useFileStore } from "@/stores/useFileStore";
import { useNoteIndexStore } from "@/stores/useNoteIndexStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { getDragData } from "@/lib/dragState";
import { getFileName } from "@/lib/utils";
import { PROVIDER_REGISTRY, type LLMProviderType } from "@/services/llm";
import { getRecommendedTemperature } from "@/services/llm/temperature";
import {
  FileText,
  Settings,
  Trash2,
  Loader2,
  Hash,
  List,
  Link2,
  Tag,
  ArrowUpRight,
  ChevronRight,
  Bot,
  Search,
  Lightbulb,
  Sparkles,
} from "lucide-react";
import { AgentPanel } from "../chat/AgentPanel";
import { ConversationList } from "../chat/ConversationList";
import { useConversationManager } from "@/hooks/useConversationManager";
import { ThinkingModelIcon } from "@/components/ai/ThinkingModelIcon";
import { useShallow } from "zustand/react/shallow";

// Heading item in outline
interface HeadingItem {
  level: number;
  text: string;
  line: number;
}

// Parse markdown content for headings
function parseHeadings(content: string): HeadingItem[] {
  const lines = content.split("\n");
  const headings: HeadingItem[] = [];

  lines.forEach((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        line: index + 1,
      });
    }
  });

  return headings;
}

function formatModelOptionLabel(model: {
  name: string;
  supportsThinking?: boolean;
}): string {
  return model.name;
}

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
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm p-4">
        <Link2 size={32} className="text-primary/25 mb-2" />
        <p>{t.panel.openNoteToShowBacklinks}</p>
      </div>
    );
  }

  if (isIndexing) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm p-4">
        <Loader2 size={24} className="animate-spin mb-2" />
        <p>{t.panel.buildingIndex}</p>
      </div>
    );
  }

  if (backlinks.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm p-4">
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
      <div className="p-2 border-b border-border/60 flex items-center gap-2">
        <Link2 size={12} className="text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
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
              <span className="text-sm font-medium truncate group-hover:text-primary">
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
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm p-4">
        <Loader2 size={24} className="animate-spin mb-2" />
        <p>{t.panel.buildingIndex}</p>
      </div>
    );
  }

  if (allTags.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm p-4">
        <Tag size={32} className="text-primary/25 mb-2" />
        <p>{t.panel.noTags}</p>
        <p className="text-xs opacity-70 mt-1">{t.panel.tagHint}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-2 border-b border-border/60 flex items-center gap-2">
        <Tag size={12} className="text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
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
              <span className="text-sm flex-1">{tagInfo.tag}</span>
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
                    className="w-full text-left px-3 py-1.5 hover:bg-accent transition-colors flex items-center gap-2 text-sm"
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
    () => parseHeadings(currentContent),
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
  const scrollToHeading = useCallback((line: number, text: string) => {
    // Dispatch custom event for editor to scroll to
    window.dispatchEvent(
      new CustomEvent("outline-scroll-to", { detail: { line, text } }),
    );
  }, []);

  if (!currentFile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm p-4">
        <List size={32} className="text-primary/25 mb-2" />
        <p>{t.panel.openNoteToShowOutline}</p>
      </div>
    );
  }

  if (headings.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm p-4">
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
      <div className="p-2 border-b border-border/60 flex items-center justify-between">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
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
        {headings.map((heading, idx) => {
          if (!expandedLevels.has(heading.level)) return null;

          const indent = (heading.level - minLevel) * 12;

          return (
            <button
              key={idx}
              onClick={() => scrollToHeading(heading.line, heading.text)}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors flex items-center gap-2 group"
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
  const {
    rightPanelTab,
    setRightPanelTab,
    chatMode,
    setChatMode,
    aiPanelMode,
    setAIPanelMode,
    setFloatingBallPosition,
    setFloatingBallDragging,
    setSkillManagerOpen,
  } = useUIStore();
  const { tabs, activeTabIndex } = useFileStore(
    useShallow((state) => ({
      tabs: state.tabs,
      activeTabIndex: state.activeTabIndex,
    })),
  );
  const {
    config,
    setConfig,
    checkFirstLoad: checkChatFirstLoad,
  } = useAIStore();
  const effectiveModelForTemp =
    config.model === "custom" ? config.customModelId || "custom" : config.model;
  const recommendedTemperature = getRecommendedTemperature(
    config.provider as LLMProviderType,
    effectiveModelForTemp,
  );
  const displayTemperature = config.temperature ?? recommendedTemperature;
  // 使用 Rust Agent store
  const rustAgentStore = useRustAgentStore();

  const autoApprove = rustAgentStore.autoApprove;
  const setAutoApprove = rustAgentStore.setAutoApprove;

  const [showSettings, setShowSettings] = useState(false);
  const [isDraggingAI, setIsDraggingAI] = useState(false);
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const [isDraggingFileOver, setIsDraggingFileOver] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  const activeTab = activeTabIndex >= 0 ? tabs[activeTabIndex] : null;
  const isMainAIActive = activeTab?.type === "ai-chat";

  // 首次加载检查
  useEffect(() => {
    // 只有当 AI 面板可见时才检查
    if (
      rightPanelTab === "chat" &&
      aiPanelMode === "docked" &&
      !isMainAIActive
    ) {
      if (chatMode !== "agent") {
        checkChatFirstLoad();
      }
    }
  }, [
    rightPanelTab,
    aiPanelMode,
    isMainAIActive,
    chatMode,
    checkChatFirstLoad,
  ]);

  // 处理 AI tab 拖拽 (pointer capture)
  const handleAIPointerDown = (e: React.PointerEvent) => {
    if (aiPanelMode === "floating") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    setIsDraggingAI(true);
  };

  const handleAIPointerMove = (e: React.PointerEvent) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const dx = e.clientX - dragStartPosRef.current.x;
    const dy = e.clientY - dragStartPosRef.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // 拖拽超过 50px 触发悬浮模式
    if (distance > 50) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      setIsDraggingAI(false);
      setFloatingBallPosition({ x: e.clientX - 28, y: e.clientY - 28 });
      setAIPanelMode("floating");
      setFloatingBallDragging(true); // 继承拖拽状态到悬浮球
      setRightPanelTab("outline"); // 自动切换到大纲
    }
  };

  const handleAIPointerUp = (e: React.PointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setIsDraggingAI(false);
  };

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
  const { handleDeleteCurrentSession: deleteCurrentSession } =
    useConversationManager();

  return (
    <aside
      ref={panelRef}
      className={`w-full h-full border-l border-border/60 bg-background/55 backdrop-blur-md flex flex-col transition-all duration-200 ${
        isDraggingFileOver ? "ring-2 ring-primary ring-inset bg-primary/5" : ""
      }`}
    >
      {/* Tabs */}
      <div className="ui-compact-row flex border-b border-border/60 bg-background/45 min-w-0">
        {/* AI Tab - temporarily hidden */}
        {false && aiPanelMode === "docked" && !isMainAIActive && (
          <button
            onClick={() => setRightPanelTab("chat")}
            onPointerDown={handleAIPointerDown}
            onPointerMove={handleAIPointerMove}
            onPointerUp={handleAIPointerUp}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors flex items-center justify-center gap-1 select-none whitespace-nowrap hover:bg-accent/50 touch-none ${
              rightPanelTab === "chat"
                ? "text-primary border-b-2 border-primary bg-primary/5"
                : "text-muted-foreground hover:text-foreground"
            } ${isDraggingAI ? "cursor-grabbing" : "cursor-grab"}`}
            title={t.ai.chat}
          >
            <Bot size={12} />
            <span className="ui-compact-text ui-compact-hide">AI</span>
          </button>
        )}
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

      {/* Chat Interface - temporarily hidden */}
      {false &&
        rightPanelTab === "chat" &&
        aiPanelMode === "docked" &&
        !isMainAIActive && (
          <div className="flex-1 flex overflow-hidden">
            {/* 可折叠的对话列表侧栏 */}
            {<ConversationList />}

            {/* 右侧主内容区 */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Header with Mode Toggle */}
              <div className="ui-compact-row p-2 border-b border-border/60 bg-background/35 flex items-center justify-between min-w-0">
                <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-1 px-2 py-1 text-xs">
                    <Bot size={12} />
                    <span className="right-ai-mode-label ui-compact-text">
                      Agent
                    </span>
                  </div>
                  <span className="right-ai-status text-xs text-muted-foreground whitespace-nowrap ui-compact-text">
                    {config.apiKey
                      ? "Configured"
                      : t.settingsModal.notConfigured}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={deleteCurrentSession}
                    className="w-7 h-7 ui-icon-btn"
                    title={t.conversationList.deleteConversation}
                  >
                    <Trash2 size={14} />
                  </button>
                  <button
                    onClick={() => setShowSettings(!showSettings)}
                    className="w-7 h-7 ui-icon-btn"
                    title={t.common.settings}
                  >
                    <Settings size={14} />
                  </button>
                </div>
              </div>

              {/* Settings Panel - 全屏模式 */}
              {showSettings ? (
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* 返回按钮 */}
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium flex items-center gap-1.5">
                      <Settings size={14} /> {t.settingsPanel.title}
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSkillManagerOpen(true)}
                        className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors flex items-center gap-1"
                      >
                        <Sparkles size={12} />
                        {t.ai.skillsManagerTitle}
                      </button>
                      <button
                        onClick={() => setShowSettings(false)}
                        className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
                      >
                        {t.panel.back}
                      </button>
                    </div>
                  </div>
                  {/* AI Provider Settings */}
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      <Bot size={12} /> {t.settingsPanel.aiChatSettings}
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">
                        {t.settingsPanel.provider}
                      </label>
                      <select
                        value={config.provider}
                        onChange={(e) => {
                          const provider = e.target.value as LLMProviderType;
                          const providerMeta = PROVIDER_REGISTRY[provider];
                          const defaultModel =
                            providerMeta?.models[0]?.id || "";
                          setConfig({
                            provider,
                            model: defaultModel,
                            temperature: getRecommendedTemperature(
                              provider,
                              defaultModel,
                            ),
                          });
                        }}
                        className="ui-input h-9 text-xs"
                      >
                        {Object.entries(PROVIDER_REGISTRY).map(
                          ([key, meta]) => (
                            <option key={key} value={key}>
                              {meta.label} - {meta.description}
                            </option>
                          ),
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">
                        API Key{" "}
                        {(config.provider === "ollama" ||
                          config.provider === "custom") && (
                          <span className="text-muted-foreground">
                            ({t.settingsPanel.apiKeyOptional})
                          </span>
                        )}
                      </label>
                      <input
                        type="password"
                        value={config.apiKey}
                        onChange={(e) => setConfig({ apiKey: e.target.value })}
                        placeholder={
                          config.provider === "ollama"
                            ? t.settingsPanel.localModelNoKey
                            : config.provider === "anthropic"
                              ? "sk-ant-..."
                              : config.provider === "custom"
                                ? t.settingsPanel.apiKeyOptional
                                : "sk-..."
                        }
                        className="ui-input h-9 text-xs"
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <label className="text-xs text-muted-foreground">
                          {t.settingsPanel.model}
                        </label>
                        {PROVIDER_REGISTRY[
                          config.provider as LLMProviderType
                        ]?.models.find((m) => m.id === config.model)
                          ?.supportsThinking && <ThinkingModelIcon />}
                      </div>
                      <select
                        value={
                          PROVIDER_REGISTRY[
                            config.provider as LLMProviderType
                          ]?.models.some((m) => m.id === config.model)
                            ? config.model
                            : "custom"
                        }
                        onChange={(e) => {
                          const newModel = e.target.value;
                          if (newModel === "custom") {
                            // 选择自定义模型时，清空 customModelId
                            setConfig({
                              model: newModel,
                              customModelId: "",
                              temperature: getRecommendedTemperature(
                                config.provider as LLMProviderType,
                                "custom",
                              ),
                            });
                          } else {
                            setConfig({
                              model: newModel,
                              temperature: getRecommendedTemperature(
                                config.provider as LLMProviderType,
                                newModel,
                              ),
                            });
                          }
                        }}
                        className="ui-input h-9 text-xs"
                      >
                        {PROVIDER_REGISTRY[
                          config.provider as LLMProviderType
                        ]?.models.map((model) => (
                          <option key={model.id} value={model.id}>
                            {formatModelOptionLabel(model)}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* 自定义模型 ID 输入框 */}
                    {config.model === "custom" && (
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">
                          {t.settingsPanel.customModelId}
                        </label>
                        <input
                          type="text"
                          value={config.customModelId || ""}
                          onChange={(e) =>
                            setConfig({ customModelId: e.target.value })
                          }
                          placeholder={t.aiSettings.customModelHint}
                          className="ui-input h-9 text-xs"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          <Lightbulb size={12} className="inline" />{" "}
                          {t.settingsPanel.customModelHint}
                        </p>
                      </div>
                    )}
                    {/* 自定义 Base URL (所有 Provider 都支持) */}
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">
                        Base URL{" "}
                        <span className="text-muted-foreground">
                          ({t.settingsPanel.baseUrlHint})
                        </span>
                      </label>
                      <input
                        type="text"
                        value={config.baseUrl || ""}
                        onChange={(e) =>
                          setConfig({ baseUrl: e.target.value || undefined })
                        }
                        placeholder={
                          PROVIDER_REGISTRY[config.provider as LLMProviderType]
                            ?.defaultBaseUrl
                        }
                        className="ui-input h-9 text-xs"
                      />
                    </div>

                    {/* 温度设置 */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs text-muted-foreground">
                          {t.settingsPanel.temperature}
                        </label>
                        <span className="text-xs text-muted-foreground">
                          {displayTemperature.toFixed(1)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={displayTemperature}
                        onChange={(e) =>
                          setConfig({ temperature: parseFloat(e.target.value) })
                        }
                        className="w-full accent-primary h-1 bg-muted rounded-lg appearance-none cursor-pointer"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {t.settingsPanel.temperatureHint}
                      </p>
                    </div>
                  </div>

                  {/* Agent Settings */}
                  <div className="space-y-2 pt-3 border-t border-border/60">
                    <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      <Bot size={12} /> {t.settingsPanel.agentSettings}
                    </div>
                    <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoApprove}
                        onChange={(e) => setAutoApprove(e.target.checked)}
                        className="w-3 h-3 rounded border-border/60"
                      />
                      {t.settingsPanel.autoApproveTools}
                      <span className="text-muted-foreground">
                        ({t.settingsPanel.noManualConfirm})
                      </span>
                    </label>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-hidden">
                  <AgentPanel />
                </div>
              )}
            </div>
          </div>
        )}

      {/* Outline View */}
      {rightPanelTab === "outline" && <OutlineView />}

      {/* Backlinks View */}
      {rightPanelTab === "backlinks" && <BacklinksView />}

      {/* Tags View */}
      {rightPanelTab === "tags" && <TagsView />}
    </aside>
  );
}
