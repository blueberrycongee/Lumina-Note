import { useLocaleStore } from "@/stores/useLocaleStore";
import { Download, History, MessageSquare, Plus, Sidebar } from "lucide-react";
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
  onToggleLeftSidebar?: () => void;
  onToggleRightSidebar?: () => void;
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
  onToggleLeftSidebar,
  onToggleRightSidebar,
  title,
}: ChatToolbarProps) {
  const { t } = useLocaleStore();

  return (
    <div className="ui-compact-row h-10 flex items-center justify-between px-4 border-b border-border/50 shrink-0 min-w-0">
      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
        {onToggleLeftSidebar && (
          <button
            onClick={onToggleLeftSidebar}
            className="p-1 hover:bg-accent rounded transition-colors hover:text-foreground text-muted-foreground shrink-0"
            title={t.sidebar.toggleSidebar}
          >
            <Sidebar size={16} />
          </button>
        )}
        {title && (
          <>
            <span className="text-muted-foreground/50 shrink-0">/</span>
            <span className="text-sm text-foreground font-medium truncate">
              {title}
            </span>
          </>
        )}
        <button
          onClick={onToggleHistory}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 text-xs rounded-md transition-colors whitespace-nowrap",
            showHistory
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <History size={14} />
          <span className="ui-compact-text ui-compact-hide">
            {t.ai.historyChats}
          </span>
        </button>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={
            isExportSelectionMode
              ? onCancelExportSelection
              : onStartExportSelection
          }
          disabled={isLoading || exportCandidates.length === 0}
          className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download size={14} />
          <span className="ui-compact-text ui-compact-hide">
            {isExportSelectionMode
              ? t.ai.exportCancel
              : t.ai.exportConversation}
          </span>
        </button>
        <button
          onClick={onNewChat}
          className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors whitespace-nowrap"
        >
          <Plus size={14} />
          <span className="ui-compact-text ui-compact-hide">
            {t.ai.newChat}
          </span>
        </button>
        {onToggleRightSidebar && (
          <button
            onClick={onToggleRightSidebar}
            className="p-1 hover:bg-accent rounded transition-colors hover:text-foreground text-muted-foreground shrink-0"
            title={t.sidebar.toggleAIPanel}
          >
            <MessageSquare size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
