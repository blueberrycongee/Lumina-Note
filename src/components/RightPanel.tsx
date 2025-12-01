import { useState, useEffect, useMemo, useCallback } from "react";
import { useUIStore } from "@/stores/useUIStore";
import { useAIStore } from "@/stores/useAIStore";
import { useAgentStore } from "@/stores/useAgentStore";
import { useFileStore } from "@/stores/useFileStore";
import { useNoteIndexStore } from "@/stores/useNoteIndexStore";
import { useRAGStore } from "@/stores/useRAGStore";
import { getFileName } from "@/lib/utils";
import { PROVIDER_REGISTRY, type LLMProviderType } from "@/services/llm";
import {
  BrainCircuit,
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
} from "lucide-react";
import { AgentPanel } from "./AgentPanel";
import { ConversationList } from "./ConversationList";
import { ChatPanel } from "./ChatPanel";

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

// Backlinks view component
function BacklinksView() {
  const { currentFile, openFile } = useFileStore();
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
        <Link2 size={32} className="opacity-30 mb-2" />
        <p>打开笔记后显示反向链接</p>
      </div>
    );
  }
  
  if (isIndexing) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm p-4">
        <Loader2 size={24} className="animate-spin mb-2" />
        <p>正在建立索引...</p>
      </div>
    );
  }
  
  if (backlinks.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm p-4">
        <Link2 size={32} className="opacity-30 mb-2" />
        <p>暂无反向链接</p>
        <p className="text-xs opacity-70 mt-1">其他笔记中使用 [[{currentFileName}]] 链接到此笔记</p>
      </div>
    );
  }
  
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-2 border-b border-border flex items-center gap-2">
        <Link2 size={12} className="text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {backlinks.length} 个反向链接
        </span>
      </div>
      
      {/* Backlinks list */}
      <div className="flex-1 overflow-y-auto py-2">
        {backlinks.map((backlink, idx) => (
          <button
            key={`${backlink.path}-${idx}`}
            onClick={() => openFile(backlink.path)}
            className="w-full text-left px-3 py-2 hover:bg-accent transition-colors group"
          >
            <div className="flex items-center gap-2 mb-1">
              <FileText size={12} className="text-primary shrink-0" />
              <span className="text-sm font-medium truncate group-hover:text-primary">
                {backlink.name}
              </span>
              <ArrowUpRight size={12} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
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
  const { allTags, isIndexing } = useNoteIndexStore();
  const { openFile } = useFileStore();
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());
  
  const toggleTag = useCallback((tag: string) => {
    setExpandedTags(prev => {
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
        <p>正在建立索引...</p>
      </div>
    );
  }
  
  if (allTags.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm p-4">
        <Tag size={32} className="opacity-30 mb-2" />
        <p>暂无标签</p>
        <p className="text-xs opacity-70 mt-1">使用 #标签名 创建标签</p>
      </div>
    );
  }
  
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-2 border-b border-border flex items-center gap-2">
        <Tag size={12} className="text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {allTags.length} 个标签
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
                className={`text-muted-foreground transition-transform ${expandedTags.has(tagInfo.tag) ? 'rotate-90' : ''}`} 
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
                    onClick={() => openFile(filePath)}
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
  const { currentContent, currentFile } = useFileStore();
  const [expandedLevels, setExpandedLevels] = useState<Set<number>>(new Set([1, 2, 3]));
  
  const headings = useMemo(() => parseHeadings(currentContent), [currentContent]);
  
  const toggleLevel = useCallback((level: number) => {
    setExpandedLevels(prev => {
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
      new CustomEvent("outline-scroll-to", { detail: { line, text } })
    );
  }, []);
  
  if (!currentFile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm p-4">
        <List size={32} className="opacity-30 mb-2" />
        <p>打开笔记后显示大纲</p>
      </div>
    );
  }
  
  if (headings.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm p-4">
        <Hash size={32} className="opacity-30 mb-2" />
        <p>此笔记没有标题</p>
        <p className="text-xs opacity-70 mt-1">使用 # 创建标题</p>
      </div>
    );
  }
  
  // Build tree structure
  const minLevel = Math.min(...headings.map(h => h.level));
  
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-2 border-b border-border flex items-center justify-between">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <List size={12} />
          {headings.length} 个标题
        </span>
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5, 6].map(level => {
            const hasLevel = headings.some(h => h.level === level);
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
                title={`切换 H${level}`}
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
  const { 
    rightPanelTab, 
    setRightPanelTab,
    chatMode,
    setChatMode,
    aiPanelMode,
    setAIPanelMode,
    setFloatingBallPosition,
    setFloatingBallDragging,
  } = useUIStore();
  const { 
    config,
    clearChat,
    setConfig,
  } = useAIStore();
  useFileStore(); // Hook needed for store subscription
  const { 
    config: ragConfig, 
    setConfig: setRAGConfig, 
    isIndexing: ragIsIndexing,
    indexStatus,
    rebuildIndex,
    cancelIndex,
  } = useRAGStore();
  const { autoApprove, setAutoApprove } = useAgentStore();
  
  const [showSettings, setShowSettings] = useState(false);
  const [isDraggingAI, setIsDraggingAI] = useState(false);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });

  // 处理 AI tab 拖拽开始
  const handleAIDragStart = (e: React.MouseEvent) => {
    if (aiPanelMode === "floating") return;
    setDragStartPos({ x: e.clientX, y: e.clientY });
    setIsDraggingAI(true);
  };

  // 处理拖拽中
  useEffect(() => {
    if (!isDraggingAI) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartPos.x;
      const dy = e.clientY - dragStartPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // 拖拽超过 50px 触发悬浮模式
      if (distance > 50) {
        setIsDraggingAI(false);
        setFloatingBallPosition({ x: e.clientX - 28, y: e.clientY - 28 });
        setAIPanelMode("floating");
        setFloatingBallDragging(true); // 继承拖拽状态到悬浮球
        setRightPanelTab("outline"); // 自动切换到大纲
      }
    };

    const handleMouseUp = () => {
      setIsDraggingAI(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingAI, dragStartPos, setFloatingBallPosition, setAIPanelMode]);

  // Listen for tag-clicked events to switch to Tags tab
  useEffect(() => {
    const handleTagClicked = (e: CustomEvent<{ tag: string }>) => {
      setRightPanelTab("tags");
      // Optionally scroll to or highlight the clicked tag
      console.log("Tag clicked:", e.detail.tag);
    };
    
    window.addEventListener("tag-clicked", handleTagClicked as EventListener);
    return () => {
      window.removeEventListener("tag-clicked", handleTagClicked as EventListener);
    };
  }, [setRightPanelTab]);

  return (
    <aside className="w-full h-full bg-background border-l border-border flex flex-col transition-colors duration-300">
      {/* Tabs */}
      <div className="flex border-b border-border">
        {/* AI Tab - 只在 docked 模式下显示 */}
        {aiPanelMode === "docked" && (
          <button
            onClick={() => setRightPanelTab("chat")}
            onMouseDown={handleAIDragStart}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors flex items-center justify-center gap-1 select-none ${
              rightPanelTab === "chat"
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            } ${isDraggingAI ? "cursor-grabbing" : "cursor-grab"}`}
            title="AI 助手 (可拖出为悬浮球)"
          >
            {chatMode === "agent" ? <Bot size={12} /> : <BrainCircuit size={12} />}
            <span className="hidden sm:inline">AI</span>
          </button>
        )}
        <button
          onClick={() => setRightPanelTab("outline")}
          className={`flex-1 py-2.5 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
            rightPanelTab === "outline"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title="大纲视图"
        >
          <List size={12} />
          <span className="hidden sm:inline">大纲</span>
        </button>
        <button
          onClick={() => setRightPanelTab("backlinks")}
          className={`flex-1 py-2.5 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
            rightPanelTab === "backlinks"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title="反向链接"
        >
          <Link2 size={12} />
          <span className="hidden sm:inline">链接</span>
        </button>
        <button
          onClick={() => setRightPanelTab("tags")}
          className={`flex-1 py-2.5 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
            rightPanelTab === "tags"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title="标签"
        >
          <Tag size={12} />
          <span className="hidden sm:inline">标签</span>
        </button>
      </div>

      {/* Chat Interface - 只在 docked 模式下显示 */}
      {rightPanelTab === "chat" && aiPanelMode === "docked" && (
        <div className="flex-1 flex overflow-hidden">
          {/* 可折叠的对话列表侧栏 */}
          <ConversationList />
          
          {/* 右侧主内容区 */}
          <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header with Mode Toggle */}
          <div className="p-2 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Mode Toggle */}
              <div className="flex bg-muted rounded-md p-0.5">
                <button
                  onClick={() => setChatMode("agent")}
                  className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${
                    chatMode === "agent"
                      ? "bg-background text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Agent 模式 - 智能任务执行"
                >
                  <Bot size={12} />
                  Agent
                </button>
                <button
                  onClick={() => setChatMode("chat")}
                  className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${
                    chatMode === "chat"
                      ? "bg-background text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="对话模式 - 简单问答"
                >
                  <BrainCircuit size={12} />
                  对话
                </button>
              </div>
              <span className="text-xs text-muted-foreground">
                {config.apiKey ? "✓" : "未配置"}
              </span>
            </div>
            <div className="flex gap-1">
              <button
                onClick={clearChat}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                title="清空对话"
              >
                <Trash2 size={14} />
              </button>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                title="设置"
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
                <h3 className="text-sm font-medium">⚙️ 设置</h3>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
                >
                  ← 返回
                </button>
              </div>
              {/* AI Provider Settings */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-foreground">🤖 AI 对话设置</div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">服务商</label>
                  <select
                    value={config.provider}
                    onChange={(e) => {
                      const provider = e.target.value as LLMProviderType;
                      const providerMeta = PROVIDER_REGISTRY[provider];
                      const defaultModel = providerMeta?.models[0]?.id || "";
                      setConfig({ provider, model: defaultModel });
                    }}
                    className="w-full text-xs p-2 rounded border border-border bg-background"
                  >
                    {Object.entries(PROVIDER_REGISTRY).map(([key, meta]) => (
                      <option key={key} value={key}>
                        {meta.label} - {meta.description}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    API Key {config.provider === "ollama" && <span className="text-muted-foreground">(可选)</span>}
                  </label>
                  <input
                    type="password"
                    value={config.apiKey}
                    onChange={(e) => setConfig({ apiKey: e.target.value })}
                    placeholder={
                      config.provider === "ollama" 
                        ? "本地模型无需 API Key" 
                        : config.provider === "anthropic" 
                          ? "sk-ant-..." 
                          : "sk-..."
                    }
                    className="w-full text-xs p-2 rounded border border-border bg-background"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">模型</label>
                  <select
                    value={PROVIDER_REGISTRY[config.provider as LLMProviderType]?.models.some(m => m.id === config.model) ? config.model : "custom"}
                    onChange={(e) => setConfig({ model: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-border bg-background"
                  >
                    {PROVIDER_REGISTRY[config.provider as LLMProviderType]?.models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name} {model.supportsThinking ? "🧠" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                {/* 自定义模型 ID 输入框 */}
                {config.model === "custom" && (
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      自定义模型 ID
                    </label>
                    <input
                      type="text"
                      value={config.customModelId || ""}
                      onChange={(e) => setConfig({ customModelId: e.target.value })}
                      placeholder="例如：gemini-2.5-pro-preview-06-05"
                      className="w-full text-xs p-2 rounded border border-border bg-background"
                    />
                  </div>
                )}
                {/* 自定义 Base URL (所有 Provider 都支持) */}
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Base URL <span className="text-muted-foreground">(可选，用于第三方代理)</span>
                  </label>
                  <input
                    type="text"
                    value={config.baseUrl || ""}
                    onChange={(e) => setConfig({ baseUrl: e.target.value || undefined })}
                    placeholder={PROVIDER_REGISTRY[config.provider as LLMProviderType]?.defaultBaseUrl}
                    className="w-full text-xs p-2 rounded border border-border bg-background"
                  />
                </div>
              </div>

              {/* Agent Settings */}
              <div className="space-y-2 pt-3 border-t border-border">
                <div className="text-xs font-medium text-foreground">🤖 Agent 设置</div>
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoApprove}
                    onChange={(e) => setAutoApprove(e.target.checked)}
                    className="w-3 h-3 rounded border-border"
                  />
                  自动批准工具调用
                  <span className="text-muted-foreground">(无需手动确认)</span>
                </label>
              </div>

              {/* RAG Settings */}
              <div className="space-y-2 pt-3 border-t border-border">
                <div className="text-xs font-medium text-foreground flex items-center justify-between">
                  <span>🔍 语义搜索 (RAG)</span>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ragConfig.enabled}
                      onChange={(e) => setRAGConfig({ enabled: e.target.checked })}
                      className="w-3 h-3"
                    />
                    <span className="text-xs text-muted-foreground">启用</span>
                  </label>
                </div>
                
                {ragConfig.enabled && (
                  <>
                    {/* RAG 当前状态 + 操作按钮 */}
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">
                        {ragIsIndexing
                          ? `正在索引${
                              typeof indexStatus?.progress === "number"
                                ? `：${Math.round(indexStatus.progress * 100)}%`
                                : "..."
                            }`
                          : indexStatus
                            ? `已索引 ${indexStatus.totalChunks ?? 0} 个片段`
                            : "尚未建立索引"}
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={rebuildIndex}
                          disabled={ragIsIndexing}
                          className="px-2 py-1 rounded border border-border text-xs hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          重新索引
                        </button>
                        {ragIsIndexing && (
                          <button
                            type="button"
                            onClick={cancelIndex}
                            className="px-2 py-1 rounded border border-red-500/60 text-xs text-red-500 hover:bg-red-500/10"
                          >
                            取消索引
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Embedding 服务</label>
                      <select
                        value={ragConfig.embeddingProvider}
                        onChange={(e) => {
                          const provider = e.target.value as "openai" | "ollama";
                          const defaultModels: Record<string, string> = {
                            openai: "text-embedding-3-small",
                            ollama: "nomic-embed-text",
                          };
                          setRAGConfig({ 
                            embeddingProvider: provider, 
                            embeddingModel: defaultModels[provider] 
                          });
                        }}
                        className="w-full text-xs p-2 rounded border border-border bg-background"
                      >
                        <option value="openai">OpenAI</option>
                        <option value="ollama">Ollama (本地)</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">
                        Embedding API Key
                        {ragConfig.embeddingProvider === "ollama" && (
                          <span className="text-muted-foreground/60 ml-1">(可选)</span>
                        )}
                      </label>
                      <input
                        type="password"
                        value={ragConfig.embeddingApiKey || ""}
                        onChange={(e) => setRAGConfig({ embeddingApiKey: e.target.value })}
                        placeholder={ragConfig.embeddingProvider === "openai" ? "sk-..." : "http://localhost:11434"}
                        className="w-full text-xs p-2 rounded border border-border bg-background"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Embedding Base URL</label>
                      <input
                        type="text"
                        value={ragConfig.embeddingBaseUrl || ""}
                        onChange={(e) => setRAGConfig({ embeddingBaseUrl: e.target.value })}
                        placeholder={ragConfig.embeddingProvider === "openai" ? "https://api.openai.com/v1" : "http://localhost:11434"}
                        className="w-full text-xs p-2 rounded border border-border bg-background"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Embedding 模型</label>
                      <input
                        type="text"
                        value={ragConfig.embeddingModel}
                        onChange={(e) => setRAGConfig({ embeddingModel: e.target.value })}
                        placeholder="Qwen/Qwen3-Embedding-8B"
                        className="w-full text-xs p-2 rounded border border-border bg-background"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">
                        向量维度
                        <span className="text-muted-foreground/60 ml-1">(可选)</span>
                      </label>
                      <input
                        type="number"
                        value={ragConfig.embeddingDimensions || ""}
                        onChange={(e) => setRAGConfig({ embeddingDimensions: e.target.value ? parseInt(e.target.value) : undefined })}
                        placeholder="如 1024（留空使用默认）"
                        className="w-full text-xs p-2 rounded border border-border bg-background"
                      />
                    </div>

                    {/* Reranker Settings */}
                    <div className="border-t border-border pt-3 mt-2">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium">重排序 (Reranker)</span>
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={ragConfig.rerankerEnabled || false}
                            onChange={(e) => setRAGConfig({ rerankerEnabled: e.target.checked })}
                            className="w-3 h-3"
                          />
                          <span className="text-xs text-muted-foreground">启用</span>
                        </label>
                      </div>
                      
                      {ragConfig.rerankerEnabled && (
                        <div className="space-y-2">
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Reranker Base URL</label>
                            <input
                              type="text"
                              value={ragConfig.rerankerBaseUrl || ""}
                              onChange={(e) => setRAGConfig({ rerankerBaseUrl: e.target.value })}
                              placeholder="https://api.siliconflow.cn/v1"
                              className="w-full text-xs p-2 rounded border border-border bg-background"
                            />
                          </div>
                          
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Reranker API Key</label>
                            <input
                              type="password"
                              value={ragConfig.rerankerApiKey || ""}
                              onChange={(e) => setRAGConfig({ rerankerApiKey: e.target.value })}
                              placeholder="sk-..."
                              className="w-full text-xs p-2 rounded border border-border bg-background"
                            />
                          </div>
                          
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Reranker 模型</label>
                            <input
                              type="text"
                              value={ragConfig.rerankerModel || ""}
                              onChange={(e) => setRAGConfig({ rerankerModel: e.target.value })}
                              placeholder="BAAI/bge-reranker-v2-m3"
                              className="w-full text-xs p-2 rounded border border-border bg-background"
                            />
                          </div>
                          
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">返回数量 (Top N)</label>
                            <input
                              type="number"
                              value={ragConfig.rerankerTopN || 5}
                              onChange={(e) => setRAGConfig({ rerankerTopN: parseInt(e.target.value) || 5 })}
                              min={1}
                              max={20}
                              className="w-full text-xs p-2 rounded border border-border bg-background"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Index Status */}
                    <div className="bg-muted/50 rounded p-2 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">索引状态</span>
                        {ragIsIndexing ? (
                          <span className="text-yellow-500 flex items-center gap-1">
                            <Loader2 size={10} className="animate-spin" />
                            索引中...
                          </span>
                        ) : indexStatus?.initialized ? (
                          <span className="text-green-500">✓ 已就绪</span>
                        ) : (
                          <span className="text-muted-foreground">未初始化</span>
                        )}
                      </div>
                      
                      {/* 索引进度条 */}
                      {ragIsIndexing && indexStatus?.progress && (
                        <div className="space-y-1">
                          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                            <div 
                              className="bg-primary h-full transition-all duration-300"
                              style={{ 
                                width: `${Math.round((indexStatus.progress.current / Math.max(indexStatus.progress.total, 1)) * 100)}%` 
                              }}
                            />
                          </div>
                          <div className="text-xs text-muted-foreground flex justify-between">
                            <span>
                              {indexStatus.progress.current} / {indexStatus.progress.total} 文件
                            </span>
                            <span>
                              {Math.round((indexStatus.progress.current / Math.max(indexStatus.progress.total, 1)) * 100)}%
                            </span>
                          </div>
                          {indexStatus.progress.currentFile && (
                            <div className="text-xs text-muted-foreground truncate" title={indexStatus.progress.currentFile}>
                              正在处理: {indexStatus.progress.currentFile.split(/[/\\]/).pop()}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {!ragIsIndexing && indexStatus && (
                        <div className="text-xs text-muted-foreground">
                          {indexStatus.totalFiles} 个文件, {indexStatus.totalChunks} 个块
                        </div>
                      )}
                      
                      <button
                        onClick={() => rebuildIndex()}
                        disabled={ragIsIndexing || !ragConfig.embeddingApiKey}
                        className="w-full text-xs py-1 px-2 bg-primary/10 hover:bg-primary/20 text-primary rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {ragIsIndexing ? "索引中..." : "重建索引"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
          {/* Agent Mode */}
          {chatMode === "agent" && (
            <div className="flex-1 overflow-hidden">
              <AgentPanel />
            </div>
          )}

          {/* Chat Mode */}
          {chatMode === "chat" && (
            <ChatPanel />
          )}
            </>
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
