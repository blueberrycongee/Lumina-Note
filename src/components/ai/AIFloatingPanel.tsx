/**
 * AI 悬浮面板
 * 在悬浮球模式下显示的 AI 对话面板
 */

import { useRef, useEffect, useState } from "react";
import { useUIStore } from "@/stores/useUIStore";
import { useAIStore } from "@/stores/useAIStore";
import { useRustAgentStore } from "@/stores/useRustAgentStore";
import { useLocaleStore } from "@/stores/useLocaleStore";

import { Bot, Settings, Trash2, Dock } from "lucide-react";
import { AgentPanel } from "../chat/AgentPanel";
import { ConversationList } from "../chat/ConversationList";
import { getDragData } from "@/lib/dragState";
import { PROVIDER_REGISTRY, type LLMProviderType } from "@/services/llm";

interface AIFloatingPanelProps {
  ballPosition: { x: number; y: number };
  onDock: (e: React.MouseEvent) => void;
}

export function AIFloatingPanel({
  ballPosition,
  onDock,
}: AIFloatingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { t } = useLocaleStore();
  const { setFloatingPanelOpen } = useUIStore();
  const { config, setConfig, clearChat } = useAIStore();
  // 使用 Rust Agent store
  void useRustAgentStore();

  const [showSettings, setShowSettings] = useState(false);
  const [isDraggingFileOver, setIsDraggingFileOver] = useState(false);

  // Chat mode removed — no firstLoad check needed

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
        if (!target.closest("[data-floating-ball]")) {
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

  // 监听文件拖拽放置，转发给 ChatInput
  useEffect(() => {
    const handleLuminaDrop = (e: Event) => {
      const { filePath, fileName, x, y } = (e as CustomEvent).detail;
      if (!filePath || !fileName || !panelRef.current) return;

      const rect = panelRef.current.getBoundingClientRect();
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom)
        return;

      window.dispatchEvent(
        new CustomEvent("chat-input-file-drop", {
          detail: { filePath, fileName },
        }),
      );
    };

    window.addEventListener("lumina-drop", handleLuminaDrop);
    return () => window.removeEventListener("lumina-drop", handleLuminaDrop);
  }, []);

  return (
    <div
      ref={panelRef}
      className={`fixed z-50 bg-background border border-border/60 rounded-xl shadow-2xl overflow-hidden transition-all duration-200 ${
        isDraggingFileOver ? "ring-2 ring-primary ring-inset" : ""
      }`}
      style={{
        left: position.x,
        top: position.y,
        width: 420,
        height: 500,
        backgroundColor: "hsl(var(--background))",
      }}
    >
      <div className="flex h-full">
        {/* 可折叠对话列表侧栏 */}
        <ConversationList className="h-full border-r-0" />

        {/* 主内容区 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-3 border-b border-border/60 flex items-center justify-between bg-muted/30">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 px-2 py-1 text-xs">
                <Bot size={12} />
                Agent
              </div>
              <span className="text-xs text-muted-foreground">
                {config.apiKey ? "✓" : t.aiFloatingPanel.notConfigured}
              </span>
            </div>
            <div className="flex gap-1">
              <button
                onClick={clearChat}
                className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-muted"
                title={t.aiFloatingPanel.clearChat}
              >
                <Trash2 size={14} />
              </button>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-muted"
                title={t.aiFloatingPanel.settings}
              >
                <Settings size={14} />
              </button>
              <button
                onClick={onDock}
                className="p-1.5 text-muted-foreground hover:text-primary transition-colors rounded hover:bg-muted"
                title={t.aiFloatingPanel.dockToSidebar}
              >
                <Dock size={14} />
              </button>
            </div>
          </div>

          {/* Settings Panel (Collapsed by default) */}
          {showSettings && (
            <div className="p-3 border-b border-border/60 bg-muted/30 space-y-2 max-h-48 overflow-y-auto">
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    {t.aiFloatingPanel.provider}
                  </label>
                  <select
                    value={config.provider}
                    onChange={(e) => {
                      const provider = e.target.value as LLMProviderType;
                      const providerMeta = PROVIDER_REGISTRY[provider];
                      const defaultModel = providerMeta?.models[0]?.id || "";
                      setConfig({ provider, model: defaultModel });
                    }}
                    className="w-full text-xs p-2 rounded border border-border/60 bg-background"
                  >
                    {Object.entries(PROVIDER_REGISTRY).map(([key, meta]) => (
                      <option key={key} value={key}>
                        {meta.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    API Key
                  </label>
                  <input
                    type="password"
                    value={config.apiKey}
                    onChange={(e) => setConfig({ apiKey: e.target.value })}
                    placeholder="sk-..."
                    className="w-full text-xs p-2 rounded border border-border/60 bg-background"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    {t.aiFloatingPanel.model}
                  </label>
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
                        setConfig({ model: newModel, customModelId: "" });
                      } else {
                        setConfig({ model: newModel });
                      }
                    }}
                    className="w-full text-xs p-2 rounded border border-border/60 bg-background"
                  >
                    {PROVIDER_REGISTRY[
                      config.provider as LLMProviderType
                    ]?.models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                </div>
                {/* 自定义模型 ID 输入框 */}
                {config.model === "custom" && (
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      {t.aiFloatingPanel.customModelId}
                    </label>
                    <input
                      type="text"
                      value={config.customModelId || ""}
                      onChange={(e) =>
                        setConfig({ customModelId: e.target.value })
                      }
                      placeholder={t.aiFloatingPanel.customModelPlaceholder}
                      className="w-full text-xs p-2 rounded border border-border/60 bg-background"
                    />
                  </div>
                )}
                {/* 自定义 Base URL */}
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    {t.aiFloatingPanel.baseUrl}{" "}
                    <span className="text-muted-foreground">
                      ({t.aiFloatingPanel.optional})
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
                    className="w-full text-xs p-2 rounded border border-border/60 bg-background"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Content */}
          <div
            className="flex-1 flex flex-col overflow-hidden"
            style={{
              height: showSettings ? "calc(100% - 200px)" : "calc(100% - 52px)",
            }}
          >
            <AgentPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
