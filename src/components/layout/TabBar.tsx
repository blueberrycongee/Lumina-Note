import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFileStore, Tab } from "@/stores/useFileStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useUIStore } from "@/stores/useUIStore";
import { X, FileText, Network, Pin, Plus, Puzzle, Shapes, Images } from "lucide-react";
import { AnimatePresence, motion, Reorder, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { reportOperationError } from "@/lib/reportError";
import { useShallow } from "zustand/react/shallow";
import { useMacTopChromeEnabled } from "./MacTopChrome";
import { Popover, PopoverContent, PopoverList, Row } from "@/components/ui";

const MAC_TRAFFIC_LIGHT_SAFE_AREA_WIDTH = 64;
const MAC_COLLAPSED_RIBBON_WIDTH = 64;
const MAC_TABBAR_LEFT_SAFE_INSET = MAC_TRAFFIC_LIGHT_SAFE_AREA_WIDTH - MAC_COLLAPSED_RIBBON_WIDTH;
const CLOSE_ANIMATION_MS = 150;

// Chrome-style tab silhouette: top corners curve in, bottom corners curve out
// into "ears" that flush with the strip's bottom edge. Ear arcs use sweep-flag=0
// so they are tangent-vertical at the body and tangent-horizontal at the strip
// floor — the body's vertical edge meets the ear with no kink, giving the
// "asymptotic" tan-like curve the user wanted. SVG width comes from a
// ResizeObserver so the curves never distort when the tab shrinks under pressure.
const TAB_SHAPE_TOP_RADIUS = 12;
const TAB_SHAPE_EAR_RADIUS = 15;
const TAB_SHAPE_HEIGHT = 38;
const TAB_SHAPE_DEFAULT_WIDTH = 200;
// How far each tab slides into the previous tab. With value === EAR_RADIUS
// the two ears interlock exactly inside one (EAR_RADIUS × EAR_RADIUS) box,
// like Chrome. Going slightly larger packs adjacent bodies tighter — the
// trailing ear of the previous tab and the leading ear of this tab simply
// shift past each other, and the active tab's silhouette (which sits on
// z-10) cleanly covers any visual overhang. Must stay strictly less than
// (2 × EAR_RADIUS) so adjacent bodies never touch or invert, and meaningfully
// less than the minimum tab width (110px) so the negative margin can't
// collapse the strip. 22px gives a ~7px tighter gap than the geometric
// interlock without making the active tab "bite" into neighbors too far.
const TAB_OVERLAP_PX = 22;

function tabShapeSegments(width: number, height: number): string[] {
  const w = Math.max(width, TAB_SHAPE_TOP_RADIUS * 2 + TAB_SHAPE_EAR_RADIUS * 2);
  const rt = TAB_SHAPE_TOP_RADIUS;
  const re = TAB_SHAPE_EAR_RADIUS;
  return [
    `M 0 ${height}`,
    `A ${re} ${re} 0 0 0 ${re} ${height - re}`,
    `L ${re} ${rt}`,
    `A ${rt} ${rt} 0 0 1 ${re + rt} 0`,
    `L ${w - re - rt} 0`,
    `A ${rt} ${rt} 0 0 1 ${w - re} ${rt}`,
    `L ${w - re} ${height - re}`,
    `A ${re} ${re} 0 0 0 ${w} ${height}`,
  ];
}

// Closed shape — for fills that should cover the entire silhouette including
// the bottom edge.
function buildTabShapePath(width: number, height: number): string {
  return [...tabShapeSegments(width, height), "Z"].join(" ");
}

// Open shape — left ear, body, top, right ear, but NO bottom closing line.
// Used for the active outline so the silhouette merges into the editor
// surface beneath instead of being capped off with a horizontal stroke.
function buildTabShapeStrokePath(width: number, height: number): string {
  return tabShapeSegments(width, height).join(" ");
}

interface TabShapeProps {
  isActive: boolean;
  isDropTarget: boolean;
}

function TabShape({ isActive, isDropTarget }: TabShapeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: TAB_SHAPE_DEFAULT_WIDTH, height: TAB_SHAPE_HEIGHT });

  useLayoutEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === "undefined") return;
    const node = containerRef.current;
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setSize({ width: rect.width, height: rect.height });
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setSize({ width, height });
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fillPath = useMemo(() => buildTabShapePath(size.width, size.height), [size.width, size.height]);
  const strokePath = useMemo(() => buildTabShapeStrokePath(size.width, size.height), [size.width, size.height]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      {/* Inactive hover affordance — a rounded rectangle that sits inside the
          silhouette body. Horizontal insets match the ear radius so the rect
          aligns with the body's vertical walls; vertical insets are a small
          symmetric padding so the rect fully covers the icons, label, and
          close button (which are centered across the full cell height, not
          the body region). */}
      {!isActive && (
        <div
          aria-hidden
          style={{
            left: TAB_SHAPE_EAR_RADIUS,
            right: TAB_SHAPE_EAR_RADIUS,
            top: 2,
            bottom: 2,
            borderRadius: TAB_SHAPE_TOP_RADIUS,
          }}
          className="absolute bg-transparent group-hover:bg-[hsl(var(--accent)/0.6)] transition-colors duration-150"
        />
      )}
      <svg
        className="w-full h-full"
        viewBox={`0 0 ${Math.max(size.width, 1)} ${Math.max(size.height, 1)}`}
        preserveAspectRatio="none"
      >
        <path
          d={fillPath}
          stroke="none"
          className={cn(
            "transition-[fill] duration-150",
            isActive ? "fill-[hsl(var(--background))]" : "fill-transparent"
          )}
        />
        <path
          d={strokePath}
          fill="none"
          vectorEffect="non-scaling-stroke"
          className={cn(
            "transition-[stroke,stroke-width] duration-150",
            isDropTarget
              ? "stroke-[hsl(var(--primary))] [stroke-width:2]"
              : isActive
                ? "stroke-[hsl(var(--border))] [stroke-width:1]"
                : "[stroke-width:0]"
          )}
        />
      </svg>
    </div>
  );
}

interface TabItemProps {
  tab: Tab;
  isActive: boolean;
  displayName: string;
  onSelect: () => void;
  onDoubleClick: () => void;
  onClose: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function TabItem({
  tab,
  isActive,
  displayName,
  onSelect,
  onDoubleClick,
  onClose,
  onContextMenu,
}: TabItemProps) {
  const { t } = useLocaleStore();
  return (
    <div
      data-tauri-drag-region="false"
      className="group relative h-full w-full cursor-grab select-none"
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <TabShape isActive={isActive} isDropTarget={false} />
      <div
        className={cn(
          "relative flex h-full items-center gap-2 pl-7 pr-5 text-[13px] transition-colors duration-150",
          isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
        )}
      >
        {tab.type === "graph" || tab.type === "isolated-graph" ? (
          <Network size={14} className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
        ) : tab.type === "pdf" ? (
          <FileText size={14} className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
        ) : tab.type === "diagram" ? (
          <Shapes size={14} className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
        ) : tab.type === "plugin-view" ? (
          <Puzzle size={14} className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
        ) : tab.type === "image-manager" ? (
          <Images size={14} className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
        ) : (
          <FileText size={14} className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
        )}
        <span className={cn("flex-1 truncate min-w-0", tab.isPreview && "italic")}>{displayName}</span>
        <AnimatePresence initial={false}>
          {tab.isPinned && (
            <motion.span
              key="pin"
              className="shrink-0 inline-flex"
              initial={{ scale: 0.4, opacity: 0, rotate: 0 }}
              animate={{ scale: 1, opacity: 1, rotate: 45 }}
              exit={{ scale: 0.4, opacity: 0, rotate: 0 }}
              transition={{ duration: 0.16, ease: [0.2, 0.9, 0.1, 1] }}
            >
              <Pin size={10} className="text-primary" />
            </motion.span>
          )}
        </AnimatePresence>
        {tab.isDirty && (
          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0 animate-pulse" />
        )}
        {!tab.isPinned && (
          <button
            data-tauri-drag-region="false"
            onClick={onClose}
            onMouseDown={(e) => e.stopPropagation()}
            aria-label={t.tabBar.close}
            className={cn(
              "shrink-0 p-0.5 rounded-ui-sm",
              "transition-[background-color,color,opacity,transform] duration-fast ease-out-subtle",
              "hover:bg-destructive/15 hover:text-destructive active:scale-90",
              "opacity-0 group-hover:opacity-100",
              isActive && "opacity-100"
            )}
          >
            <X size={12} />
          </button>
        )}
      </div>
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
  const containerRef = useRef<HTMLDivElement>(null);
  // 1×1 invisible div positioned at the right-click coordinates so the
  // Popover has a real DOM element to anchor against. Without it the menu
  // would have no stable position to recompute against on resize / scroll.
  const contextAnchorRef = useRef<HTMLDivElement>(null);
  const showMacTopActions = useMacTopChromeEnabled();
  const leftSidebarOpen = useUIStore((state) => state.leftSidebarOpen);
  const showMacTrafficLightInset = showMacTopActions && !leftSidebarOpen;
  const reduceMotion = useReducedMotion();
  const reorderTabs = useFileStore((state) => state.reorderTabs);

  // Pinned tabs are confined to the prefix of the array; the store rejects
  // moves that cross the boundary. We diff the new order against the current
  // tabs to recover (fromIndex, toIndex) for the existing reorder API. If
  // the move is illegal, the dispatch is a no-op and the next render snaps
  // the tab back into place.
  const handleReorder = useCallback(
    (next: Tab[]) => {
      if (next.length !== tabs.length) return;
      let from = -1;
      let to = -1;
      for (let i = 0; i < next.length; i++) {
        if (tabs[i]?.id !== next[i]?.id) {
          if (from === -1) from = i;
          to = i;
        }
      }
      if (from === -1 || to === -1 || from === to) return;
      const movedId = next[to].id;
      const fromIndex = tabs.findIndex((t) => t.id === movedId);
      const toIndex = next.findIndex((t) => t.id === movedId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
      reorderTabs(fromIndex, toIndex);
    },
    [tabs, reorderTabs],
  );

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
      // 卸载兜底：万一拖拽中组件被销毁，确保 body class 被清掉
      document.body.classList.remove("lumina-tab-dragging");
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

  const handleClose = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      const tab = tabs[index];
      if (tab) animateClose(tab.id);
    },
    [tabs, animateClose]
  );

  // 即使没有标签页也显示空的标签栏（保持 UI 一致性）
  return (
    <>
      <div
        className="flex h-11 shrink-0 items-stretch bg-background"
        data-tauri-drag-region={showMacTopActions ? true : undefined}
      >
        <div
          ref={containerRef}
          className="flex min-w-0 flex-1 items-stretch overflow-x-auto scrollbar-hide px-1 pt-1.5"
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
          <Reorder.Group
            as="div"
            axis="x"
            values={tabs}
            onReorder={handleReorder}
            className="flex min-w-0 items-stretch"
          >
            {tabs.map((tab, index) => {
              const isClosing = closingIds.has(tab.id);
              const isActive = index === activeTabIndex;
              return (
                <Reorder.Item
                  as="div"
                  key={tab.id}
                  value={tab}
                  drag={isClosing ? false : "x"}
                  dragElastic={0.05}
                  dragMomentum={false}
                  onDragStart={() => document.body.classList.add("lumina-tab-dragging")}
                  onDragEnd={() => document.body.classList.remove("lumina-tab-dragging")}
                  whileDrag={
                    reduceMotion
                      ? undefined
                      : {
                          // Lift + brighten so the dragged tab clearly leads.
                          // zIndex must clear the active tab's z-10 so a
                          // dragged inactive tab doesn't slip under it.
                          scale: 1.02,
                          y: -2,
                          zIndex: 30,
                          boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
                        }
                  }
                  layout="position"
                  transition={{ duration: 0.18, ease: [0.2, 0.9, 0.1, 1] }}
                  // Negative left-margin from the second tab onward so each
                  // tab's left ear overlaps the previous tab's right ear —
                  // same trick Chrome uses to merge adjacent silhouettes
                  // instead of leaving a flat floor between them. The exact
                  // amount (TAB_OVERLAP_PX) is tuned slightly larger than
                  // EAR_RADIUS so the bodies pack tighter than the pure
                  // geometric interlock would give.
                  style={index > 0 ? { marginLeft: -TAB_OVERLAP_PX } : undefined}
                  className={cn(
                    "relative transition-[flex-basis,min-width,max-width,opacity] duration-150 ease-out",
                    isClosing
                      ? "basis-0 min-w-0 max-w-0 grow-0 shrink-0 opacity-0 pointer-events-none overflow-hidden"
                      : "grow-0 shrink basis-[240px] min-w-[110px] max-w-[240px]",
                    // Active tab sits above its neighbors so its silhouette
                    // outline (and white fill) cleanly overlays the overlapping
                    // ears of the inactive tabs on either side.
                    isActive ? "z-10" : "z-0 hover:z-[5]"
                  )}
                >
                  <TabItem
                    tab={tab}
                    isActive={index === activeTabIndex}
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
                  />
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
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

      {/* Context menu — Popover anchored to a 1×1 virtual div at the
       * right-click coordinates so it inherits the same animation, focus
       * return, viewport clamp, and portal behaviour as every other popover
       * in the app. */}
      {contextMenu && (
        <div
          ref={contextAnchorRef}
          aria-hidden="true"
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            width: 1,
            height: 1,
            pointerEvents: "none",
          }}
        />
      )}
      <Popover
        open={!!contextMenu}
        onOpenChange={(next) => {
          if (!next) setContextMenu(null);
        }}
        anchor={contextAnchorRef}
      >
        <PopoverContent placement="bottom-start" width={180}>
          <PopoverList>
            {contextMenu && (
              <>
                <Row
                  density="compact"
                  icon={
                    <Pin
                      size={12}
                      className={
                        tabs[contextMenu.tabIndex]?.isPinned ? "" : "rotate-45"
                      }
                    />
                  }
                  title={
                    tabs[contextMenu.tabIndex]?.isPinned
                      ? t.tabBar.unpin
                      : t.tabBar.pin
                  }
                  role="menuitem"
                  onSelect={() => {
                    togglePinTab(contextMenu.tabIndex);
                    setContextMenu(null);
                  }}
                />
                <div
                  role="separator"
                  className="my-1 h-px bg-border/60"
                />
                <Row
                  density="compact"
                  title={t.tabBar.close}
                  role="menuitem"
                  disabled={tabs[contextMenu.tabIndex]?.isPinned}
                  onSelect={() => {
                    const tab = tabs[contextMenu.tabIndex];
                    if (tab) animateClose(tab.id);
                    setContextMenu(null);
                  }}
                />
                <Row
                  density="compact"
                  title={t.tabBar.closeOthers}
                  role="menuitem"
                  onSelect={() => {
                    closeOtherTabs(contextMenu.tabIndex);
                    setContextMenu(null);
                  }}
                />
                <Row
                  density="compact"
                  title={t.tabBar.closeAll}
                  role="menuitem"
                  onSelect={() => {
                    closeAllTabs();
                    setContextMenu(null);
                  }}
                />
              </>
            )}
          </PopoverList>
        </PopoverContent>
      </Popover>
    </>
  );
}
