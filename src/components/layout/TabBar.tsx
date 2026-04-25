import { useCallback, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useFileStore, Tab } from "@/stores/useFileStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useUIStore } from "@/stores/useUIStore";
import { X, FileText, Network, Pin, User, Puzzle, Shapes, Images } from "lucide-react";
import { cn } from "@/lib/utils";
import { reportOperationError } from "@/lib/reportError";
import { useShallow } from "zustand/react/shallow";
import { useMacTopChromeEnabled } from "./MacTopChrome";

const MAC_TRAFFIC_LIGHT_SAFE_AREA_WIDTH = 64;
const MAC_COLLAPSED_RIBBON_WIDTH = 64;
const MAC_TABBAR_LEFT_SAFE_INSET = MAC_TRAFFIC_LIGHT_SAFE_AREA_WIDTH - MAC_COLLAPSED_RIBBON_WIDTH;

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
        "group relative flex items-center gap-1.5 px-2 py-1.5 text-[13px] cursor-grab border-r border-border/50 w-full",
        "transition-[background-color,color] duration-150 select-none",
        isActive
          ? "bg-background text-foreground border-b-2 border-b-primary"
          : "bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
        isDragging && "opacity-50 cursor-grabbing",
        isDropTarget && dropPosition === 'left' && "border-l-2 border-l-primary",
        isDropTarget && dropPosition === 'right' && "border-r-2 border-r-primary"
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
      <span className={cn("truncate min-w-0", tab.isPreview && "italic")}>{displayName}</span>
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
  const { tabs, activeTabIndex, switchTab, closeTab, closeOtherTabs, closeAllTabs, togglePinTab, promotePreviewTab } =
    useFileStore(
      useShallow((state) => ({
        tabs: state.tabs,
        activeTabIndex: state.activeTabIndex,
        switchTab: state.switchTab,
        closeTab: state.closeTab,
        closeOtherTabs: state.closeOtherTabs,
        closeAllTabs: state.closeAllTabs,
        togglePinTab: state.togglePinTab,
        promotePreviewTab: state.promotePreviewTab,
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

  const handleContextMenu = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tabIndex: index });
  }, []);

  const handleClickOutside = useCallback(() => {
    setContextMenu(null);
  }, []);

  const isExplicitClose = useRef(false);

  const handleClose = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      isExplicitClose.current = true;
      const tab = tabs[index];
      void closeTab(index).catch((error) => {
        reportOperationError({
          source: "TabBar.handleClose",
          action: "Close tab",
          error,
          context: { index, tabId: tab?.id },
        });
      });
    },
    [closeTab, tabs]
  );

  // 自定义鼠标拖拽（绕过 Tauri WebView 的 HTML5 拖拽限制）
  const handleTabMouseDown = useCallback((e: React.MouseEvent, index: number) => {
    if (e.button !== 0) return; // 只处理左键
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    setDraggedIndex(index);
    isDragging.current = false;
  }, []);

  // 监听全局鼠标移动和松开

  // 即使没有标签页也显示空的标签栏（保持 UI 一致性）
  return (
    <>
      <div
        className="flex h-11 shrink-0 items-stretch border-b border-border/50 bg-background"
        data-tauri-drag-region={showMacTopActions ? true : undefined}
      >
        <div
          ref={containerRef}
          className="flex min-w-0 flex-1 items-stretch overflow-hidden"
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
          <AnimatePresence initial={false}>
            {tabs.map((tab, index) => (
              <motion.div
                key={tab.id}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "auto", opacity: 1 }}
                exit={isExplicitClose.current ? { width: 0, opacity: 0 } : undefined}
                transition={{ duration: 0.15, ease: [0.2, 0, 0.4, 1] }}
                onAnimationComplete={() => { isExplicitClose.current = false; }}
                className="flex-1 min-w-[40px] max-w-[180px] overflow-hidden"
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
                      isExplicitClose.current = true;
                      void closeTab(index).catch((error) => {
                        reportOperationError({
                          source: "TabBar.doubleClickClose",
                          action: "Close tab",
                          error,
                          context: { index, tabId: tab.id },
                        });
                      });
                    }
                  }}
                  onClose={(e) => handleClose(e, index)}
                  onContextMenu={(e) => handleContextMenu(e, index)}
                  onMouseDown={handleTabMouseDown}
                />
              </motion.div>
            ))}
          </AnimatePresence>
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
                isExplicitClose.current = true;
                closeTab(contextMenu.tabIndex);
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 text-[13px] text-left hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={tabs[contextMenu.tabIndex]?.isPinned}
            >
              {t.tabBar.close}
            </button>
            <button
              onClick={() => {
                isExplicitClose.current = true;
                closeOtherTabs(contextMenu.tabIndex);
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 text-[13px] text-left hover:bg-accent transition-colors"
            >
              {t.tabBar.closeOthers}
            </button>
            <button
              onClick={() => {
                isExplicitClose.current = true;
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
