import {
  AppWindow,
  FilePlus,
  FolderOpen,
  FolderPlus,
  RefreshCw,
  Shapes,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useFileStore } from "@/stores/useFileStore";
import { openNewWindow } from "@/lib/host";
import { WindowControls } from "./WindowControls";

export function MacLeftPaneTopBar() {
  const { t } = useLocaleStore();
  const isLoadingTree = useFileStore((state) => state.isLoadingTree);
  const refreshFileTree = useFileStore((state) => state.refreshFileTree);

  return (
    <div className="flex h-11 items-stretch bg-muted">
      <div
        className="h-full w-16 shrink-0 flex items-center justify-center bg-ribbon border-r border-border/30"
        data-tauri-drag-region
        data-testid="mac-left-pane-traffic-lights-safe-area"
      >
        <WindowControls />
      </div>

      <div
        className="flex h-full min-w-0 flex-1 items-center gap-0.5 px-2"
        data-tauri-drag-region
        data-testid="mac-left-pane-controls"
      >
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("open-vault"))}
          className="w-7 h-7 ui-icon-btn"
          title={t.file.openFolder}
          data-tauri-drag-region="false"
        >
          <FolderOpen className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => void openNewWindow()}
          className="w-7 h-7 ui-icon-btn"
          title={t.file.newWindow}
          data-tauri-drag-region="false"
        >
          <AppWindow className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("sidebar:new-file"))
          }
          className="w-7 h-7 ui-icon-btn"
          title={t.sidebar.newNote}
          data-tauri-drag-region="false"
        >
          <FilePlus className="w-3.5 h-3.5" />
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
          <Shapes className="w-3.5 h-3.5" />
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
          <FolderPlus className="w-3.5 h-3.5" />
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
            className={cn("w-3.5 h-3.5", isLoadingTree && "animate-spin")}
          />
        </button>

        <div className="flex-1" />
      </div>
    </div>
  );
}
