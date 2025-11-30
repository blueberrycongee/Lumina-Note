import { useCallback, useState, useRef } from "react";
import { useFileStore, Tab } from "@/stores/useFileStore";
import { X, FileText, Network, Video } from "lucide-react";
import { cn } from "@/lib/utils";

interface TabItemProps {
  tab: Tab;
  index: number;
  isActive: boolean;
  onSelect: () => void;
  onClose: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
}

function TabItem({
  tab,
  index,
  isActive,
  onSelect,
  onClose,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
}: TabItemProps) {
  return (
    <div
      className={cn(
        "group relative flex items-center gap-1.5 px-3 py-1.5 text-sm cursor-pointer border-r border-border",
        "transition-colors duration-150 select-none",
        isActive
          ? "bg-background text-foreground"
          : "bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, index)}
    >
      {tab.type === "graph" || tab.type === "isolated-graph" ? (
        <Network size={12} className="shrink-0 text-primary" />
      ) : tab.type === "video-note" ? (
        <Video size={12} className="shrink-0 text-red-500" />
      ) : (
        <FileText size={12} className="shrink-0 opacity-60" />
      )}
      <span className="truncate max-w-[120px]">{tab.name}</span>
      {tab.isDirty && (
        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
      )}
      <button
        onClick={onClose}
        className={cn(
          "shrink-0 p-0.5 rounded hover:bg-accent",
          "opacity-0 group-hover:opacity-100 transition-opacity",
          isActive && "opacity-60"
        )}
      >
        <X size={12} />
      </button>
      {/* Active indicator */}
      {isActive && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
      )}
    </div>
  );
}

interface ContextMenuState {
  x: number;
  y: number;
  tabIndex: number;
}

export function TabBar() {
  const { tabs, activeTabIndex, switchTab, closeTab, closeOtherTabs, closeAllTabs, reorderTabs } =
    useFileStore();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tabIndex: index });
  }, []);

  const handleClose = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      // 如果关闭的是视频标签页，同时关闭 WebView
      if (tabs[index]?.type === "video-note") {
        import('@tauri-apps/api/core').then(({ invoke }) => {
          invoke('close_embedded_webview').catch(() => {});
        });
      }
      closeTab(index);
    },
    [closeTab, tabs]
  );

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      if (draggedIndex !== null && draggedIndex !== toIndex) {
        reorderTabs(draggedIndex, toIndex);
      }
      setDraggedIndex(null);
    },
    [draggedIndex, reorderTabs]
  );

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
  }, []);

  // Close context menu when clicking outside
  const handleClickOutside = useCallback(() => {
    setContextMenu(null);
  }, []);

  // 即使没有标签页也显示空的标签栏（保持 UI 一致性）
  return (
    <>
      <div
        ref={containerRef}
        className="flex items-stretch bg-muted/30 border-b border-border overflow-x-auto scrollbar-hide min-h-[32px]"
        onDragEnd={handleDragEnd}
      >
        {tabs.map((tab, index) => (
          <TabItem
            key={tab.id}
            tab={tab}
            index={index}
            isActive={index === activeTabIndex}
            onSelect={() => switchTab(index)}
            onClose={(e) => handleClose(e, index)}
            onContextMenu={(e) => handleContextMenu(e, index)}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          />
        ))}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={handleClickOutside} />
          <div
            className="fixed z-50 bg-background border border-border rounded-md shadow-lg py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => {
                closeTab(contextMenu.tabIndex);
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors"
            >
              关闭
            </button>
            <button
              onClick={() => {
                closeOtherTabs(contextMenu.tabIndex);
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors"
            >
              关闭其他
            </button>
            <button
              onClick={() => {
                closeAllTabs();
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors"
            >
              关闭全部
            </button>
          </div>
        </>
      )}
    </>
  );
}
