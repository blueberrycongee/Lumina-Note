import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFileStore, Tab } from "@/stores/useFileStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useUIStore } from "@/stores/useUIStore";
import {
  X,
  FileText,
  Network,
  Pin,
  Plus,
  Puzzle,
  Shapes,
  Images,
  AlertTriangle,
  FileX,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { reportOperationError } from "@/lib/reportError";
import { useShallow } from "zustand/react/shallow";
import { useMacTopChromeEnabled } from "./MacTopChrome";
import { SidebarStateIcon } from "./SidebarStateIcon";
import { Popover, PopoverContent, PopoverList, Row } from "@/components/ui";

const MAC_TRAFFIC_LIGHT_SAFE_AREA_WIDTH = 64;
const MAC_COLLAPSED_RIBBON_WIDTH = 64;
const MAC_TABBAR_LEFT_SAFE_INSET = MAC_TRAFFIC_LIGHT_SAFE_AREA_WIDTH - MAC_COLLAPSED_RIBBON_WIDTH;
const TAB_BOUNDS_ANIMATION_MS = 180;
const CLOSE_BATCH_WIDTH_FREEZE_MS = 750;

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
const TAB_MIN_WIDTH_PX = 56;
const TAB_MAX_WIDTH_PX = 240;
const TAB_COMPACT_WIDTH_PX = 92;
const TAB_MINI_WIDTH_PX = 68;
const TAB_NEW_BUTTON_WIDTH_PX = 40;
const TAB_END_PADDING_PX = 6;
const TABBAR_EDGE_SLOT_CLASS =
  "flex w-10 shrink-0 items-center justify-center pt-1.5";
const TABBAR_ICON_BUTTON_CLASS =
  "relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-ui-sm text-muted-foreground transition-[background-color,color,box-shadow] duration-200 ease-out hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
const TABBAR_ICON_BUTTON_OPEN_CLASS =
  "text-primary hover:text-primary";

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
  isDragging: boolean;
  isDropTarget: boolean;
}

function TabShape({ isActive, isDragging, isDropTarget }: TabShapeProps) {
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
            isActive || isDragging ? "fill-[var(--tab-active-fill)]" : "fill-transparent"
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
              : isActive || isDragging
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
  isDragging: boolean;
  displayName: string;
  width: number;
  onMouseDown: (e: React.MouseEvent) => void;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
  onSelect: () => void;
  onDoubleClick: () => void;
  onAuxClick: (e: React.MouseEvent) => void;
  onClose: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function TabItem({
  tab,
  isActive,
  isDragging,
  displayName,
  width,
  onMouseDown,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onSelect,
  onDoubleClick,
  onAuxClick,
  onClose,
  onContextMenu,
}: TabItemProps) {
  const { t } = useLocaleStore();
  const hasLeadingIcon = tab.type !== "new-tab";
  const isCompact = width < TAB_COMPACT_WIDTH_PX;
  const isMini = width < TAB_MINI_WIDTH_PX;
  const showLabel = !isMini || !hasLeadingIcon;
  const showClose = !tab.isPinned && (!isCompact || isActive);
  const diskStatus =
    tab.diskStatus && tab.diskStatus !== "clean" ? tab.diskStatus : null;
  const diskStatusLabel =
    diskStatus === "deleted"
      ? t.tabBar.deletedOnDisk
      : diskStatus === "conflict"
        ? t.tabBar.saveConflict
        : diskStatus === "modified"
          ? t.tabBar.modifiedOnDisk
          : null;

  return (
    <div
      role="tab"
      aria-selected={isActive}
      title={
        diskStatusLabel ? `${displayName} - ${diskStatusLabel}` : displayName
      }
      data-tauri-drag-region="false"
      className="group relative h-full w-full cursor-default select-none"
      onMouseDown={onMouseDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      onAuxClick={onAuxClick}
      onContextMenu={onContextMenu}
    >
      <TabShape isActive={isActive} isDragging={isDragging} isDropTarget={false} />
      <div
        className={cn(
          "relative flex h-full items-center text-ui-control transition-colors duration-150",
          isMini ? "justify-center px-[18px]" : isCompact ? "gap-1.5 pl-6 pr-4" : "gap-2 pl-7 pr-5",
          isActive || isDragging ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
        )}
      >
        {tab.type === "new-tab" ? null : tab.type === "graph" || tab.type === "isolated-graph" ? (
          <Network size={14} className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
        ) : tab.type === "pdf" ? (
          <FileText size={14} className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
        ) : tab.type === "diagram" ? (
          <Shapes size={14} className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
        ) : tab.type === "plugin-view" || tab.type === "extensions-center" ? (
          <Puzzle size={14} className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
        ) : tab.type === "image-manager" || tab.type === "image" ? (
          <Images size={14} className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
        ) : (
          <FileText size={14} className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
        )}
        {showLabel && (
          <span className={cn("flex-1 truncate min-w-0", tab.isPreview && "italic")}>{displayName}</span>
        )}
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
        {diskStatus === "deleted" ? (
          <FileX
            size={12}
            className="shrink-0 text-destructive"
            aria-label={diskStatusLabel ?? undefined}
          />
        ) : diskStatus ? (
          <AlertTriangle
            size={12}
            className={cn(
              "shrink-0",
              diskStatus === "conflict" ? "text-destructive" : "text-warning",
            )}
            aria-label={diskStatusLabel ?? undefined}
          />
        ) : null}
        {showClose && (
          <button
            data-tauri-drag-region="false"
            onClick={onClose}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={t.tabBar.close}
            className={cn(
              "mr-1 shrink-0 p-0.5 rounded-ui-sm",
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
  tabId: string;
}

interface ClosingGhost {
  tab: Tab;
  index: number;
}

interface TabBounds {
  x: number;
  width: number;
}

type ProjectableTab = Pick<Tab, "id" | "isPinned">;

interface DragState {
  tabId: string;
  pointerId: number;
  startClientX: number;
  offsetX: number;
  hasMoved: boolean;
  isDragging: boolean;
}

function areTabIdArraysEqual(a: string[] | null, b: string[] | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((id, index) => id === b[index]);
}

function closestIndex(value: number, values: number[]): number {
  let closestDistance = Infinity;
  let closest = -1;
  values.forEach((candidate, index) => {
    const distance = Math.abs(value - candidate);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = index;
    }
  });
  return closest;
}

export function projectDraggedTabOrder(
  tabId: string,
  offsetX: number,
  orderedOpenTabs: ProjectableTab[],
  tabLayouts: Map<string, TabBounds>,
): string[] | null {
  const movedTab = orderedOpenTabs.find((tab) => tab.id === tabId);
  const draggedBounds = tabLayouts.get(tabId);
  if (!movedTab || !draggedBounds) return null;

  const sameGroupTabs = orderedOpenTabs.filter((tab) => tab.isPinned === movedTab.isPinned);
  const sameGroupPositions: number[] = [];
  for (const tab of sameGroupTabs) {
    const bounds = tabLayouts.get(tab.id);
    if (!bounds) return null;
    sameGroupPositions.push(bounds.x);
  }

  const draggedX = draggedBounds.x + offsetX;
  const destinationIndex = closestIndex(draggedX, sameGroupPositions as number[]);
  if (destinationIndex === -1) return null;

  const sameGroupWithoutDragged = sameGroupTabs.filter((tab) => tab.id !== tabId);
  const projectedGroupIds = sameGroupWithoutDragged.map((tab) => tab.id);
  projectedGroupIds.splice(destinationIndex, 0, tabId);

  let groupCursor = 0;
  return orderedOpenTabs.map((tab) => {
    if (tab.isPinned !== movedTab.isPinned) return tab.id;
    const nextId = projectedGroupIds[groupCursor];
    groupCursor += 1;
    return nextId;
  });
}

function clampTabWidth(width: number): number {
  return Math.max(TAB_MIN_WIDTH_PX, Math.min(TAB_MAX_WIDTH_PX, width));
}

async function preloadTabBeforeSwitch(tab: Tab): Promise<void> {
  if (!tab.path) return;
  if (tab.type === "image") {
    const { preloadImage } = await import("@/components/images/ImageViewer");
    await preloadImage(tab.path);
  } else if (tab.type === "pdf") {
    const { preloadPDF } = await import("@/components/pdf/PDFViewer");
    await preloadPDF(tab.path);
  } else if (tab.type === "diagram") {
    const { preloadDiagram } = await import("@/components/diagram/DiagramView");
    await preloadDiagram(tab.path);
  }
}

export function TabBar() {
  const { t } = useLocaleStore();
  const { tabs, activeTabIndex, openNewTab, switchTab, closeTab, closeOtherTabs, closeAllTabs, togglePinTab, promotePreviewTab, save } =
    useFileStore(
      useShallow((state) => ({
        tabs: state.tabs,
        activeTabIndex: state.activeTabIndex,
        openNewTab: state.openNewTab,
        switchTab: state.switchTab,
        closeTab: state.closeTab,
        closeOtherTabs: state.closeOtherTabs,
        closeAllTabs: state.closeAllTabs,
        togglePinTab: state.togglePinTab,
        promotePreviewTab: state.promotePreviewTab,
        save: state.save,
      })),
    );
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const tabListRef = useRef<HTMLDivElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef(tabs);
  const [tabListWidth, setTabListWidth] = useState(0);
  // 1×1 invisible div positioned at the right-click coordinates so the
  // Popover has a real DOM element to anchor against. Without it the menu
  // would have no stable position to recompute against on resize / scroll.
  const contextAnchorRef = useRef<HTMLDivElement>(null);
  const showMacTopActions = useMacTopChromeEnabled();
  const {
    leftSidebarOpen,
    rightSidebarOpen,
    isDarkMode,
    toggleLeftSidebar,
    toggleRightSidebar,
  } = useUIStore(
    useShallow((state) => ({
      leftSidebarOpen: state.leftSidebarOpen,
      rightSidebarOpen: state.rightSidebarOpen,
      isDarkMode: state.isDarkMode,
      toggleLeftSidebar: state.toggleLeftSidebar,
      toggleRightSidebar: state.toggleRightSidebar,
    })),
  );
  const activeTab = activeTabIndex >= 0 ? tabs[activeTabIndex] : null;
  const isDarkDiagramTab = isDarkMode && activeTab?.type === "diagram";
  const showMacTrafficLightInset = showMacTopActions && !leftSidebarOpen;
  const reduceMotion = useReducedMotion();
  const reorderTabs = useFileStore((state) => state.reorderTabs);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useLayoutEffect(() => {
    const node = scrollViewportRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;

    const updateWidth = () => {
      setTabListWidth(node.getBoundingClientRect().width);
    };
    updateWidth();

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setTabListWidth(width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const handleSelectTab = useCallback(
    (tab: Tab, index: number) => {
      switchTab(index);
      void (async () => {
        try {
          await preloadTabBeforeSwitch(tab);
        } catch (error) {
          reportOperationError({
            source: "TabBar",
            action: "Preload tab before switch",
            error,
            level: "warning",
            context: { tabId: tab.id, type: tab.type, path: tab.path },
          });
        }
      })();
    },
    [switchTab],
  );

  // IDs of tabs currently animating their close. The store is updated first;
  // AnimatePresence keeps the removed DOM node alive briefly as a visual ghost
  // while the remaining tabs retarget to their new ideal bounds.
  const [closingGhosts, setClosingGhosts] = useState<Map<string, ClosingGhost>>(() => new Map());
  const [enteringIds, setEnteringIds] = useState<Set<string>>(() => new Set());
  const [frozenWidths, setFrozenWidths] = useState<Map<string, number> | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [projectedTabIds, setProjectedTabIds] = useState<string[] | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const tabNodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragStateRef = useRef<DragState | null>(null);
  const dragClickSuppressionRef = useRef<string | null>(null);
  const dragClickSuppressionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartLayoutsRef = useRef<Map<string, TabBounds> | null>(null);
  const dragStartOpenTabsRef = useRef<Tab[] | null>(null);
  const previousTabIdsRef = useRef<Set<string>>(new Set(tabs.map((tab) => tab.id)));
  const timeouts = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const releaseFrozenWidthsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearDragProjectionFrame = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      for (const t of timeouts.current) clearTimeout(t);
      timeouts.current.clear();
      if (clearDragProjectionFrame.current !== null) {
        cancelAnimationFrame(clearDragProjectionFrame.current);
      }
      if (dragClickSuppressionTimeout.current !== null) {
        clearTimeout(dragClickSuppressionTimeout.current);
      }
      // 卸载兜底：万一拖拽中组件被销毁，确保 body class 被清掉
      dragStateRef.current = null;
      document.body.classList.remove("lumina-tab-dragging");
    };
  }, []);

  useLayoutEffect(() => {
    const previousIds = previousTabIdsRef.current;
    const currentIds = new Set(tabs.map((tab) => tab.id));
    const addedIds = tabs
      .map((tab) => tab.id)
      .filter((id) => !previousIds.has(id));

    previousTabIdsRef.current = currentIds;
    if (reduceMotion || addedIds.length === 0) return;

    setEnteringIds((prev) => {
      const next = new Set(prev);
      for (const id of addedIds) next.add(id);
      return next;
    });

    const timeout = setTimeout(() => {
      timeouts.current.delete(timeout);
      setEnteringIds((prev) => {
        const next = new Set(prev);
        for (const id of addedIds) next.delete(id);
        return next;
      });
    }, 0);
    timeouts.current.add(timeout);
  }, [reduceMotion, tabs]);

  const freezeTabWidthsForCloseBatch = useCallback(() => {
    const next = new Map<string, number>();
    for (const tab of tabs) {
      const width = tabNodeRefs.current.get(tab.id)?.getBoundingClientRect().width;
      if (width && width > 0) {
        next.set(tab.id, width);
      }
    }
    if (next.size > 0) {
      setFrozenWidths(next);
    }

    if (releaseFrozenWidthsTimeout.current) {
      clearTimeout(releaseFrozenWidthsTimeout.current);
      timeouts.current.delete(releaseFrozenWidthsTimeout.current);
    }

    const timeout = setTimeout(() => {
      timeouts.current.delete(timeout);
      if (releaseFrozenWidthsTimeout.current === timeout) {
        releaseFrozenWidthsTimeout.current = null;
      }
      setFrozenWidths(null);
    }, CLOSE_BATCH_WIDTH_FREEZE_MS);

    releaseFrozenWidthsTimeout.current = timeout;
    timeouts.current.add(timeout);
  }, [tabs]);

  const closingIds = useMemo(
    () => new Set(closingGhosts.keys()),
    [closingGhosts],
  );

  const openTabsForLayout = useMemo(
    () => tabs.filter((tab) => !closingIds.has(tab.id)),
    [closingIds, tabs],
  );

  const orderedOpenTabsForLayout = useMemo(() => {
    if (!projectedTabIds) return openTabsForLayout;

    const tabById = new Map(openTabsForLayout.map((tab) => [tab.id, tab]));
    const projectedTabs = projectedTabIds
      .map((id) => tabById.get(id))
      .filter((tab): tab is Tab => Boolean(tab));
    const projectedIdSet = new Set(projectedTabs.map((tab) => tab.id));
    const missingTabs = openTabsForLayout.filter((tab) => !projectedIdSet.has(tab.id));

    return [...projectedTabs, ...missingTabs];
  }, [openTabsForLayout, projectedTabIds]);

  const tabLayouts = useMemo(() => {
    const layouts = new Map<string, TabBounds>();
    const openCount = orderedOpenTabsForLayout.length;
    const availableWidth = Math.max(0, tabListWidth - TAB_NEW_BUTTON_WIDTH_PX - TAB_END_PADDING_PX);
    const defaultWidth =
      openCount > 0
        ? clampTabWidth((availableWidth + TAB_OVERLAP_PX * Math.max(0, openCount - 1)) / openCount)
        : TAB_MAX_WIDTH_PX;

    let x = 0;
    for (const tab of orderedOpenTabsForLayout) {
      const width = frozenWidths?.get(tab.id) ?? defaultWidth;
      layouts.set(tab.id, { x, width });
      x += width - TAB_OVERLAP_PX;
    }

    for (const ghost of closingGhosts.values()) {
      const prevOpen = [...tabs.slice(0, ghost.index)]
        .reverse()
        .find((tab) => !closingIds.has(tab.id));
      const nextOpen = tabs
        .slice(ghost.index)
        .find((tab) => !closingIds.has(tab.id));
      let closeX = 0;

      if (prevOpen && layouts.has(prevOpen.id)) {
        const prev = layouts.get(prevOpen.id)!;
        closeX = prev.x + prev.width - TAB_OVERLAP_PX;
      } else if (nextOpen && layouts.has(nextOpen.id)) {
        closeX = layouts.get(nextOpen.id)!.x;
      }

      layouts.set(ghost.tab.id, { x: closeX, width: TAB_OVERLAP_PX });
    }

    return layouts;
  }, [closingGhosts, closingIds, frozenWidths, orderedOpenTabsForLayout, tabListWidth, tabs]);

  const openTabsContentWidth = useMemo(() => {
    if (openTabsForLayout.length === 0) return 0;
    return openTabsForLayout.reduce((rightEdge, tab) => {
      const bounds = tabLayouts.get(tab.id);
      return bounds ? Math.max(rightEdge, bounds.x + bounds.width) : rightEdge;
    }, 0);
  }, [openTabsForLayout, tabLayouts]);

  const tabListContentWidth = Math.max(
    tabListWidth,
    openTabsContentWidth + TAB_NEW_BUTTON_WIDTH_PX + TAB_END_PADDING_PX,
  );
  const newTabButtonX = openTabsContentWidth;

  const visualTabs = useMemo(() => {
    const ghosts = [...closingGhosts.values()].map((ghost) => ({
      tab: ghost.tab,
      storeIndex: ghost.index,
      isClosing: true,
    }));
    const open = tabs
      .map((tab, index) => ({
        tab,
        storeIndex: index,
        isClosing: false,
      }))
      .filter((item) => !closingIds.has(item.tab.id));

    return [...ghosts, ...open];
  }, [closingGhosts, closingIds, tabs]);

  const handleTabDragMove = useCallback((tabId: string, offsetX: number) => {
    const startOpenTabs = dragStartOpenTabsRef.current;
    const startLayouts = dragStartLayoutsRef.current;
    if (!startOpenTabs || !startLayouts) return;

    setDragOffsetX(offsetX);
    const projectedIds = projectDraggedTabOrder(tabId, offsetX, startOpenTabs, startLayouts);
    setProjectedTabIds((prev) => areTabIdArraysEqual(prev, projectedIds) ? prev : projectedIds);
  }, []);

  const handleTabDragEnd = useCallback(
    (tabId: string, offsetX: number): boolean => {
      if (closingIds.has(tabId)) return false;

      const startOpenTabs = dragStartOpenTabsRef.current ?? tabs.filter((tab) => !closingIds.has(tab.id));
      const startLayouts = dragStartLayoutsRef.current ?? tabLayouts;
      const fromIndex = tabs.findIndex((tab) => tab.id === tabId);
      if (fromIndex === -1) return false;

      const nextOrder = projectDraggedTabOrder(tabId, offsetX, startOpenTabs, startLayouts);
      if (!nextOrder) return false;

      const finalOpenIndex = nextOrder.findIndex((id) => id === tabId);
      const openStoreIndexes = startOpenTabs.map((tab) =>
        tabs.findIndex((item) => item.id === tab.id),
      );
      const targetStoreIndex = openStoreIndexes[finalOpenIndex] ?? fromIndex;

      if (targetStoreIndex !== fromIndex) {
        reorderTabs(fromIndex, targetStoreIndex);
        return true;
      }
      return false;
    },
    [closingIds, reorderTabs, tabLayouts, tabs],
  );

  const clearDragProjectionAfterCommit = useCallback(() => {
    if (clearDragProjectionFrame.current !== null) {
      cancelAnimationFrame(clearDragProjectionFrame.current);
    }
    clearDragProjectionFrame.current = requestAnimationFrame(() => {
      clearDragProjectionFrame.current = null;
      setProjectedTabIds(null);
    });
  }, []);

  const clearDragState = useCallback(() => {
    dragStateRef.current = null;
    setDraggingTabId(null);
    setDragOffsetX(0);
    document.body.classList.remove("lumina-tab-dragging");
  }, []);

  const suppressNextTabClick = useCallback((tabId: string) => {
    dragClickSuppressionRef.current = tabId;
    if (dragClickSuppressionTimeout.current !== null) {
      clearTimeout(dragClickSuppressionTimeout.current);
    }
    dragClickSuppressionTimeout.current = setTimeout(() => {
      if (dragClickSuppressionRef.current === tabId) {
        dragClickSuppressionRef.current = null;
      }
      dragClickSuppressionTimeout.current = null;
    }, 0);
  }, []);

  const beginTabDrag = useCallback((tabId: string, pointerId: number, startClientX: number) => {
    if (clearDragProjectionFrame.current !== null) {
      cancelAnimationFrame(clearDragProjectionFrame.current);
      clearDragProjectionFrame.current = null;
    }
    dragStateRef.current = {
      tabId,
      pointerId,
      startClientX,
      offsetX: 0,
      hasMoved: false,
      isDragging: false,
    };
    setDragOffsetX(0);
  }, []);

  const updateTabDrag = useCallback((pointerId: number, clientX: number, captureTarget?: HTMLElement) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== pointerId) return;

    const offsetX = clientX - dragState.startClientX;
    dragState.offsetX = offsetX;
    if (!dragState.isDragging && Math.abs(offsetX) > 3) {
      dragState.hasMoved = true;
      dragState.isDragging = true;
      // Capture only once movement crosses the drag threshold. Capturing on
      // pointerdown locks the browser's :hover to the captured tab for the
      // duration of every click, which intermittently prevented hover state
      // from updating on neighboring tabs after a click+move.
      if (captureTarget && !captureTarget.hasPointerCapture(pointerId)) {
        try {
          captureTarget.setPointerCapture(pointerId);
        } catch {
          // Pointer capture can fail if the element was unmounted between
          // the threshold crossing and this call; the drag logic doesn't
          // depend on capture succeeding.
        }
      }
      setDraggingTabId(dragState.tabId);
      dragStartLayoutsRef.current = new Map(tabLayouts);
      dragStartOpenTabsRef.current = openTabsForLayout;
      setProjectedTabIds(openTabsForLayout.map((item) => item.id));
      document.body.classList.add("lumina-tab-dragging");
    }

    if (dragState.isDragging) {
      dragState.hasMoved = true;
      handleTabDragMove(dragState.tabId, offsetX);
    }
  }, [handleTabDragMove, openTabsForLayout, tabLayouts]);

  const finishTabDrag = useCallback((pointerId: number): boolean => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== pointerId) return false;

    const { tabId, offsetX, hasMoved, isDragging } = dragState;
    const didReorder = isDragging ? handleTabDragEnd(tabId, offsetX) : false;
    dragStartLayoutsRef.current = null;
    dragStartOpenTabsRef.current = null;
    clearDragState();
    if (didReorder) {
      clearDragProjectionAfterCommit();
    } else {
      setProjectedTabIds(null);
    }
    if (hasMoved) {
      suppressNextTabClick(tabId);
    }
    return hasMoved;
  }, [clearDragProjectionAfterCommit, handleTabDragEnd, suppressNextTabClick]);

  const suppressClickAfterDrag = useCallback((tabId: string): boolean => (
    draggingTabId === tabId
      || dragStateRef.current?.tabId === tabId
      || dragClickSuppressionRef.current === tabId
  ), [draggingTabId]);

  const cancelTabDrag = useCallback((pointerId: number) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== pointerId) return;
    dragStartLayoutsRef.current = null;
    dragStartOpenTabsRef.current = null;
    clearDragState();
    setProjectedTabIds(null);
  }, [clearDragState]);

  const animateClose = useCallback((tabId: string) => {
    freezeTabWidthsForCloseBatch();
    const closeIndex = tabsRef.current.findIndex((tab) => tab.id === tabId);
    const tab = closeIndex >= 0 ? tabsRef.current[closeIndex] : null;
    if (!tab) return;

    setClosingGhosts((prev) => {
      if (prev.has(tabId)) return prev;
      const next = new Map(prev);
      next.set(tabId, { tab, index: closeIndex });
      return next;
    });

    if (closeIndex >= 0) {
      void closeTab(closeIndex).catch((error) => {
        reportOperationError({
          source: "TabBar.animateClose",
          action: "Close tab",
          error,
          context: { tabId },
        });
        setClosingGhosts((prev) => {
          if (!prev.has(tabId)) return prev;
          const next = new Map(prev);
          next.delete(tabId);
          return next;
        });
      });
    }

    const timeout = setTimeout(() => {
      timeouts.current.delete(timeout);
      setClosingGhosts((prev) => {
        if (!prev.has(tabId)) return prev;
        const next = new Map(prev);
        next.delete(tabId);
        return next;
      });
    }, TAB_BOUNDS_ANIMATION_MS + 80);
    timeouts.current.add(timeout);
  }, [closeTab, freezeTabWidthsForCloseBatch]);

  const handleContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId });
  }, []);

  const handleClose = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      const tab = tabs[index];
      if (tab) animateClose(tab.id);
    },
    [tabs, animateClose]
  );

  const handleOpenNewTab = useCallback(() => {
    openNewTab();
  }, [openNewTab]);

  const scrollActiveTabIntoView = useCallback((tabId: string) => {
    const viewport = scrollViewportRef.current;
    const bounds = tabLayouts.get(tabId);
    if (!viewport || !bounds) return;

    const left = bounds.x;
    const right = bounds.x + bounds.width;
    const viewportLeft = viewport.scrollLeft;
    const viewportRight = viewportLeft + viewport.clientWidth;
    const padding = 8;

    const scrollToLeft = (nextLeft: number) => {
      if (typeof viewport.scrollTo === "function") {
        viewport.scrollTo({ left: nextLeft, behavior: "auto" });
      } else {
        viewport.scrollLeft = nextLeft;
      }
    };

    if (left < viewportLeft + padding) {
      scrollToLeft(Math.max(0, left - padding));
    } else if (right > viewportRight - padding) {
      scrollToLeft(Math.max(0, right - viewport.clientWidth + padding));
    }
  }, [tabLayouts]);

  useEffect(() => {
    if (draggingTabId) return;
    const activeId = activeTabIndex >= 0 ? tabs[activeTabIndex]?.id : null;
    if (!activeId) return;
    scrollActiveTabIntoView(activeId);
  }, [activeTabIndex, draggingTabId, scrollActiveTabIntoView, tabs]);

  const handleTabWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return;
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (delta === 0) return;
    const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth;
    if (maxScrollLeft <= 0) return;
    e.preventDefault();
    viewport.scrollLeft = Math.max(0, Math.min(maxScrollLeft, viewport.scrollLeft + delta));
  }, []);

  const contextTab = contextMenu
    ? tabs.find((tab) => tab.id === contextMenu.tabId) ?? null
    : null;
  const contextTabIndex = contextMenu
    ? tabs.findIndex((tab) => tab.id === contextMenu.tabId)
    : -1;

  const leftSidebarToggleLabel = leftSidebarOpen
    ? t.sidebar.collapseLeftSidebar
    : t.sidebar.expandLeftSidebar;
  const rightSidebarToggleLabel = rightSidebarOpen
    ? t.sidebar.collapseRightPanel
    : t.sidebar.expandRightPanel;

  return (
    <>
      <div
        className={cn(
          "lumina-tabbar relative flex h-11 shrink-0 items-stretch bg-popover dark:bg-background [--tab-active-fill:hsl(var(--popover))] dark:[--tab-active-fill:hsl(var(--background))]",
          isDarkDiagramTab &&
            "!bg-[hsl(var(--diagram-surface))] [--tab-active-fill:hsl(var(--diagram-surface))]",
        )}
        data-tauri-drag-region={showMacTopActions ? true : undefined}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-px bg-border/60"
          data-testid="mac-tabbar-bottom-rule"
        />
        <div
          className={cn(TABBAR_EDGE_SLOT_CLASS, "relative z-10")}
          data-testid="mac-tabbar-left-sidebar-slot"
          data-tauri-drag-region="false"
        >
          <button
            type="button"
            data-testid="mac-tabbar-toggle-left-sidebar"
            data-tauri-drag-region="false"
            onClick={toggleLeftSidebar}
            aria-label={leftSidebarToggleLabel}
            aria-pressed={leftSidebarOpen}
            title={leftSidebarToggleLabel}
            className={cn(
              TABBAR_ICON_BUTTON_CLASS,
              leftSidebarOpen && TABBAR_ICON_BUTTON_OPEN_CLASS,
            )}
          >
            <SidebarStateIcon
              side="left"
              open={leftSidebarOpen}
              reduceMotion={reduceMotion}
            />
          </button>
        </div>
        <div
          className="relative z-10 flex min-w-0 flex-1 items-stretch overflow-hidden px-1 pt-1.5"
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
          <div
            ref={scrollViewportRef}
            className="relative h-full min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            data-testid="mac-tabbar-tabs"
            onWheel={handleTabWheel}
          >
            <div
              ref={tabListRef}
              role="tablist"
              aria-orientation="horizontal"
              className="relative h-full"
              style={{ width: tabListContentWidth }}
            >
              <AnimatePresence initial={false}>
                {visualTabs.map(({ tab, storeIndex, isClosing }) => {
                  const bounds = tabLayouts.get(tab.id) ?? { x: 0, width: TAB_MIN_WIDTH_PX };
                  const isEntering = enteringIds.has(tab.id);
                  const activeTabId = activeTabIndex >= 0 ? tabs[activeTabIndex]?.id : null;
                  const isActive = !isClosing && tab.id === activeTabId;
                  const isDragging = !isClosing && draggingTabId === tab.id;
                  const initialWidth = isEntering ? TAB_OVERLAP_PX : bounds.width;
                  const tabX = dragStartLayoutsRef.current?.get(tab.id)?.x ?? bounds.x;
                  const tabStyle = {
                    width: bounds.width,
                    flexBasis: bounds.width,
                    minWidth: bounds.width,
                    maxWidth: bounds.width,
                    pointerEvents: isClosing ? "none" as const : undefined,
                  };
                  const displayName =
                    tab.type === "ai-chat"
                      ? t.common.aiChatTab
                      : tab.type === "graph"
                        ? t.graph.title
                        : tab.type === "extensions-center"
                          ? t.plugins.modalTitle
                        : tab.name;
                  return (
                    <motion.div
                      key={tab.id}
                      ref={(node: HTMLDivElement | null) => {
                        if (node) {
                          tabNodeRefs.current.set(tab.id, node);
                        } else {
                          tabNodeRefs.current.delete(tab.id);
                        }
                      }}
                      data-testid={`mac-tabbar-tab-${tab.id}`}
                      initial={
                        reduceMotion
                          ? false
                          : {
                              x: tabX,
                              width: initialWidth,
                              opacity: 0.45,
                              y: 7,
                            }
                      }
                      animate={{
                        // Drag offset lives on the outer (layout) box rather
                        // than an inner translateX. The outer carries
                        // overflow-hidden for the close/resize animations, so
                        // a translated inner gets clipped at the outer's
                        // right edge — making the dragged tab look "covered
                        // by a rectangle with a straight left edge".
                        x: isDragging ? tabX + dragOffsetX : bounds.x,
                        width: bounds.width,
                        opacity: isClosing ? 0 : 1,
                        y: 0,
                      }}
                      exit={
                        reduceMotion
                          ? { opacity: 0 }
                          : {
                              width: TAB_OVERLAP_PX,
                              opacity: 0,
                              y: 0,
                            }
                      }
                      transition={{
                        duration: isDragging || reduceMotion ? 0 : TAB_BOUNDS_ANIMATION_MS / 1000,
                        ease: [0.2, 0, 0, 1],
                      }}
                      style={tabStyle}
                      className={cn(
                        "absolute bottom-0 top-0 overflow-hidden",
                        isClosing && "pointer-events-none",
                        // Active tab sits above its neighbors so its silhouette
                        // outline (and white fill) cleanly overlays the overlapping
                        // ears of the inactive tabs on either side.
                        isDragging ? "z-30" : isActive ? "z-10" : "z-0 hover:z-[5]"
                      )}
                    >
                      <motion.div
                        className="h-full w-full"
                        initial={reduceMotion ? false : { opacity: 0, scale: 0.985 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{
                          opacity: { duration: 0.16, ease: [0.2, 0.9, 0.1, 1] },
                          scale: { duration: 0.16, ease: [0.2, 0.9, 0.1, 1] },
                        }}
                      >
                        <TabItem
                          tab={tab}
                          isActive={isActive}
                          isDragging={isDragging}
                          displayName={displayName}
                          width={bounds.width}
                          onMouseDown={(e) => {
                            if (e.button === 1) e.preventDefault();
                          }}
                          onPointerDown={(e) => {
                            if (isClosing || e.button !== 0) return;
                            beginTabDrag(tab.id, e.pointerId, e.clientX);
                          }}
                          onPointerMove={(e) => {
                            updateTabDrag(e.pointerId, e.clientX, e.currentTarget as HTMLElement);
                          }}
                          onPointerUp={(e) => {
                            if (isClosing) return;
                            const hadDragMovement = finishTabDrag(e.pointerId);
                            if (hadDragMovement) {
                              e.preventDefault();
                              e.stopPropagation();
                            }
                            if ((e.currentTarget as HTMLDivElement).hasPointerCapture(e.pointerId)) {
                              (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
                            }
                          }}
                          onPointerCancel={(e) => {
                            cancelTabDrag(e.pointerId);
                            if ((e.currentTarget as HTMLDivElement).hasPointerCapture(e.pointerId)) {
                              (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
                            }
                          }}
                          onSelect={() => {
                            if (!isClosing && !suppressClickAfterDrag(tab.id)) {
                              handleSelectTab(tab, storeIndex);
                            }
                          }}
                          onDoubleClick={() => {
                            if (!isClosing && tab.isPreview) {
                              promotePreviewTab(tab.id);
                            }
                          }}
                          onAuxClick={(e) => {
                            if (e.button !== 1 || isClosing || tab.isPinned) return;
                            e.preventDefault();
                            animateClose(tab.id);
                          }}
                          onClose={(e) => handleClose(e, storeIndex)}
                          onContextMenu={(e) => handleContextMenu(e, tab.id)}
                        />
                      </motion.div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              <motion.div
                className="absolute bottom-0 top-0 z-20 flex w-10 items-center justify-center pt-0.5"
                data-testid="mac-tabbar-new-tab-slot"
                data-tauri-drag-region="false"
                initial={false}
                animate={{ x: newTabButtonX }}
                transition={{
                  duration: reduceMotion ? 0 : TAB_BOUNDS_ANIMATION_MS / 1000,
                  ease: [0.2, 0, 0, 1],
                }}
              >
                <button
                  type="button"
                  data-testid="mac-tabbar-new-tab"
                  data-tauri-drag-region="false"
                  onClick={handleOpenNewTab}
                  aria-label={t.tabBar.newTab}
                  title={t.tabBar.newTab}
                  className={TABBAR_ICON_BUTTON_CLASS}
                >
                  <Plus size={16} />
                </button>
              </motion.div>
            </div>
          </div>
        </div>
        <div
          className={cn(TABBAR_EDGE_SLOT_CLASS, "relative z-10")}
          data-testid="mac-tabbar-right-sidebar-slot"
          data-tauri-drag-region="false"
        >
          <button
            type="button"
            data-testid="mac-tabbar-toggle-right-sidebar"
            data-tauri-drag-region="false"
            onClick={toggleRightSidebar}
            aria-label={rightSidebarToggleLabel}
            aria-pressed={rightSidebarOpen}
            title={rightSidebarToggleLabel}
            className={cn(
              TABBAR_ICON_BUTTON_CLASS,
              rightSidebarOpen && TABBAR_ICON_BUTTON_OPEN_CLASS,
            )}
          >
            <SidebarStateIcon
              side="right"
              open={rightSidebarOpen}
              reduceMotion={reduceMotion}
            />
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
            {contextMenu && contextTab && contextTabIndex >= 0 && (
              <>
                <Row
                  density="compact"
                  icon={
                    <Pin
                      size={12}
                      className={
                        contextTab.isPinned ? "" : "rotate-45"
                      }
                    />
                  }
                  title={
                    contextTab.isPinned
                      ? t.tabBar.unpin
                      : t.tabBar.pin
                  }
                  role="menuitem"
                  onSelect={() => {
                    togglePinTab(contextTabIndex);
                    setContextMenu(null);
                  }}
                />
                {contextTab.diskStatus &&
                  contextTab.diskStatus !== "clean" && (
                    <Row
                      density="compact"
                      icon={<AlertTriangle size={12} />}
                      title={t.tabBar.overwriteDiskFile}
                      role="menuitem"
                      onSelect={() => {
                        switchTab(contextTabIndex);
                        void save({ overwrite: true });
                        setContextMenu(null);
                      }}
                    />
                  )}
                <div
                  role="separator"
                  className="my-1 h-px bg-border/60"
                />
                <Row
                  density="compact"
                  title={t.tabBar.close}
                  role="menuitem"
                  disabled={contextTab.isPinned}
                  onSelect={() => {
                    animateClose(contextTab.id);
                    setContextMenu(null);
                  }}
                />
                <Row
                  density="compact"
                  title={t.tabBar.closeOthers}
                  role="menuitem"
                  onSelect={() => {
                    closeOtherTabs(contextTabIndex);
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
