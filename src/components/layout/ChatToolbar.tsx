import { useLocaleStore } from "@/stores/useLocaleStore";
import { Download, History, Plus } from "lucide-react";
import type { ExportMessage } from "@/features/conversation-export/exportUtils";
import { cn } from "@/lib/utils";

interface ChatToolbarProps {
  showHistory: boolean;
  onToggleHistory: () => void;
  isExportSelectionMode: boolean;
  isLoading: boolean;
  exportCandidates: ExportMessage[];
  onStartExportSelection: () => void;
  onCancelExportSelection: () => void;
  onNewChat: () => void;
  title?: string;
}

export function ChatToolbar({
  showHistory,
  onToggleHistory,
  isExportSelectionMode,
  isLoading,
  exportCandidates,
  onStartExportSelection,
  onCancelExportSelection,
  onNewChat,
  title,
}: ChatToolbarProps) {
  const { t } = useLocaleStore();

  const pillButton =
    "flex items-center gap-1.5 rounded-ui-sm px-2 h-7 text-ui-caption transition-colors duration-fast ease-out-subtle whitespace-nowrap text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent";

  return (
    <div className="ui-compact-row h-11 flex items-center justify-between px-3 border-b border-border/60 shrink-0 min-w-0">
      <div className="flex items-center gap-1 min-w-0 overflow-hidden">
        {title && (
          <>
            <span
              aria-hidden
              className="mx-0.5 text-muted-foreground/60 shrink-0"
            >
              /
            </span>
            <span className="truncate text-sm font-medium text-foreground">
              {title}
            </span>
          </>
        )}
        <button
          onClick={onToggleHistory}
          className={cn(
            pillButton,
            "ml-1",
            showHistory && "bg-accent text-foreground",
          )}
        >
          <History size={13} />
          <span className="ui-compact-text ui-compact-hide">
            {t.ai.historyChats}
          </span>
        </button>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={
            isExportSelectionMode
              ? onCancelExportSelection
              : onStartExportSelection
          }
          disabled={isLoading || exportCandidates.length === 0}
          className={pillButton}
        >
          <Download size={13} />
          <span className="ui-compact-text ui-compact-hide">
            {isExportSelectionMode
              ? t.ai.exportCancel
              : t.ai.exportConversation}
          </span>
        </button>
        <button onClick={onNewChat} className={pillButton}>
          <Plus size={13} />
          <span className="ui-compact-text ui-compact-hide">
            {t.ai.newChat}
          </span>
        </button>
      </div>
    </div>
  );
}
