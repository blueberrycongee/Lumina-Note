import { useCallback } from "react";
import { Bot, FolderOpen, PanelLeftClose, Search } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import { useFileStore } from "@/stores/useFileStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useUIStore } from "@/stores/useUIStore";

export function MacLeftPaneTopBar() {
  const { t } = useLocaleStore();
  const openAIMainTab = useFileStore((state) => state.openAIMainTab);
  const { setRightPanelTab, toggleLeftSidebar } = useUIStore(
    useShallow((state) => ({
      setRightPanelTab: state.setRightPanelTab,
      toggleLeftSidebar: state.toggleLeftSidebar,
    })),
  );

  const dispatchWindowEvent = useCallback((eventName: string) => {
    window.dispatchEvent(new CustomEvent(eventName));
  }, []);


  return (
    <div className="flex h-11 items-stretch border-b border-r border-border/60 bg-background/55 backdrop-blur-md shadow-[inset_-1px_0_0_hsl(var(--border)/0.6),0_1px_0_hsl(var(--border)/0.5)]">
      <div
        className="h-full w-[72px] shrink-0"
        data-tauri-drag-region
        data-testid="mac-left-pane-traffic-lights-safe-area"
      />

      <div className="flex h-full min-w-0 flex-1 items-center gap-1 pr-2" data-tauri-drag-region data-testid="mac-left-pane-controls">
        <button
          type="button"
          onClick={() => dispatchWindowEvent("open-vault")}
          className="h-8 w-8 ui-icon-btn"
          title={t.welcome.openFolder}
          aria-label={t.welcome.openFolder}
          data-tauri-drag-region="false"
        >
          <FolderOpen className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => dispatchWindowEvent("open-global-search")}
          className="h-8 w-8 ui-icon-btn"
          title={t.globalSearch.title}
          aria-label={t.globalSearch.title}
          data-tauri-drag-region="false"
        >
          <Search className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            openAIMainTab();
            setRightPanelTab("outline");
          }}
          className="h-8 w-8 ui-icon-btn"
          title={t.ribbon.aiChatMain}
          aria-label={t.ribbon.aiChatMain}
          data-tauri-drag-region="false"
        >
          <Bot className="h-4 w-4" />
        </button>

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
