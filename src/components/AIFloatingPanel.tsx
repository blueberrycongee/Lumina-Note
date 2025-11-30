/**
 * AI 悬浮面板
 * 在悬浮球模式下显示的 AI 对话面板
 */

import React, { useRef, useEffect, useState } from "react";
import { useUIStore } from "@/stores/useUIStore";
import { useAIStore } from "@/stores/useAIStore";
import { useFileStore } from "@/stores/useFileStore";
import { 
  Bot, 
  BrainCircuit, 
  Settings, 
  Trash2, 
  Dock,
  Loader2,
} from "lucide-react";
import { AgentPanel } from "./AgentPanel";
import { ConversationList } from "./ConversationList";
import { ChatInput, type ReferencedFile } from "./ChatInput";
import { PROVIDER_REGISTRY, type LLMProviderType } from "@/services/llm";
import { readFile } from "@/lib/tauri";

interface AIFloatingPanelProps {
  ballPosition: { x: number; y: number };
  onDock: (e: React.MouseEvent) => void;
}

export function AIFloatingPanel({ ballPosition, onDock }: AIFloatingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { chatMode, setChatMode, setFloatingPanelOpen } = useUIStore();
  const { 
    config, 
    setConfig, 
    clearChat,
    messages,
    isLoading,
    isStreaming,
    streamingContent,
    streamingReasoning,
    error,
    sendMessageStream,
    stopStreaming,
  } = useAIStore();
  const { currentFile, currentContent } = useFileStore();

  const [showSettings, setShowSettings] = useState(false);
  const [inputValue, setInputValue] = useState("");

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, streamingContent, streamingReasoning]);

  // 计算面板位置（在悬浮球旁边）
  const getPanelPosition = () => {
    const panelWidth = 420;
    const panelHeight = 500;
    const padding = 16;
    const ballSize = 56; // 悬浮球大小
    const gap = 12; // 面板与悬浮球的间距
    
    // 默认显示在悬浮球左侧
    let x = ballPosition.x - panelWidth - gap;
    let y = ballPosition.y - panelHeight / 2 + ballSize / 2;
    
    // 边界检测：如果左侧放不下，显示在右侧
    if (x < padding) {
      x = ballPosition.x + ballSize + gap;
    }
    if (y < padding) {
      y = padding;
    }
    if (y + panelHeight > window.innerHeight - padding) {
      y = window.innerHeight - panelHeight - padding;
    }
    
    return { x, y };
  };

  const position = getPanelPosition();

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        // 检查是否点击了悬浮球
        const target = e.target as HTMLElement;
        if (!target.closest('[data-floating-ball]')) {
          setFloatingPanelOpen(false);
        }
      }
    };

    // 延迟添加事件监听，避免立即触发
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [setFloatingPanelOpen]);

  return (
    <div
      ref={panelRef}
      className="fixed z-50 bg-background border border-border rounded-xl shadow-2xl overflow-hidden"
      style={{
        left: position.x,
        top: position.y,
        width: 420,
        height: 500,
      }}
    >
      <div className="flex h-full">
        {/* 可折叠对话列表侧栏 */}
        <ConversationList className="h-full border-r-0" />
        
        {/* 主内容区 */}
        <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between bg-muted/30">
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
              title="Agent 模式"
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
              title="对话模式"
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
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-muted"
            title="清空对话"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-muted"
            title="设置"
          >
            <Settings size={14} />
          </button>
          <button
            onClick={onDock}
            className="p-1.5 text-muted-foreground hover:text-primary transition-colors rounded hover:bg-muted"
            title="回归侧栏"
          >
            <Dock size={14} />
          </button>
        </div>
      </div>

      {/* Settings Panel (Collapsed by default) */}
      {showSettings && (
        <div className="p-3 border-b border-border bg-muted/30 space-y-2 max-h-48 overflow-y-auto">
          <div className="space-y-2">
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
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">API Key</label>
              <input
                type="password"
                value={config.apiKey}
                onChange={(e) => setConfig({ apiKey: e.target.value })}
                placeholder="sk-..."
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
                    {model.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ height: showSettings ? 'calc(100% - 200px)' : 'calc(100% - 52px)' }}>
        {chatMode === "agent" ? (
          <AgentPanel />
        ) : (
          <div className="flex flex-col h-full overflow-hidden">
              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {messages.length === 0 && !isStreaming && (
                <div className="text-sm text-muted-foreground leading-relaxed">
                  <p>你好！我可以帮你编辑笔记。</p>
                </div>
              )}
              {messages.map((msg, idx) => (
                <div key={idx} className={`${msg.role === "user" ? "flex justify-end" : ""}`}>
                  {msg.role === "user" ? (
                    <div className="max-w-[85%] bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-3 py-2 text-sm">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  )}
                </div>
              ))}
              
              {/* 流式内容显示 */}
              {isStreaming && (
                <div className="space-y-2">
                  {streamingReasoning && (
                    <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded border-l-2 border-yellow-500">
                      <div className="font-medium mb-1">💭 思考中...</div>
                      <div className="whitespace-pre-wrap opacity-70">{streamingReasoning}</div>
                    </div>
                  )}
                  {streamingContent && (
                    <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                      {streamingContent}
                      <span className="inline-block w-2 h-4 bg-primary/50 animate-pulse ml-0.5" />
                    </div>
                  )}
                  {!streamingContent && !streamingReasoning && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 size={14} className="animate-spin" />
                      <span>连接中...</span>
                    </div>
                  )}
                </div>
              )}
              
              {isLoading && !isStreaming && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 size={14} className="animate-spin" />
                  <span>思考中...</span>
                </div>
              )}
              {error && (
                <div className="text-sm text-red-500 p-2 bg-red-500/10 rounded">
                  {error}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            
            {/* Input */}
            <div className="p-2 border-t border-border">
              <ChatInput
                value={inputValue}
                onChange={setInputValue}
                onSend={handleSendWithFiles}
                isLoading={isLoading}
                isStreaming={isStreaming}
                onStop={stopStreaming}
                placeholder="输入消息... (@ 引用文件)"
                rows={2}
              />
            </div>
          </div>
        )}
      </div>
      </div>
      </div>
    </div>
  );

  // 发送消息（流式）- 支持引用文件
  async function handleSendWithFiles(message: string, referencedFiles: ReferencedFile[]) {
    if ((!message.trim() && referencedFiles.length === 0) || isLoading || isStreaming) return;
    
    // 构建文件上下文
    let contextContent = "";
    
    // 添加引用文件的内容
    for (const file of referencedFiles) {
      if (!file.isFolder) {
        try {
          const content = await readFile(file.path);
          contextContent += `\n\n--- 引用文件: ${file.name} ---\n${content}`;
        } catch (e) {
          console.error(`Failed to read file ${file.path}:`, e);
        }
      }
    }
    
    // 如果没有引用文件，使用当前文件作为上下文
    const fileContext = referencedFiles.length > 0 
      ? { path: "", name: "引用文件", content: contextContent.trim() }
      : currentFile 
        ? { path: currentFile, name: currentFile.split(/[/\\]/).pop() || "", content: currentContent }
        : undefined;
    
    sendMessageStream(message.trim(), fileContext);
    setInputValue("");
  }
}

