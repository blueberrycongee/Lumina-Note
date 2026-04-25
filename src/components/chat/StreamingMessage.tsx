/**
 * 流式消息显示组件。
 *
 * Agent 模式下 opencode 已经在 messages[] 里流式更新文本,
 * AgentMessageRenderer 会直接渲染,这里的 streamingContent 字段
 * 保持为空是故意的 —— 避免同一段文本被渲染两次。
 * TypingIndicator 仍然基于 status==="running" 的瞬态显示等待点。
 *
 */

import { memo, useMemo } from "react";
import { parseMarkdown } from "@/services/markdown/markdown";
import { useOpencodeAgent } from "@/stores/useOpencodeAgent";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { ThinkingCollapsible } from "./AgentMessageRenderer";
import { AssistantDiagramPanels } from "./AssistantDiagramPanels";
import { getDiagramAttachmentFilePaths } from "./diagramAttachmentUtils";
import { getUserMessageDisplay } from "./messageContentUtils";

interface StreamingMessageProps {
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
  className = "",
  diagramPaths,
}: StreamingMessageProps) {
  const { t } = useLocaleStore();

  // Agent 模式数据
  const agentContent = useOpencodeAgent((state) => state.streamingContent);
  const agentStatus = useOpencodeAgent((state) => state.status);



  // Agent 思考流
  const agentReasoning = useOpencodeAgent((state) => state.streamingReasoning);
  const agentReasoningStatus = useOpencodeAgent(
    (state) => state.streamingReasoningStatus,
  );
  const agentMessages = useOpencodeAgent((state) => state.messages);

  const content = agentContent;
  const reasoning = agentReasoning;
  const reasoningStatus = agentReasoningStatus;
  const hasReasoningPanel =
    reasoningStatus !== "idle" || reasoning.trim().length > 0;
  const isStreaming =
    agentStatus === "running" &&
    (agentContent.length > 0 || hasReasoningPanel);
  const resolvedDiagramPaths = useMemo(() => {
    if (diagramPaths && diagramPaths.length > 0) {
      return diagramPaths;
    }

    const sourceMessages =
      agentMessages;
    for (let i = sourceMessages.length - 1; i >= 0; i -= 1) {
      const message = sourceMessages[i];
      if (message.role !== "user") continue;
      const { attachments } = getUserMessageDisplay(
        message.content,
        message.attachments,
      );
      return getDiagramAttachmentFilePaths(attachments);
    }
    return [];
  }, [agentMessages, diagramPaths]);

  // 不在流式状态或没有内容时不渲染
  if (!isStreaming || (!content && !hasReasoningPanel)) {
    return null;
  }

  return (
    <div className={`flex gap-3 mb-6 ${className}`}>
      <div className="max-w-[80%] text-foreground">
        {resolvedDiagramPaths.length > 0 && (
          <AssistantDiagramPanels
            filePaths={resolvedDiagramPaths}
            className="mb-2"
          />
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
            <span
              dangerouslySetInnerHTML={{ __html: parseMarkdown(content) }}
            />
            <span
              className="ml-1 inline-flex items-center gap-1 align-middle"
              aria-hidden
            >
              <span
                className="streaming-dot"
                style={{ animationDelay: "0ms" }}
              />
              <span
                className="streaming-dot"
                style={{ animationDelay: "160ms" }}
              />
              <span
                className="streaming-dot"
                style={{ animationDelay: "320ms" }}
              />
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

interface TypingIndicatorProps {
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
  className = "",
  diagramPaths,
}: TypingIndicatorProps) {

  // Agent 模式数据
  const agentContent = useOpencodeAgent((state) => state.streamingContent);
  const agentStatus = useOpencodeAgent((state) => state.status);



  const agentReasoningStatus = useOpencodeAgent(
    (state) => state.streamingReasoningStatus,
  );
  const agentMessages = useOpencodeAgent((state) => state.messages);
  // Hide the standalone typing indicator as soon as the current assistant
  // turn has any renderable opencode part (text / reasoning / tool). After
  // that point AgentMessageRenderer shows its own bot avatar + streaming
  // content, so keeping the typing bubble here would paint a second avatar
  // next to the first while tokens stream in.
  const latestAssistantHasContent = (() => {
    for (let i = agentMessages.length - 1; i >= 0; i--) {
      const msg = agentMessages[i];
      if (msg.role === "user") break;
      if (msg.role !== "assistant") continue;
      const parts = msg.rawParts ?? [];
      const hasVisible = parts.some(
        (p) =>
          p.type === "text" ||
          p.type === "reasoning" ||
          p.type === "tool",
      );
      if (hasVisible) return true;
    }
    return false;
  })();
  const isAgentWaiting =
    agentStatus === "running" &&
    agentContent.length === 0 &&
    agentReasoningStatus === "idle" &&
    !latestAssistantHasContent;
  const isWaiting = isAgentWaiting;
  const resolvedDiagramPaths = useMemo(() => {
    if (diagramPaths && diagramPaths.length > 0) {
      return diagramPaths;
    }

    const sourceMessages =
      agentMessages;
    for (let i = sourceMessages.length - 1; i >= 0; i -= 1) {
      const message = sourceMessages[i];
      if (message.role !== "user") continue;
      const { attachments } = getUserMessageDisplay(
        message.content,
        message.attachments,
      );
      return getDiagramAttachmentFilePaths(attachments);
    }
    return [];
  }, [agentMessages, diagramPaths]);

  if (!isWaiting) {
    return null;
  }

  return (
    <div className={`flex gap-3 mb-6 ${className}`}>
      <div className="max-w-[80%] text-foreground">
        {resolvedDiagramPaths.length > 0 && (
          <AssistantDiagramPanels
            filePaths={resolvedDiagramPaths}
            className="mb-2"
          />
        )}
        <div
          className="streaming-content-enter flex h-8 items-center gap-1.5"
          aria-hidden
        >
          <span className="streaming-dot" style={{ animationDelay: "0ms" }} />
          <span className="streaming-dot" style={{ animationDelay: "140ms" }} />
          <span className="streaming-dot" style={{ animationDelay: "280ms" }} />
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
  className = "",
  diagramPaths,
}: StreamingMessageProps) {
  return (
    <>
      <TypingIndicator
        className={className}
        diagramPaths={diagramPaths}
      />
      <StreamingMessage
        className={className}
        diagramPaths={diagramPaths}
      />
    </>
  );
});
