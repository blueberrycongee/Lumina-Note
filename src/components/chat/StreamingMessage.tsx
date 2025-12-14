/**
 * 流式消息显示组件
 * 直接从 useAIStore 获取状态，无需额外订阅机制
 */

import { memo } from "react";
import { Bot } from "lucide-react";
import { parseMarkdown } from "@/services/markdown/markdown";
import { useAIStore } from "@/stores/useAIStore";
import { useUIStore } from "@/stores/useUIStore";

// 流式消息组件 - 直接从 Zustand 获取状态
export const StreamingMessage = memo(function StreamingMessage() {
  const content = useAIStore((state) => state.streamingContent);
  const streaming = useAIStore((state) => state.isStreaming);
  const chatMode = useUIStore((state) => state.chatMode);

  // 只在 chat 模式下显示
  if (chatMode !== "chat" || !streaming || !content) {
    return null;
  }

  return (
    <div className="flex gap-3 mb-6">
      <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center shrink-0">
        <Bot size={16} className="text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="p-3 rounded-xl bg-muted/50 text-sm max-w-[80%]">
          <div 
            className="prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: parseMarkdown(content) }}
          />
          <span className="inline-block w-2 h-4 bg-primary/50 animate-pulse ml-0.5" />
        </div>
      </div>
    </div>
  );
});

// 打字指示器组件
export const TypingIndicator = memo(function TypingIndicator() {
  const content = useAIStore((state) => state.streamingContent);
  const streaming = useAIStore((state) => state.isStreaming);
  const chatMode = useUIStore((state) => state.chatMode);

  // 只在 chat 模式、流式中且没有内容时显示
  if (chatMode !== "chat" || !streaming || content) {
    return null;
  }

  return (
    <div className="flex gap-3 mb-6">
      <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center shrink-0">
        <Bot size={16} className="text-muted-foreground" />
      </div>
      <div className="flex items-center gap-1 h-8">
        <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );
});
