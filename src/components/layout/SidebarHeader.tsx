import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/stores/useLocaleStore";
import {
  FilePlus,
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
}

export function SidebarHeader({
  onNewFile,
  onNewDiagram,
  onNewFolder,
  onRefresh,
  isLoadingTree,
}: SidebarHeaderProps) {
  const { t } = useLocaleStore();

  return (
    <div className="p-3 flex items-center justify-between text-ui-caption font-semibold text-muted-foreground tracking-[0.2em] uppercase">
      <span className="ui-compact-text ui-compact-hide-md">{t.sidebar.files}</span>
      <div className="flex items-center gap-4">
        <button
          onClick={onNewFile}
          className="w-7 h-7 ui-icon-btn"
          title={t.sidebar.newNote}
        >
          <FilePlus size={15} />
        </button>
        <button
          onClick={onNewDiagram}
          className="w-7 h-7 ui-icon-btn"
          title={t.sidebar.newDiagram}
        >
          <Shapes size={15} />
        </button>
        <button
          onClick={onNewFolder}
          className="w-7 h-7 ui-icon-btn"
          title={t.sidebar.newFolder}
        >
          <FolderPlus size={15} />
        </button>
        <button
          onClick={onRefresh}
          disabled={isLoadingTree}
          className="w-7 h-7 ui-icon-btn disabled:opacity-50 disabled:pointer-events-none"
          title={t.sidebar.refresh}
        >
          <RefreshCw
            size={15}
            className={cn(isLoadingTree && "animate-spin")}
          />
        </button>
      </div>
    </div>
  );
}
