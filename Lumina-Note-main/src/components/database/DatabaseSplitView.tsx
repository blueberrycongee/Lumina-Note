import { useCallback, useEffect } from "react";
import { useUIStore } from "@/stores/useUIStore";
import { useSplitStore } from "@/stores/useSplitStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { DatabaseView } from "./DatabaseView";
import { DatabaseIconButton } from "./primitives";
import { CodeMirrorEditor, ViewMode } from "@/editor/CodeMirrorEditor";
import { getFileName, cn } from "@/lib/utils";
import { X, Columns, Rows, FileText, Loader2, Save } from "lucide-react";

interface DatabaseSplitViewProps {
  dbId: string;
}

export function DatabaseSplitView({ dbId }: DatabaseSplitViewProps) {
  const { t } = useLocaleStore();
  const {
    splitDirection,
    setSplitDirection,
    toggleSplitView,
    editorMode,
  } = useUIStore();

  const {
    secondaryFile,
    secondaryContent,
    secondaryIsDirty,
    isLoadingSecondary,
    updateSecondaryContent,
    saveSecondary,
    closeSecondary,
  } = useSplitStore();

  const handleContentChange = useCallback((content: string) => {
    updateSecondaryContent(content);
  }, [updateSecondaryContent]);

  // Ctrl+S 保存快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        if (secondaryIsDirty) {
          e.preventDefault();
          saveSecondary();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [secondaryIsDirty, saveSecondary]);

  const isHorizontal = splitDirection === "horizontal";

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Split toolbar */}
      <div className="db-toolbar h-8 flex items-center px-2 gap-1 shrink-0">
        <DatabaseIconButton
          onClick={() => setSplitDirection(isHorizontal ? "vertical" : "horizontal")}
          className={cn("h-7 w-7")}
          title={isHorizontal ? t.layout.verticalSplit : t.layout.horizontalSplit}
          aria-label={isHorizontal ? t.layout.verticalSplit : t.layout.horizontalSplit}
        >
          {isHorizontal ? <Rows size={14} /> : <Columns size={14} />}
        </DatabaseIconButton>
        <DatabaseIconButton
          onClick={toggleSplitView}
          className="h-7 w-7"
          title={t.layout.closeSplit}
          aria-label={t.layout.closeSplit}
        >
          <X size={14} />
        </DatabaseIconButton>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          {t.database.splitTitle}
        </span>
      </div>

      {/* Split panes */}
      <div className={cn(
        "flex-1 flex overflow-hidden",
        isHorizontal ? "flex-row" : "flex-col"
      )}>
        {/* Database pane (left) */}
        <div className={cn(
          "flex flex-col overflow-hidden",
          isHorizontal ? "flex-1 min-w-[300px]" : "flex-1 min-h-[200px]"
        )}>
          <DatabaseView dbId={dbId} className="flex-1" />
        </div>

        {/* Divider */}
        <div className={cn(
          "bg-border shrink-0",
          isHorizontal ? "w-px" : "h-px"
        )} />

        {/* Note editor pane (right) */}
        <div className={cn(
          "flex flex-col overflow-hidden",
          isHorizontal ? "flex-1 min-w-[300px]" : "flex-1 min-h-[200px]"
        )}>
          {isLoadingSecondary ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="animate-spin text-muted-foreground" />
            </div>
          ) : secondaryFile ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* File header */}
              <div className="h-8 flex items-center px-3 gap-2 border-b border-border bg-muted shrink-0">
                <FileText size={14} className="text-muted-foreground" />
                <span className="text-sm truncate flex-1">
                  {getFileName(secondaryFile)}
                </span>
                {secondaryIsDirty && (
                  <DatabaseIconButton
                    onClick={saveSecondary}
                    className="h-7 w-7 text-primary hover:text-primary"
                    title={t.database.saveNote}
                    aria-label={t.database.saveNote}
                  >
                    <Save size={14} />
                  </DatabaseIconButton>
                )}
                <DatabaseIconButton
                  onClick={closeSecondary}
                  className="h-7 w-7"
                  title={t.common.close}
                  aria-label={t.common.close}
                >
                  <X size={14} />
                </DatabaseIconButton>
              </div>
              
              {/* Editor */}
              <div className="flex-1 overflow-hidden">
                <CodeMirrorEditor
                  content={secondaryContent}
                  onChange={handleContentChange}
                  viewMode={editorMode as ViewMode}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <FileText size={32} className="opacity-30 mb-2" />
              <p className="text-sm">{t.database.openNoteHintTitle}</p>
              <p className="text-xs opacity-70">{t.database.openNoteHintDesc}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
