import { useLocaleStore } from "@/stores/useLocaleStore";
import { useUIStore } from "@/stores/useUIStore";
import {
  Code2,
  Download,
  History,
  Plus,
  Sparkles,
  Bot,
} from "lucide-react";
import type { ExportMessage } from "@/features/conversation-export/exportUtils";

interface ChatToolbarProps {
  showHistory: boolean;
  onToggleHistory: () => void;
  isConversationMode: boolean;
  isExportSelectionMode: boolean;
  isLoading: boolean;
  exportCandidates: ExportMessage[];
  onStartExportSelection: () => void;
  onCancelExportSelection: () => void;
  onNewChat: () => void;
  agentTokens: number;
  chatTokens: number;
  renderModeToggle: (className?: string) => React.ReactNode;
}

export function ChatToolbar({
  showHistory,
  onToggleHistory,
  isConversationMode,
  isExportSelectionMode,
  isLoading,
  exportCandidates,
  onStartExportSelection,
  onCancelExportSelection,
  onNewChat,
  agentTokens,
  chatTokens,
  renderModeToggle,
}: ChatToolbarProps) {
  const { t } = useLocaleStore();
  const chatMode = useUIStore((s) => s.chatMode);
  const isCodexMode = chatMode === "codex";

  if (isCodexMode) {
    return (
      <div className="ui-compact-row h-10 flex items-center justify-between px-4 border-b border-border/60 shrink-0 min-w-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Code2 size={14} />
          <span className="ui-compact-text ui-compact-hide-md">{t.ai.modeCodex}</span>
        </div>
        {renderModeToggle()}
      </div>
    );
  }

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
          <span className="ui-compact-text ui-compact-hide">{t.ai.historyChats}</span>
        </button>
        <span className="ml-3 text-[11px] text-muted-foreground select-none whitespace-nowrap ui-compact-text ui-compact-hide-md">
          {t.ai.sessionTokens}: {chatMode === "agent" ? agentTokens : chatTokens}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {isConversationMode && (
          <button
            onClick={isExportSelectionMode ? onCancelExportSelection : onStartExportSelection}
            disabled={isLoading || exportCandidates.length === 0}
            className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={14} />
            <span className="ui-compact-text ui-compact-hide">
              {isExportSelectionMode ? t.ai.exportCancel : t.ai.exportConversation}
            </span>
          </button>
        )}
        <button
          onClick={onNewChat}
          className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors whitespace-nowrap"
        >
          <Plus size={14} />
          <span className="ui-compact-text ui-compact-hide">{t.ai.newChat}</span>
        </button>
      </div>
    </div>
  );
}

export function ModeToggle({ className }: { className?: string }) {
  const { t } = useLocaleStore();
  const chatMode = useUIStore((s) => s.chatMode);
  const setChatMode = useUIStore((s) => s.setChatMode);

  return (
    <div className={`ai-mode-toggle flex items-center gap-0.5 bg-muted rounded-lg p-0.5 shrink-0 ${className ?? ""}`}>
      <button
        onClick={() => setChatMode("chat")}
        title={t.ai.chatModeHint}
        className={`shrink-0 px-3 py-1 text-xs font-medium rounded-md transition-all duration-200 whitespace-nowrap ${
          chatMode === "chat"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <span className="flex items-center gap-1 min-w-0">
          <Sparkles size={12} />
          <span className="ai-mode-label ui-compact-text">{t.ai.modeChat}</span>
        </span>
      </button>
      <button
        onClick={() => setChatMode("agent")}
        title={t.ai.agentModeHint}
        className={`shrink-0 px-3 py-1 text-xs font-medium rounded-md transition-all duration-200 whitespace-nowrap ${
          chatMode === "agent"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <span className="flex items-center gap-1 min-w-0">
          <Bot size={12} />
          <span className="ai-mode-label ui-compact-text">{t.ai.modeAgent}</span>
        </span>
      </button>
      <button
        onClick={() => setChatMode("codex")}
        title="Codex"
        className={`shrink-0 px-3 py-1 text-xs font-medium rounded-md transition-all duration-200 whitespace-nowrap ${
          chatMode === "codex"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <span className="flex items-center gap-1 min-w-0">
          <Code2 size={12} />
          <span className="ai-mode-label ui-compact-text">{t.ai.modeCodex}</span>
        </span>
      </button>
    </div>
  );
}
