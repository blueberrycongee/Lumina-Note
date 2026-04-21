import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/stores/useLocaleStore";
import {
  AppWindow,
  FilePlus,
  FolderOpen,
  FolderPlus,
  RefreshCw,
  Shapes,
} from "lucide-react";

interface SidebarHeaderProps {
  onNewFile: () => void;
  onNewDiagram: () => void;
  onNewFolder: () => void;
  onRefresh: () => void;
  isLoadingTree: boolean;
  onOpenFolder: () => void;
  onNewWindow: () => void;
}

export function SidebarHeader({
  onNewFile,
  onNewDiagram,
  onNewFolder,
  onRefresh,
  isLoadingTree,
  onOpenFolder,
  onNewWindow,
}: SidebarHeaderProps) {
  const { t } = useLocaleStore();

  return (
    <div className="p-3 flex items-center justify-between text-[10px] font-semibold text-muted-foreground tracking-[0.2em] uppercase border-b border-border/50">
      <span className="ui-compact-text ui-compact-hide-md">{t.sidebar.files}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={onOpenFolder}
          className="w-7 h-7 ui-icon-btn"
          title={t.file.openFolder}
        >
          <FolderOpen className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onNewWindow}
          className="w-7 h-7 ui-icon-btn"
          title={t.file.newWindow}
        >
          <AppWindow className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onNewFile}
          className="w-7 h-7 ui-icon-btn"
          title={t.sidebar.newNote}
        >
          <FilePlus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onNewDiagram}
          className="w-7 h-7 ui-icon-btn"
          title={t.sidebar.newDiagram}
        >
          <Shapes className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onNewFolder}
          className="w-7 h-7 ui-icon-btn"
          title={t.sidebar.newFolder}
        >
          <FolderPlus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onRefresh}
          disabled={isLoadingTree}
          className="w-7 h-7 ui-icon-btn disabled:opacity-50 disabled:pointer-events-none"
          title={t.sidebar.refresh}
        >
          <RefreshCw
            className={cn("w-3.5 h-3.5", isLoadingTree && "animate-spin")}
          />
        </button>
      </div>
    </div>
  );
}
