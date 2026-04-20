import { useLocaleStore } from "@/stores/useLocaleStore";
import { Download, History, Plus } from "lucide-react";
import type { ExportMessage } from "@/features/conversation-export/exportUtils";

interface ChatToolbarProps {
  showHistory: boolean;
  onToggleHistory: () => void;
  isExportSelectionMode: boolean;
  isLoading: boolean;
  exportCandidates: ExportMessage[];
  onStartExportSelection: () => void;
  onCancelExportSelection: () => void;
  onNewChat: () => void;
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
}: ChatToolbarProps) {
  const { t } = useLocaleStore();

  return (
    <div className="ui-compact-row h-10 flex items-center justify-between px-4 border-b border-border/60 shrink-0 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onToggleHistory}
          className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-md transition-colors whitespace-nowrap ${
            showHistory
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <History size={14} />
          <span className="ui-compact-text ui-compact-hide">
            {t.ai.historyChats}
          </span>
        </button>
      </div>
      <div className="flex items-center gap-2">
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
      </div>
    </div>
  );
}
