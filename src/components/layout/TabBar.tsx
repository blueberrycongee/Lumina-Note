import { useCallback, useState, useRef, useEffect } from "react";
import { useFileStore, Tab } from "@/stores/useFileStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { X, FileText, Network, Video, Database, Globe, Brain, Pin } from "lucide-react";
import { cn } from "@/lib/utils";

interface TabItemProps {
  tab: Tab;
  index: number;
  isActive: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  dropPosition: 'left' | 'right' | null;
  displayName: string;
  onSelect: () => void;
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
  onClose,
  onContextMenu,
  onMouseDown,
}: TabItemProps) {
  return (
    <div
      data-tab-index={index}
      className={cn(
        "group relative flex items-center gap-1.5 px-3 py-1.5 text-sm cursor-grab border-r border-border/50",
        "transition-[background-color,color] duration-150 select-none",
        isActive
          ? "bg-background/70 text-foreground shadow-[inset_0_-1px_0_hsl(var(--primary)/0.6)]"
          : "bg-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        isDragging && "opacity-50 cursor-grabbing",
        isDropTarget && dropPosition === 'left' && "border-l-2 border-l-primary",
        isDropTarget && dropPosition === 'right' && "border-r-2 border-r-primary"
      )}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onMouseDown={(e) => onMouseDown(e, index)}
    >
      {tab.type === "graph" || tab.type === "isolated-graph" ? (
        <Network size={12} className="shrink-0 text-primary" />
      ) : tab.type === "video-note" ? (
        <Video size={12} className="shrink-0 text-red-500" />
      ) : tab.type === "database" ? (
        <Database size={12} className="shrink-0 text-slate-500" />
      ) : tab.type === "pdf" ? (
        <FileText size={12} className="shrink-0 text-red-500" />
      ) : tab.type === "webpage" ? (
        <Globe size={12} className="shrink-0 text-blue-500" />
      ) : tab.type === "flashcard" ? (
        <Brain size={12} className="shrink-0 text-purple-500" />
      ) : (
        <FileText size={12} className="shrink-0 opacity-60" />
      )}
      <span className="truncate max-w-[120px]">{displayName}</span>
      {tab.isPinned && (
        <Pin size={10} className="shrink-0 text-primary rotate-45" />
      )}
      {tab.isDirty && (
        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
      )}
      {!tab.isPinned && (
        <button
          onClick={onClose}
          className={cn(
            "shrink-0 p-0.5 rounded-ui-sm hover:bg-accent/60",
            "opacity-0 group-hover:opacity-100 transition-opacity",
            isActive && "opacity-60"
          )}
        >
          <X size={12} />
        </button>
      )}
      {/* Active indicator */}
      {isActive && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary/80" />
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
  const { tabs, activeTabIndex, switchTab, closeTab, closeOtherTabs, closeAllTabs, reorderTabs, togglePinTab } =
    useFileStore();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<'left' | 'right' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);

  const handleContextMenu = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tabIndex: index });
  }, []);

  const handleClose = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      const tab = tabs[index];
      // 如果关闭的是视频标签页，同时关闭 WebView
      if (tab?.type === "video-note") {
        import('@tauri-apps/api/core').then(({ invoke }) => {
          invoke('close_embedded_webview').catch(() => {});
        });
      }
      // 如果关闭的是网页标签页，同时关闭浏览器 WebView
      if (tab?.type === "webpage") {
        import('@tauri-apps/api/core').then(({ invoke }) => {
          invoke('close_browser_webview', { tabId: tab.id }).catch(() => {});
        });
      }
      closeTab(index);
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
  useEffect(() => {
    if (draggedIndex === null) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (dragStartPos.current === null || draggedIndex === null) return;

      const dx = e.clientX - dragStartPos.current.x;
      const dy = e.clientY - dragStartPos.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // 移动超过 5px 才算拖拽
      if (distance > 5) {
        isDragging.current = true;
      }

      if (!isDragging.current) return;

      // 找到鼠标下的标签页
      const container = containerRef.current;
      if (!container) return;

      const tabElements = container.querySelectorAll('[data-tab-index]');
      let foundTarget = false;

      tabElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right) {
          const tabIndex = parseInt(el.getAttribute('data-tab-index') || '-1');
          if (tabIndex !== -1 && tabIndex !== draggedIndex) {
            setDropTargetIndex(tabIndex);
            // 判断是放在左边还是右边
            const midX = rect.left + rect.width / 2;
            setDropPosition(e.clientX < midX ? 'left' : 'right');
            foundTarget = true;
          }
        }
      });

      if (!foundTarget) {
        setDropTargetIndex(null);
        setDropPosition(null);
      }
    };

    const handleMouseUp = () => {
      if (isDragging.current && draggedIndex !== null && dropTargetIndex !== null) {
        // 计算目标位置
        let targetIndex = dropTargetIndex;
        if (dropPosition === 'right') {
          targetIndex = dropTargetIndex + 1;
        }
        // 如果从左边拖到右边，需要调整索引
        if (draggedIndex < targetIndex) {
          targetIndex -= 1;
        }
        if (targetIndex !== draggedIndex) {
          reorderTabs(draggedIndex, targetIndex);
        }
      }

      // 清理状态
      setDraggedIndex(null);
      setDropTargetIndex(null);
      setDropPosition(null);
      dragStartPos.current = null;
      isDragging.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggedIndex, dropTargetIndex, dropPosition, reorderTabs]);

  // Close context menu when clicking outside
  const handleClickOutside = useCallback(() => {
    setContextMenu(null);
  }, []);

  // 即使没有标签页也显示空的标签栏（保持 UI 一致性）
  return (
    <>
      <div
        ref={containerRef}
        className="flex items-stretch bg-background/55 backdrop-blur-md border-b border-border/60 shadow-[0_1px_0_hsl(var(--border)/0.5)] overflow-x-auto scrollbar-hide min-h-[32px]"
      >
        {tabs.map((tab, index) => (
          <TabItem
            key={tab.id}
            tab={tab}
            index={index}
            isActive={index === activeTabIndex}
            isDragging={index === draggedIndex && isDragging.current}
            isDropTarget={index === dropTargetIndex}
            dropPosition={index === dropTargetIndex ? dropPosition : null}
            displayName={tab.type === "ai-chat" ? t.common.aiChatTab : tab.name}
            onSelect={() => switchTab(index)}
            onClose={(e) => handleClose(e, index)}
            onContextMenu={(e) => handleContextMenu(e, index)}
            onMouseDown={handleTabMouseDown}
          />
        ))}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={handleClickOutside} />
          <div
            className="fixed z-50 bg-background/75 backdrop-blur-md border border-border/60 rounded-ui-md shadow-ui-float py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => {
                togglePinTab(contextMenu.tabIndex);
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent/60 transition-colors flex items-center gap-2"
            >
              <Pin size={12} className={tabs[contextMenu.tabIndex]?.isPinned ? "" : "rotate-45"} />
              {tabs[contextMenu.tabIndex]?.isPinned ? t.tabBar.unpin : t.tabBar.pin}
            </button>
            <div className="h-px bg-border my-1" />
            <button
              onClick={() => {
                closeTab(contextMenu.tabIndex);
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={tabs[contextMenu.tabIndex]?.isPinned}
            >
              {t.tabBar.close}
            </button>
            <button
              onClick={() => {
                closeOtherTabs(contextMenu.tabIndex);
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent/60 transition-colors"
            >
              {t.tabBar.closeOthers}
            </button>
            <button
              onClick={() => {
                closeAllTabs();
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent/60 transition-colors"
            >
              {t.tabBar.closeAll}
            </button>
          </div>
        </>
      )}
    </>
  );
}
