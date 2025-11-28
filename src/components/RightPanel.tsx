import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useUIStore } from "@/stores/useUIStore";
import { useAIStore } from "@/stores/useAIStore";
import { useFileStore } from "@/stores/useFileStore";
import { useNoteIndexStore } from "@/stores/useNoteIndexStore";
import { useRAGStore } from "@/stores/useRAGStore";
import { EditSuggestion, applyEdit } from "@/lib/ai";
import { getFileName } from "@/lib/utils";
import { PROVIDER_REGISTRY, type LLMProviderType } from "@/services/llm";
import {
  BrainCircuit,
  Send,
  AtSign,
  X,
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

// Edit suggestion card
function EditCard({ 
  edit, 
  onApply, 
  onReject 
}: { 
  edit: EditSuggestion; 
  onApply: () => void; 
  onReject: () => void;
}) {
  return (
    <div className="border border-border rounded-lg p-3 bg-muted/30 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-primary flex items-center gap-1">
          <FileText size={12} />
          {edit.filePath.split(/[/\\]/).pop()}
        </span>
        <div className="flex gap-1">
          <button
            onClick={onApply}
            className="px-2 py-1 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors text-xs font-medium"
            title="预览修改"
          >
            预览
          </button>
          <button
            onClick={onReject}
            className="p-1 rounded bg-red-500/20 text-red-600 hover:bg-red-500/30 transition-colors"
            title="忽略"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{edit.description}</p>
      <div className="text-xs space-y-1">
        <div className="bg-red-500/10 text-red-600 p-2 rounded font-mono line-through">
          {edit.originalContent.slice(0, 100)}...
        </div>
        <div className="bg-green-500/10 text-green-600 p-2 rounded font-mono">
          {edit.newContent.slice(0, 100)}...
        </div>
      </div>
    </div>
  );
}

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
  } = useUIStore();
  const { 
    messages, 
    isLoading, 
    error, 
    referencedFiles,
    pendingEdits,
    config,
    sendMessage, 
    clearChat,
    addFileReference,
    removeFileReference,
    clearPendingEdits,
    setConfig,
    setPendingDiff,
  } = useAIStore();
  const { currentFile, currentContent, fileTree } = useFileStore();
  const { 
    config: ragConfig, 
    setConfig: setRAGConfig, 
    isIndexing: ragIsIndexing,
    indexStatus,
    rebuildIndex,
  } = useRAGStore();
  
  const [inputValue, setInputValue] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom (only within chat container, not affecting page)
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

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

  // Get current file info for AI context
  const currentFileInfo = useMemo(() => {
    if (!currentFile) return null;
    const name = currentFile.split(/[/\\]/).pop()?.replace(/\.md$/, "") || "";
    return {
      path: currentFile,
      name,
      content: currentContent,
    };
  }, [currentFile, currentContent]);

  // Handle send message
  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;
    
    const message = inputValue;
    setInputValue("");
    // Pass current file if no manual references added
    await sendMessage(message, currentFileInfo || undefined);
  }, [inputValue, isLoading, sendMessage, currentFileInfo]);

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Preview edit in diff view
  const handlePreviewEdit = useCallback((edit: EditSuggestion) => {
    console.log("[Preview] Edit:", edit);
    console.log("[Preview] currentFileInfo:", currentFileInfo);
    console.log("[Preview] referencedFiles:", referencedFiles);
    
    // Normalize file name for comparison
    const editFileName = edit.filePath.replace(/\.md$/, "").toLowerCase();
    
    // Find the file - first check referencedFiles
    let file = referencedFiles.find(f => {
      const refName = f.name.replace(/\.md$/, "").toLowerCase();
      return f.path.toLowerCase().includes(editFileName) || 
             refName.includes(editFileName) ||
             editFileName.includes(refName);
    });
    
    // If not found in referenced files, check current file (auto context)
    // This is the most common case when user doesn't manually add files
    if (!file && currentFileInfo) {
      const currentName = currentFileInfo.name.toLowerCase();
      if (
        currentFileInfo.path.toLowerCase().includes(editFileName) ||
        currentName.includes(editFileName) ||
        editFileName.includes(currentName) ||
        // Also try exact match without extension
        currentName === editFileName
      ) {
        file = currentFileInfo;
      }
    }
    
    // If still not found but we have current file, just use it (AI is likely modifying current file)
    if (!file && currentFileInfo && currentFileInfo.content) {
      console.log("[Preview] Using current file as fallback");
      file = currentFileInfo;
    }
    
    console.log("[Preview] Matched file:", file);
    
    if (file && file.content) {
      const newContent = applyEdit(file.content, edit);
      console.log("[Preview] Original length:", file.content.length);
      console.log("[Preview] Modified length:", newContent.length);
      
      // Set pending diff to show in main view
      setPendingDiff({
        fileName: file.name,
        filePath: file.path,
        original: file.content,
        modified: newContent,
        description: edit.description,
      });
      console.log("[Preview] setPendingDiff called");
    } else {
      console.error("[Preview] No file found or no content");
      alert("❌ 找不到要修改的文件");
    }
  }, [referencedFiles, currentFileInfo, setPendingDiff]);

  // Flatten file tree for picker
  const flattenFiles = (entries: typeof fileTree, result: {path: string; name: string}[] = []): {path: string; name: string}[] => {
    for (const entry of entries) {
      if (entry.is_dir && entry.children) {
        flattenFiles(entry.children, result);
      } else if (!entry.is_dir) {
        result.push({ path: entry.path, name: entry.name });
      }
    }
    return result;
  };

  const allFiles = flattenFiles(fileTree);

  return (
    <aside className="w-full h-full bg-background border-l border-border flex flex-col transition-colors duration-300">
      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setRightPanelTab("chat")}
          className={`flex-1 py-2.5 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
            rightPanelTab === "chat"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title="AI 助手"
        >
          {chatMode === "agent" ? <Bot size={12} /> : <BrainCircuit size={12} />}
          <span className="hidden sm:inline">AI</span>
        </button>
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

      {/* Chat Interface */}
      {rightPanelTab === "chat" && (
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

          {/* Settings Panel */}
          {showSettings && (
            <div className="p-3 border-b border-border bg-muted/30 space-y-3 max-h-80 overflow-y-auto">
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
                    value={config.model}
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
                {/* 自定义 Base URL (高级选项) */}
                {(config.provider === "openai" || config.provider === "ollama") && (
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      Base URL <span className="text-muted-foreground">(可选)</span>
                    </label>
                    <input
                      type="text"
                      value={config.baseUrl || ""}
                      onChange={(e) => setConfig({ baseUrl: e.target.value || undefined })}
                      placeholder={PROVIDER_REGISTRY[config.provider]?.defaultBaseUrl}
                      className="w-full text-xs p-2 rounded border border-border bg-background"
                    />
                  </div>
                )}
              </div>

              {/* RAG Settings */}
              <div className="space-y-2 pt-2 border-t border-border">
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
                      <label className="text-xs text-muted-foreground block mb-1">Embedding 模型</label>
                      <select
                        value={ragConfig.embeddingModel}
                        onChange={(e) => setRAGConfig({ embeddingModel: e.target.value })}
                        className="w-full text-xs p-2 rounded border border-border bg-background"
                      >
                        {ragConfig.embeddingProvider === "openai" && (
                          <>
                            <option value="text-embedding-3-small">text-embedding-3-small</option>
                            <option value="text-embedding-3-large">text-embedding-3-large</option>
                            <option value="text-embedding-ada-002">text-embedding-ada-002</option>
                          </>
                        )}
                        {ragConfig.embeddingProvider === "ollama" && (
                          <>
                            <option value="nomic-embed-text">nomic-embed-text</option>
                            <option value="mxbai-embed-large">mxbai-embed-large</option>
                            <option value="all-minilm">all-minilm</option>
                          </>
                        )}
                      </select>
                    </div>

                    {/* Index Status */}
                    <div className="bg-muted/50 rounded p-2 space-y-1">
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
                      {indexStatus && (
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
          )}

          {/* Agent Mode */}
          {chatMode === "agent" && (
            <div className="flex-1 overflow-hidden">
              <AgentPanel />
            </div>
          )}

          {/* Chat Mode */}
          {chatMode === "chat" && (
            <>
          {/* Context indicator - shows which file(s) will be sent to AI */}
          <div className="p-2 border-b border-border">
            <div className="text-xs text-muted-foreground mb-1">上下文:</div>
            <div className="flex flex-wrap gap-1">
              {referencedFiles.length > 0 ? (
                // Show manually added files
                referencedFiles.map((file) => (
                  <span
                    key={file.path}
                    className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-1 rounded"
                  >
                    <FileText size={10} />
                    {file.name}
                    <button onClick={() => removeFileReference(file.path)}>
                      <X size={10} />
                    </button>
                  </span>
                ))
              ) : currentFileInfo ? (
                // Show current focused file (auto)
                <span className="inline-flex items-center gap-1 text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
                  <FileText size={10} />
                  {currentFileInfo.name}
                  <span className="text-[10px] opacity-60">(自动)</span>
                </span>
              ) : (
                <span className="text-xs text-muted-foreground/60">无文件</span>
              )}
            </div>
          </div>

          {/* Chat History */}
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* Welcome message */}
            {messages.length === 0 && (
              <div className="text-sm text-muted-foreground leading-relaxed">
                <p>你好！我可以帮你编辑笔记。</p>
                <p className="mt-2 text-xs opacity-70">当前笔记会自动作为上下文</p>
              </div>
            )}

            {/* Messages - Windsurf style */}
            {messages.map((msg, idx) => (
              <div key={idx} className={`${msg.role === "user" ? "flex justify-end" : ""}`}>
                {msg.role === "user" ? (
                  // User message - right aligned, blue background
                  <div className="max-w-[85%] bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2.5 text-sm">
                    {msg.content}
                  </div>
                ) : (
                  // AI message - left aligned, simple text
                  <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </div>
                )}
              </div>
            ))}

            {/* Pending edits */}
            {pendingEdits.length > 0 && (
              <div className="space-y-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <p className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">
                  📝 待确认的修改 ({pendingEdits.length})
                </p>
                {pendingEdits.map((edit, idx) => (
                  <EditCard
                    key={idx}
                    edit={edit}
                    onApply={() => handlePreviewEdit(edit)}
                    onReject={clearPendingEdits}
                  />
                ))}
              </div>
            )}

            {/* Loading */}
            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                <span>思考中...</span>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="text-sm text-red-500 p-2 bg-red-500/10 rounded">
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* File Picker */}
          {showFilePicker && (
            <div className="absolute bottom-24 left-3 right-3 bg-background border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
              {allFiles.map((file) => (
                <button
                  key={file.path}
                  onClick={() => {
                    addFileReference(file.path, file.name);
                    setShowFilePicker(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                >
                  <FileText size={12} />
                  {file.name}
                </button>
              ))}
            </div>
          )}

          {/* Input Area */}
          <div className="p-3 border-t border-border">
            <div className="bg-muted/30 border border-border rounded-lg p-2 focus-within:ring-1 focus-within:ring-primary/50 transition-all">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入消息..."
                className="w-full bg-transparent resize-none outline-none text-sm min-h-[60px] max-h-32 text-foreground placeholder-muted-foreground"
              />
              <div className="flex justify-between items-center mt-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowFilePicker(!showFilePicker)}
                    className="text-muted-foreground hover:text-foreground transition-colors p-1"
                    title="引用文件"
                  >
                    <AtSign size={14} />
                  </button>
                  <span className="text-xs text-muted-foreground/60">
                    @ 添加文件
                  </span>
                </div>
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isLoading}
                  className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded p-1.5 transition-colors"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
            </>
          )}
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
