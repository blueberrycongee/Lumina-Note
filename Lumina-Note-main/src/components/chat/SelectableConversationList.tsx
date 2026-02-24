import { motion } from "framer-motion";
import { Bot, Check } from "lucide-react";

import { parseMarkdown } from "@/services/markdown/markdown";
import type { ExportMessage } from "@/features/conversation-export/exportUtils";

interface SelectableConversationListProps {
  messages: ExportMessage[];
  selectedIds: Set<string>;
  onToggleMessage: (id: string) => void;
  emptyText: string;
  roleLabels: {
    user: string;
    assistant: string;
  };
}

export function SelectableConversationList({
  messages,
  selectedIds,
  onToggleMessage,
  emptyText,
  roleLabels,
}: SelectableConversationListProps) {
  if (messages.length === 0) {
    return (
      <div className="mb-6 rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <>
      {messages.map((message) => {
        const isUser = message.role === "user";
        const checked = selectedIds.has(message.id);

        return (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-5 flex items-start gap-3 ${isUser ? "justify-end" : "justify-start"}`}
          >
            {!isUser && (
              <div className="mt-1 w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center shrink-0">
                <Bot size={16} className="text-muted-foreground" />
              </div>
            )}

            <button
              type="button"
              onClick={() => onToggleMessage(message.id)}
              className={`max-w-[80%] text-left rounded-2xl border transition-all ${
                checked
                  ? "border-primary/70 ring-1 ring-primary/40 bg-primary/5"
                  : "border-border hover:border-primary/30 hover:bg-muted/30"
              } ${isUser ? "rounded-tr-sm bg-muted px-4 py-2.5" : "px-4 py-3 bg-background"}`}
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {message.role === "user" ? roleLabels.user : roleLabels.assistant}
                </span>
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center ${
                    checked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/40"
                  }`}
                >
                  {checked && <Check size={12} />}
                </span>
              </div>

              {isUser ? (
                <div className="text-sm text-foreground whitespace-pre-wrap break-words">
                  {message.content}
                </div>
              ) : (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none leading-relaxed text-foreground"
                  dangerouslySetInnerHTML={{ __html: parseMarkdown(message.content) }}
                />
              )}
            </button>
          </motion.div>
        );
      })}
    </>
  );
}
