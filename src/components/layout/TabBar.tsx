import { useCallback, useEffect, useRef, useState } from "react";
import { useFileStore, Tab } from "@/stores/useFileStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useUIStore } from "@/stores/useUIStore";
import { X, FileText, Network, Pin, Plus, User, Puzzle, Shapes, Images } from "lucide-react";
import { cn } from "@/lib/utils";
import { reportOperationError } from "@/lib/reportError";
import { useShallow } from "zustand/react/shallow";
import { useMacTopChromeEnabled } from "./MacTopChrome";

const MAC_TRAFFIC_LIGHT_SAFE_AREA_WIDTH = 64;
const MAC_COLLAPSED_RIBBON_WIDTH = 64;
const MAC_TABBAR_LEFT_SAFE_INSET = MAC_TRAFFIC_LIGHT_SAFE_AREA_WIDTH - MAC_COLLAPSED_RIBBON_WIDTH;
const CLOSE_ANIMATION_MS = 150;

interface TabItemProps {
  tab: Tab;
  index: number;
  isActive: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  dropPosition: 'left' | 'right' | null;
  displayName: string;
  onSelect: () => void;
  onDoubleClick: () => void;
  onClose: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onMouseDown: (e: React.MouseEvent, index: number) => void;
}

function TabItem({
  tab,
  index,
  isActive,
  isDragging,
  isDropTarget,
  dropPosition,
  displayName,
  onSelect,
  onDoubleClick,
  onClose,
  onContextMenu,
  onMouseDown,
}: TabItemProps) {
  return (
    <div
      data-tab-index={index}
      data-tauri-drag-region="false"
      className={cn(
        "group relative flex h-full items-center gap-1.5 px-2.5 text-[13px] cursor-grab w-full rounded-md",
        "transition-[background-color,color] duration-150 select-none",
        isActive
          ? "bg-background text-foreground ring-1 ring-border/50 shadow-sm"
          : "bg-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        isDragging && "opacity-50 cursor-grabbing",
        isDropTarget && dropPosition === 'left' && "ring-2 ring-primary ring-inset",
        isDropTarget && dropPosition === 'right' && "ring-2 ring-primary ring-inset"
      )}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onMouseDown={(e) => onMouseDown(e, index)}
    >
      {tab.type === "graph" || tab.type === "isolated-graph" ? (
        <Network size={14} className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
      ) : tab.type === "pdf" ? (
        <FileText size={14} className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
      ) : tab.type === "diagram" ? (
        <Shapes size={14} className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
      ) : tab.type === "profile-preview" ? (
        <User size={14} className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
      ) : tab.type === "plugin-view" ? (
        <Puzzle size={14} className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
      ) : tab.type === "image-manager" ? (
        <Images size={14} className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
      ) : (
        <FileText size={14} className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
      )}
      <span className={cn("flex-1 truncate min-w-0", tab.isPreview && "italic")}>{displayName}</span>
      {tab.isPinned && (
        <Pin size={10} className="shrink-0 text-primary rotate-45" />
      )}
      {tab.isDirty && (
        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
      )}
      {!tab.isPinned && (
        <button
          data-tauri-drag-region="false"
          onClick={onClose}
          className={cn(
            "shrink-0 p-0.5 rounded-ui-sm hover:bg-accent",
            "opacity-0 group-hover:opacity-100 transition-opacity",
            isActive && "opacity-100"
          )}
        >
          <X size={12} />
        </button>
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
  const { t } = useLocaleStore();
  const { tabs, activeTabIndex, switchTab, closeOtherTabs, closeAllTabs, togglePinTab, promotePreviewTab, createNewFile } =
    useFileStore(
      useShallow((state) => ({
        tabs: state.tabs,
        activeTabIndex: state.activeTabIndex,
        switchTab: state.switchTab,
        closeOtherTabs: state.closeOtherTabs,
        closeAllTabs: state.closeAllTabs,
        togglePinTab: state.togglePinTab,
        promotePreviewTab: state.promotePreviewTab,
        createNewFile: state.createNewFile,
      })),
    );
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex] = useState<number | null>(null);
  const [dropPosition] = useState<'left' | 'right' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const showMacTopActions = useMacTopChromeEnabled();
  const leftSidebarOpen = useUIStore((state) => state.leftSidebarOpen);
  const showMacTrafficLightInset = showMacTopActions && !leftSidebarOpen;

  // IDs of tabs currently animating their close (shrinking out). The tab is
  // still in the store during this window — store removal happens after the
  // animation finishes. This is what lets the component own the animation
  // semantics: only user-initiated closes get an animation; preview replaces
  // and external removals just unmount instantly via React reconciliation.
  const [closingIds, setClosingIds] = useState<Set<string>>(() => new Set());
  const timeouts = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    return () => {
      for (const t of timeouts.current) clearTimeout(t);
      timeouts.current.clear();
    };
  }, []);

  const animateClose = useCallback((tabId: string) => {
    setClosingIds((prev) => {
      if (prev.has(tabId)) return prev;
      const next = new Set(prev);
      next.add(tabId);
      return next;
    });
    const timeout = setTimeout(() => {
      timeouts.current.delete(timeout);
      const state = useFileStore.getState();
      const idx = state.tabs.findIndex((t) => t.id === tabId);
      if (idx >= 0) {
        void state.closeTab(idx).catch((error) => {
          reportOperationError({
            source: "TabBar.animateClose",
            action: "Close tab",
            error,
            context: { tabId },
          });
        });
      }
      setClosingIds((prev) => {
        if (!prev.has(tabId)) return prev;
        const next = new Set(prev);
        next.delete(tabId);
        return next;
      });
    }, CLOSE_ANIMATION_MS);
    timeouts.current.add(timeout);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tabIndex: index });
  }, []);

  const handleClickOutside = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleClose = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      const tab = tabs[index];
      if (tab) animateClose(tab.id);
    },
    [tabs, animateClose]
  );

  // 自定义鼠标拖拽（绕过 Tauri WebView 的 HTML5 拖拽限制）
  const handleTabMouseDown = useCallback((e: React.MouseEvent, index: number) => {
    if (e.button !== 0) return; // 只处理左键
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    setDraggedIndex(index);
    isDragging.current = false;
  }, []);

  // 即使没有标签页也显示空的标签栏（保持 UI 一致性）
  return (
    <>
      <div
        className="flex h-11 shrink-0 items-stretch bg-background"
        data-tauri-drag-region={showMacTopActions ? true : undefined}
      >
        <div
          ref={containerRef}
          className="flex min-w-0 flex-1 items-stretch overflow-x-auto scrollbar-hide gap-0.5 px-1 pt-1.5 pb-1"
          data-tauri-drag-region={showMacTopActions ? true : undefined}
          data-testid="mac-tabbar-tabstrip"
        >
          {showMacTrafficLightInset ? (
            <div
              className="h-full shrink-0"
              style={{ width: `${MAC_TABBAR_LEFT_SAFE_INSET}px` }}
              data-testid="mac-tabbar-traffic-light-spacer"
            />
          ) : null}
          {tabs.map((tab, index) => {
            const isClosing = closingIds.has(tab.id);
            return (
              <div
                key={tab.id}
                className={cn(
                  "flex-none overflow-hidden transition-[width,min-width,opacity] duration-150 ease-out",
                  isClosing
                    ? "w-0 min-w-0 opacity-0 pointer-events-none"
                    : "w-[200px] min-w-[80px]"
                )}
              >
                <TabItem
                  tab={tab}
                  index={index}
                  isActive={index === activeTabIndex}
                  isDragging={index === draggedIndex && isDragging.current}
                  isDropTarget={index === dropTargetIndex}
                  dropPosition={index === dropTargetIndex ? dropPosition : null}
                  displayName={
                    tab.type === "ai-chat"
                      ? t.common.aiChatTab
                      : tab.type === "graph"
                        ? t.graph.title
                        : tab.name
                  }
                  onSelect={() => switchTab(index)}
                  onDoubleClick={() => {
                    if (tab.isPreview) {
                      promotePreviewTab(tab.id);
                    } else if (!tab.isPinned) {
                      animateClose(tab.id);
                    }
                  }}
                  onClose={(e) => handleClose(e, index)}
                  onContextMenu={(e) => handleContextMenu(e, index)}
                  onMouseDown={handleTabMouseDown}
                />
              </div>
            );
          })}
          <button
            type="button"
            data-testid="mac-tabbar-new-tab"
            data-tauri-drag-region="false"
            onClick={() => {
              void createNewFile().catch((error) => {
                reportOperationError({
                  source: "TabBar.newTab",
                  action: "Create new file from tab bar",
                  error,
                });
              });
            }}
            aria-label={t.tabBar.newTab}
            className="shrink-0 flex items-center justify-center w-9 rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={handleClickOutside} aria-hidden="true" />
          <div
            className="fixed z-50 bg-background border border-border rounded-ui-md shadow-ui-float py-1 min-w-[160px] animate-pop-in"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => {
                togglePinTab(contextMenu.tabIndex);
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 text-[13px] text-left hover:bg-accent transition-colors flex items-center gap-2"
            >
              <Pin size={12} className={tabs[contextMenu.tabIndex]?.isPinned ? "" : "rotate-45"} />
              {tabs[contextMenu.tabIndex]?.isPinned ? t.tabBar.unpin : t.tabBar.pin}
            </button>
            <div className="h-px bg-border my-1" />
            <button
              onClick={() => {
                const tab = tabs[contextMenu.tabIndex];
                if (tab) animateClose(tab.id);
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 text-[13px] text-left hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={tabs[contextMenu.tabIndex]?.isPinned}
            >
              {t.tabBar.close}
            </button>
            <button
              onClick={() => {
                closeOtherTabs(contextMenu.tabIndex);
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 text-[13px] text-left hover:bg-accent transition-colors"
            >
              {t.tabBar.closeOthers}
            </button>
            <button
              onClick={() => {
                closeAllTabs();
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 text-[13px] text-left hover:bg-accent transition-colors"
            >
              {t.tabBar.closeAll}
            </button>
          </div>
        </>
      )}
    </>
  );
}
