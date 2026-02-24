/**
 * 流式消息显示组件
 * 
 * 统一处理 Agent 和 Chat 模式的流式输出渲染
 * - Agent 模式：从 useRustAgentStore 获取 streamingContent
 * - Chat 模式：从 useAIStore 获取 streamingContent
 */

import { memo, useMemo } from "react";
import { Bot } from "lucide-react";
import { parseMarkdown } from "@/services/markdown/markdown";
import { useAIStore } from "@/stores/useAIStore";
import { useRustAgentStore } from "@/stores/useRustAgentStore";
import { useUIStore } from "@/stores/useUIStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { ThinkingCollapsible } from "./AgentMessageRenderer";
import { AssistantDiagramPanels } from "./AssistantDiagramPanels";
import { getDiagramAttachmentFilePaths } from "./diagramAttachmentUtils";
import { getUserMessageDisplay } from "./messageContentUtils";

interface StreamingMessageProps {
  /** 强制指定模式，不指定则自动从 UIStore 获取 */
  mode?: "agent" | "chat";
  /** 自定义类名 */
  className?: string;
  /** 可选：直接传入流式阶段要展示的图文件列表 */
  diagramPaths?: string[];
}

/**
 * 流式消息组件
 * 
 * 根据当前模式自动选择数据源，渲染流式输出内容
 */
export const StreamingMessage = memo(function StreamingMessage({ 
  mode,
  className = "",
  diagramPaths,
}: StreamingMessageProps) {
  const { t } = useLocaleStore();
  const chatMode = useUIStore((state) => state.chatMode);
  const currentMode = mode ?? chatMode;
  
  // Agent 模式数据
  const agentContent = useRustAgentStore((state) => state.streamingContent);
  const agentStatus = useRustAgentStore((state) => state.status);
  
  // Chat 模式数据
  const chatContent = useAIStore((state) => state.streamingContent);
  const chatStreaming = useAIStore((state) => state.isStreaming);
  const chatReasoning = useAIStore((state) => state.streamingReasoning);
  const chatReasoningStatus = useAIStore((state) => state.streamingReasoningStatus);
  const chatMessages = useAIStore((state) => state.messages);

  // Agent 思考流
  const agentReasoning = useRustAgentStore((state) => state.streamingReasoning);
  const agentReasoningStatus = useRustAgentStore((state) => state.streamingReasoningStatus);
  const agentMessages = useRustAgentStore((state) => state.messages);
  
  // 根据模式选择数据
  const content = currentMode === "agent" ? agentContent : chatContent;
  const reasoning = currentMode === "agent" ? agentReasoning : chatReasoning;
  const reasoningStatus = currentMode === "agent" ? agentReasoningStatus : chatReasoningStatus;
  const hasReasoningPanel = reasoningStatus !== "idle" || reasoning.trim().length > 0;
  const isStreaming = currentMode === "agent"
    ? agentStatus === "running" && (agentContent.length > 0 || hasReasoningPanel)
    : chatStreaming && (chatContent.length > 0 || hasReasoningPanel);
  const resolvedDiagramPaths = useMemo(() => {
    if (diagramPaths && diagramPaths.length > 0) {
      return diagramPaths;
    }

    const sourceMessages = currentMode === "agent" ? agentMessages : chatMessages;
    for (let i = sourceMessages.length - 1; i >= 0; i -= 1) {
      const message = sourceMessages[i];
      if (message.role !== "user") continue;
      const { attachments } = getUserMessageDisplay(message.content, message.attachments);
      return getDiagramAttachmentFilePaths(attachments);
    }
    return [];
  }, [agentMessages, chatMessages, currentMode, diagramPaths]);

  // 不在流式状态或没有内容时不渲染
  if (!isStreaming || (!content && !hasReasoningPanel)) {
    return null;
  }

  return (
    <div className={`flex gap-3 mb-6 ${className}`}>
      <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center shrink-0">
        <Bot size={16} className="text-muted-foreground" />
      </div>
      <div className="max-w-[80%] text-foreground">
        {resolvedDiagramPaths.length > 0 && (
          <AssistantDiagramPanels filePaths={resolvedDiagramPaths} className="mb-2" />
        )}
        {hasReasoningPanel && (
          <ThinkingCollapsible
            thinking={reasoning}
            t={t}
            status={reasoningStatus === "streaming" ? "thinking" : "done"}
          />
        )}
        {content && (
          <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed streaming-content-enter">
            <span dangerouslySetInnerHTML={{ __html: parseMarkdown(content) }} />
          </div>
        )}
        {content && (
          <div className="mt-2 flex items-center gap-1.5" aria-hidden>
            <span className="streaming-dot" style={{ animationDelay: "0ms" }} />
            <span className="streaming-dot" style={{ animationDelay: "160ms" }} />
            <span className="streaming-dot" style={{ animationDelay: "320ms" }} />
          </div>
        )}
      </div>
    </div>
  );
});

interface TypingIndicatorProps {
  /** 强制指定模式 */
  mode?: "agent" | "chat";
  /** 自定义类名 */
  className?: string;
  /** 可选：直接传入流式阶段要展示的图文件列表 */
  diagramPaths?: string[];
}

/**
 * 打字指示器组件
 * 
 * 在等待首个 token 时显示跳动的点
 */
export const TypingIndicator = memo(function TypingIndicator({
  mode,
  className = "",
  diagramPaths,
}: TypingIndicatorProps) {
  const chatMode = useUIStore((state) => state.chatMode);
  const currentMode = mode ?? chatMode;
  
  // Agent 模式数据
  const agentContent = useRustAgentStore((state) => state.streamingContent);
  const agentStatus = useRustAgentStore((state) => state.status);
  
  // Chat 模式数据
  const chatContent = useAIStore((state) => state.streamingContent);
  const chatStreaming = useAIStore((state) => state.isStreaming);
  const chatLoading = useAIStore((state) => state.isLoading);
  const chatReasoningStatus = useAIStore((state) => state.streamingReasoningStatus);
  const chatMessages = useAIStore((state) => state.messages);
  const isChatWaiting =
    (chatStreaming || chatLoading) &&
    chatContent.length === 0 &&
    chatReasoningStatus === "idle";

  const agentReasoningStatus = useRustAgentStore((state) => state.streamingReasoningStatus);
  const agentMessages = useRustAgentStore((state) => state.messages);
  const isAgentWaiting =
    agentStatus === "running" &&
    agentContent.length === 0 &&
    agentReasoningStatus === "idle";
  // 根据模式选择
  const isWaiting = currentMode === "agent" ? isAgentWaiting : isChatWaiting;
  const resolvedDiagramPaths = useMemo(() => {
    if (diagramPaths && diagramPaths.length > 0) {
      return diagramPaths;
    }

    const sourceMessages = currentMode === "agent" ? agentMessages : chatMessages;
    for (let i = sourceMessages.length - 1; i >= 0; i -= 1) {
      const message = sourceMessages[i];
      if (message.role !== "user") continue;
      const { attachments } = getUserMessageDisplay(message.content, message.attachments);
      return getDiagramAttachmentFilePaths(attachments);
    }
    return [];
  }, [agentMessages, chatMessages, currentMode, diagramPaths]);

  if (!isWaiting) {
    return null;
  }

  return (
    <div className={`flex gap-3 mb-6 ${className}`}>
      <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center shrink-0">
        <Bot size={16} className="text-muted-foreground" />
      </div>
      <div className="max-w-[80%] text-foreground">
        {resolvedDiagramPaths.length > 0 && (
          <AssistantDiagramPanels filePaths={resolvedDiagramPaths} className="mb-2" />
        )}
        <div className="flex items-center gap-1.5 h-8 streaming-content-enter" aria-hidden>
          <span className="streaming-dot" style={{ animationDelay: "0ms" }} />
          <span className="streaming-dot" style={{ animationDelay: "160ms" }} />
          <span className="streaming-dot" style={{ animationDelay: "320ms" }} />
        </div>
      </div>
    </div>
  );
});

/**
 * 组合组件：流式消息 + 打字指示器
 * 
 * 自动处理两种状态的切换
 */
export const StreamingOutput = memo(function StreamingOutput({
  mode,
  className = "",
  diagramPaths,
}: StreamingMessageProps) {
  return (
    <>
      <TypingIndicator mode={mode} className={className} diagramPaths={diagramPaths} />
      <StreamingMessage mode={mode} className={className} diagramPaths={diagramPaths} />
    </>
  );
});
