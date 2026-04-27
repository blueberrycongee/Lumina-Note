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

const MAC_TRAFFIC_LIGHT_SAFE_AREA_WIDTH = 64;
const MAC_COLLAPSED_RIBBON_WIDTH = 64;
const MAC_TABBAR_LEFT_SAFE_INSET = MAC_TRAFFIC_LIGHT_SAFE_AREA_WIDTH - MAC_COLLAPSED_RIBBON_WIDTH;

// Apple-style motion tokens. SwiftUI's smooth/snappy springs are critically
// damped (no overshoot) and settle in ~200–250 ms; we thread a single
// duration + easing through every transform on a tab — open, close, drag,
// pin, layout — so the strip behaves like one coherent surface instead of
// a stack of competing animation systems.
const TAB_EASE = [0.32, 0.72, 0, 1] as const;
const TAB_DURATION = 0.22;
const TAB_DURATION_FAST = 0.16;
const TAB_LAYOUT_TRANSITION = { duration: TAB_DURATION, ease: TAB_EASE };
const TAB_DRAG_LIFT_TRANSITION = { duration: TAB_DURATION_FAST, ease: TAB_EASE };

const TAB_BASIS_PX = 240;
const TAB_MIN_WIDTH_PX = 110;
const TAB_MAX_WIDTH_PX = 240;

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
              // Animate width + marginLeft together so the Pin's appearance
              // / disappearance doesn't snap the dirty dot and close button
              // by a full icon-plus-gap (~18 px) on a single frame. The
              // negative left margin at width 0 cancels out the gap-2 the
              // parent flex would otherwise reserve, so the trailing items
              // glide instead of jump.
              className="shrink-0 inline-flex items-center justify-center"
              initial={{ width: 0, marginLeft: -8, scale: 0.4, opacity: 0, rotate: 0 }}
              animate={{ width: 10, marginLeft: 0, scale: 1, opacity: 1, rotate: 45 }}
              exit={{ width: 0, marginLeft: -8, scale: 0.4, opacity: 0, rotate: 0 }}
              transition={{ duration: TAB_DURATION_FAST, ease: TAB_EASE }}
              style={{ overflow: "visible" }}
            >
              <Pin size={10} className="text-primary shrink-0" />
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
  const { tabs, activeTabIndex, switchTab, closeTab, closeOtherTabs, closeAllTabs, togglePinTab, promotePreviewTab, createNewFile } =
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
        createNewFile: state.createNewFile,
      })),
    );
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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

  // 卸载兜底：万一拖拽中组件被销毁，确保 body class 被清掉
  useEffect(() => {
    return () => {
      document.body.classList.remove("lumina-tab-dragging");
    };
  }, []);

  // Single close path. Drives a normal store mutation; the tab's
  // exit transform (flexBasis → 0, opacity → 0, marginLeft → 0) is
  // owned by AnimatePresence on the Reorder.Item below, so the
  // imperative timeout-driven shrink animation is no longer needed.
  const closeTabAt = useCallback(
    (index: number) => {
      void closeTab(index).catch((error) => {
        reportOperationError({
          source: "TabBar.closeTab",
          action: "Close tab",
          error,
          context: { index },
        });
      });
    },
    [closeTab],
  );

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
      closeTabAt(index);
    },
    [closeTabAt],
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
            <AnimatePresence initial={false}>
              {tabs.map((tab, index) => {
                const isActive = index === activeTabIndex;
                // Negative left-margin from the second tab onward so each
                // tab's left ear overlaps the previous tab's right ear —
                // same trick Chrome uses to merge adjacent silhouettes
                // instead of leaving a flat floor between them. We animate
                // marginLeft alongside flexBasis so the overlap collapses
                // smoothly as the tab shrinks during exit, instead of
                // snapping 22 px when the element finally unmounts.
                const targetMarginLeft = index > 0 ? -TAB_OVERLAP_PX : 0;
                return (
                  <Reorder.Item
                    as="div"
                    key={tab.id}
                    value={tab}
                    drag="x"
                    dragElastic={0.05}
                    dragMomentum={false}
                    onDragStart={() => document.body.classList.add("lumina-tab-dragging")}
                    onDragEnd={() => document.body.classList.remove("lumina-tab-dragging")}
                    whileDrag={
                      reduceMotion
                        ? undefined
                        : {
                            // Subtle Apple-style lift: a small scale, a
                            // hairline upward translate, and a soft layered
                            // shadow that reads as depth without leaning on
                            // a heavy drop. zIndex clears the active tab's
                            // z-10 so a dragged inactive tab leads cleanly.
                            scale: 1.02,
                            y: -2,
                            zIndex: 30,
                            boxShadow:
                              "0 4px 14px -4px rgba(0, 0, 0, 0.14), 0 2px 6px -2px rgba(0, 0, 0, 0.08)",
                            transition: TAB_DRAG_LIFT_TRANSITION,
                          }
                    }
                    layout="position"
                    initial={
                      reduceMotion
                        ? false
                        : {
                            flexBasis: 0,
                            opacity: 0,
                            marginLeft: 0,
                            minWidth: 0,
                            maxWidth: 0,
                          }
                    }
                    animate={{
                      flexBasis: TAB_BASIS_PX,
                      opacity: 1,
                      marginLeft: targetMarginLeft,
                      minWidth: TAB_MIN_WIDTH_PX,
                      maxWidth: TAB_MAX_WIDTH_PX,
                    }}
                    exit={
                      reduceMotion
                        ? { opacity: 0 }
                        : {
                            flexBasis: 0,
                            opacity: 0,
                            marginLeft: 0,
                            minWidth: 0,
                            maxWidth: 0,
                          }
                    }
                    transition={TAB_LAYOUT_TRANSITION}
                    className={cn(
                      "relative grow-0 shrink overflow-hidden",
                      // Active tab sits above its neighbors so its silhouette
                      // outline (and white fill) cleanly overlays the overlapping
                      // ears of the inactive tabs on either side.
                      isActive ? "z-10" : "z-0 hover:z-[5]",
                    )}
                  >
                    <TabItem
                      tab={tab}
                      isActive={isActive}
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
                          closeTabAt(index);
                        }
                      }}
                      onClose={(e) => handleClose(e, index)}
                      onContextMenu={(e) => handleContextMenu(e, index)}
                    />
                  </Reorder.Item>
                );
              })}
            </AnimatePresence>
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

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={handleClickOutside} aria-hidden="true" />
          <div
            className="fixed z-50 bg-popover border border-border rounded-ui-md shadow-elev-2 py-1 min-w-[160px] animate-pop-in"
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
                closeTabAt(contextMenu.tabIndex);
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
