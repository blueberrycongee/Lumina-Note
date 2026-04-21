import { PanelLeftClose } from "lucide-react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useUIStore } from "@/stores/useUIStore";

export function MacLeftPaneTopBar() {
  const { t } = useLocaleStore();
  const toggleLeftSidebar = useUIStore((state) => state.toggleLeftSidebar);

  return (
    <div className="flex h-11 items-stretch border-b border-border/50 bg-background">
      <div
        className="h-full w-[72px] shrink-0"
        data-tauri-drag-region
        data-testid="mac-left-pane-traffic-lights-safe-area"
      />

      <div className="flex h-full min-w-0 flex-1 items-center gap-1 pl-2 pr-2" data-tauri-drag-region data-testid="mac-left-pane-controls">
        <div className="flex-1" />

        <button
          type="button"
          onClick={toggleLeftSidebar}
          className="h-8 w-8 ui-icon-btn"
          title={t.sidebar.files}
          aria-label={t.sidebar.files}
          data-tauri-drag-region="false"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
