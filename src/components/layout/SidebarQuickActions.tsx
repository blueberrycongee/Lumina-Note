import { Calendar, Loader2, Mic } from "lucide-react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useVoiceNote } from "@/hooks/useVoiceNote";

interface SidebarQuickActionsProps {
  vaultPath: string | null;
  onQuickNote: () => void;
}

export function SidebarQuickActions({ vaultPath, onQuickNote }: SidebarQuickActionsProps) {
  const { t } = useLocaleStore();
  const {
    isRecording,
    status: voiceStatus,
    currentTranscript,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceNote();

  return (
    <div className="px-2 space-y-1">
      <button
        onClick={onQuickNote}
        disabled={!vaultPath}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground rounded-ui-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap min-w-0"
        title={t.file.quickNote}
      >
        <Calendar size={14} />
        <span className="ui-compact-text ui-sidebar-hide">{t.file.quickNote}</span>
      </button>

      {/* Voice note */}
      {isRecording ? (
        <div className="bg-destructive/10 border border-destructive/30 rounded-ui-md p-2 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-destructive">
              <div className="relative">
                <Mic size={14} />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-destructive rounded-full animate-pulse" />
              </div>
              <span className="text-xs font-medium">
                {voiceStatus === "saving" ? t.common.loading :
                 voiceStatus === "summarizing" ? t.common.loading : t.common.loading}
              </span>
            </div>
            {voiceStatus === "recording" && (
              <div className="flex gap-1">
                <button
                  onClick={stopRecording}
                  className="px-2 py-1 text-xs bg-destructive/90 text-destructive-foreground rounded-ui-sm hover:bg-destructive transition-colors"
                  title={t.common.save}
                >
                  {t.common.confirm}
                </button>
                <button
                  onClick={cancelRecording}
                  className="px-2 py-1 text-xs bg-muted/60 text-muted-foreground rounded-ui-sm hover:bg-accent/60 transition-colors"
                  title={t.common.cancel}
                >
                  {t.common.cancel}
                </button>
              </div>
            )}
            {(voiceStatus === "saving" || voiceStatus === "summarizing") && (
              <Loader2 size={14} className="animate-spin text-muted-foreground" />
            )}
          </div>
          {/* Live transcript preview */}
          {currentTranscript && (
            <div className="text-xs text-muted-foreground bg-background/50 rounded p-2 max-h-20 overflow-y-auto">
              {currentTranscript.slice(-100)}{currentTranscript.length > 100 ? "..." : ""}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={startRecording}
          disabled={!vaultPath}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground rounded-ui-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap min-w-0"
          title={t.file.voiceRecordHint}
        >
          <Mic size={14} />
          <span className="ui-compact-text ui-sidebar-hide">{t.file.voiceNote}</span>
        </button>
      )}
    </div>
  );
}
