import {
  FilePlus,
  FolderPlus,
  RefreshCw,
  Shapes,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useFileStore } from "@/stores/useFileStore";
import { WindowControls } from "./WindowControls";

export function MacLeftPaneTopBar() {
  const { t } = useLocaleStore();
  const isLoadingTree = useFileStore((state) => state.isLoadingTree);
  const refreshFileTree = useFileStore((state) => state.refreshFileTree);

  return (
    <div className="flex h-11 items-stretch bg-background">
      <div
        className="h-full w-16 shrink-0 flex items-center justify-center bg-ribbon border-r border-border/30"
        data-tauri-drag-region
        data-testid="mac-left-pane-traffic-lights-safe-area"
      >
        <WindowControls />
      </div>

      <div
        className="flex h-full min-w-0 flex-1 items-center justify-center gap-4 px-2 border-b border-border/40"
        data-tauri-drag-region
        data-testid="mac-left-pane-controls"
      >
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("sidebar:new-file"))
          }
          className="w-7 h-7 ui-icon-btn"
          title={t.sidebar.newNote}
          data-tauri-drag-region="false"
        >
          <FilePlus size={15} />
        </button>
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("sidebar:new-diagram"))
          }
          className="w-7 h-7 ui-icon-btn"
          title={t.sidebar.newDiagram}
          data-tauri-drag-region="false"
        >
          <Shapes size={15} />
        </button>
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("sidebar:new-folder"))
          }
          className="w-7 h-7 ui-icon-btn"
          title={t.sidebar.newFolder}
          data-tauri-drag-region="false"
        >
          <FolderPlus size={15} />
        </button>
        <button
          type="button"
          onClick={() => void refreshFileTree()}
          disabled={isLoadingTree}
          className="w-7 h-7 ui-icon-btn disabled:opacity-50 disabled:pointer-events-none"
          title={t.sidebar.refresh}
          data-tauri-drag-region="false"
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
