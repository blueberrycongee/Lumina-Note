import "@excalidraw/excalidraw/index.css";
import { CaptureUpdateAction, Excalidraw, restore, serializeAsJSON } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquareQuote, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { readFile, saveFile } from "@/lib/tauri";
import { useAIStore } from "@/stores/useAIStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useUIStore } from "@/stores/useUIStore";

interface DiagramViewProps {
  filePath: string;
  externalContent?: string;
  className?: string;
}

const SAVE_DEBOUNCE_MS = 700;
const MAX_QUOTED_ELEMENTS = 12;

function getSelectedElementIds(appState: unknown): string[] {
  if (!appState) return [];
  if (typeof appState !== "object" || Array.isArray(appState)) return [];
  const selectedElementIds = (appState as { selectedElementIds?: unknown }).selectedElementIds;
  if (!selectedElementIds || typeof selectedElementIds !== "object" || Array.isArray(selectedElementIds)) {
    return [];
  }
  return Object.entries(selectedElementIds as Record<string, unknown>)
    .filter(([, selected]) => Boolean(selected))
    .map(([id]) => id);
}

function formatElementText(element: OrderedExcalidrawElement): string {
  const text = "text" in element ? (element as { text?: unknown }).text : undefined;
  if (typeof text !== "string") {
    return "";
  }
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > 60 ? `${normalized.slice(0, 60)}...` : normalized;
}

function buildDiagramQuoteText(
  filePath: string,
  elements: readonly OrderedExcalidrawElement[],
  cappedCount: number,
  labels: {
    referenceHeader: string;
    pathLabel: string;
    elementsLabel: string;
    typeBreakdownLabel: string;
    itemsLabel: string;
    noneLabel: string;
    omittedSuffix: string;
  },
): string {
  const typeCounts = new Map<string, number>();
  for (const element of elements) {
    typeCounts.set(element.type, (typeCounts.get(element.type) || 0) + 1);
  }

  const typeSummary =
    typeCounts.size > 0
      ? Array.from(typeCounts.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([type, count]) => `${type}:${count}`)
          .join(", ")
      : labels.noneLabel;

  const lines = [
    labels.referenceHeader,
    `${labels.pathLabel}: ${filePath}`,
    `${labels.elementsLabel}: ${elements.length}`,
    `${labels.typeBreakdownLabel}: ${typeSummary}`,
    `${labels.itemsLabel}:`,
  ];

  elements.slice(0, cappedCount).forEach((element, index) => {
    const x = Math.round(element.x);
    const y = Math.round(element.y);
    const width = Math.round(element.width);
    const height = Math.round(element.height);
    const textSnippet = formatElementText(element);
    lines.push(
      `${index + 1}. id=${element.id} type=${element.type} rect=(${x},${y},${width},${height})${
        textSnippet ? ` text="${textSnippet}"` : ""
      }`,
    );
  });

  if (elements.length > cappedCount) {
    lines.push(`... ${elements.length - cappedCount} ${labels.omittedSuffix}`);
  }

  return lines.join("\n");
}

const createInitialScene = (): ExcalidrawInitialDataState => {
  const restored = restore({ elements: [], appState: {}, files: {} }, null, null);
  return {
    elements: restored.elements,
    appState: restored.appState,
    files: restored.files,
  };
};

function normalizeSceneFromRaw(raw: string): {
  normalizedState: ExcalidrawInitialDataState;
  serialized: string;
  selectedIds: string[];
} {
  const parsed = raw.trim().length > 0 ? (JSON.parse(raw) as Record<string, unknown>) : null;
  const restored = restore(parsed as any, null, null);
  const normalizedState: ExcalidrawInitialDataState = {
    elements: restored.elements,
    appState: restored.appState,
    files: restored.files,
  };
  const selectedIds = getSelectedElementIds(normalizedState.appState);
  const serialized = serializeAsJSON(
    normalizedState.elements as OrderedExcalidrawElement[],
    normalizedState.appState || {},
    normalizedState.files || {},
    "local",
  );
  return { normalizedState, serialized, selectedIds };
}

export function DiagramView({ filePath, externalContent, className }: DiagramViewProps) {
  const { t } = useLocaleStore();
  const isDarkMode = useUIStore((state) => state.isDarkMode);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState>(() => createInitialScene());
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [selectedElementCount, setSelectedElementCount] = useState(0);
  const saveTimerRef = useRef<number | null>(null);
  const lastSavedSerializedRef = useRef("");
  const pendingSerializedRef = useRef<string | null>(null);
  const latestElementsRef = useRef<readonly OrderedExcalidrawElement[]>([]);
  const selectedElementIdsRef = useRef<string[]>([]);
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);

  const applySceneSnapshot = useCallback(
    (snapshot: ExcalidrawInitialDataState, serialized: string, selectedIds: string[]) => {
      lastSavedSerializedRef.current = serialized;
      latestElementsRef.current = snapshot.elements as OrderedExcalidrawElement[];
      selectedElementIdsRef.current = selectedIds;
      setSelectedElementCount(selectedIds.length);

      const api = excalidrawApiRef.current;
      if (api) {
        const files = Object.values(snapshot.files || {});
        if (files.length > 0) {
          api.addFiles(files as any);
        }
        api.updateScene({
          elements: snapshot.elements,
          appState: (snapshot.appState || {}) as any,
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        return;
      }

      setInitialData(snapshot);
    },
    [],
  );

  const saveNow = useCallback(
    async (serialized: string) => {
      if (serialized === lastSavedSerializedRef.current) {
        return;
      }

      await saveFile(filePath, serialized);
      lastSavedSerializedRef.current = serialized;
      setLastSavedAt(Date.now());
      setError(null);
    },
    [filePath],
  );

  const scheduleSave = useCallback(
    (nextSerialized: string) => {
      pendingSerializedRef.current = nextSerialized;
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        const pending = pendingSerializedRef.current;
        pendingSerializedRef.current = null;
        if (pending == null) return;
        void saveNow(pending).catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          setError(t.diagramView.saveFailed.replace("{message}", message));
        });
      }, SAVE_DEBOUNCE_MS);
    },
    [saveNow, t],
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const raw = await readFile(filePath);
        const { normalizedState, serialized, selectedIds } = normalizeSceneFromRaw(raw);
        if (cancelled) return;
        applySceneSnapshot(normalizedState, serialized, selectedIds);
        setLoading(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (cancelled) return;
        setInitialData(createInitialScene());
        latestElementsRef.current = [];
        selectedElementIdsRef.current = [];
        setSelectedElementCount(0);
        setError(t.diagramView.loadFailed.replace("{message}", message));
        setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      const pending = pendingSerializedRef.current;
      if (pending && pending !== lastSavedSerializedRef.current) {
        void saveNow(pending).catch((err) => {
          console.error("Failed to flush diagram save:", err);
        });
      }
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [applySceneSnapshot, filePath, saveNow, t]);

  useEffect(() => {
    if (loading) return;
    if (typeof externalContent !== "string") return;

    const pending = pendingSerializedRef.current;
    if (pending && pending !== lastSavedSerializedRef.current) {
      return;
    }

    try {
      const { normalizedState, serialized, selectedIds } = normalizeSceneFromRaw(externalContent);
      if (serialized === lastSavedSerializedRef.current) {
        return;
      }
      applySceneSnapshot(normalizedState, serialized, selectedIds);
      setLastSavedAt(Date.now());
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(t.diagramView.loadFailed.replace("{message}", message));
    }
  }, [applySceneSnapshot, externalContent, loading, t]);

  const handleSendReferenceToChat = useCallback(() => {
    const allElements = latestElementsRef.current;
    const selectedIds = new Set(selectedElementIdsRef.current);
    const selectedElements =
      selectedIds.size > 0 ? allElements.filter((element) => selectedIds.has(element.id)) : [];
    const targetElements = selectedElements.length > 0 ? selectedElements : allElements;
    const isSelectionReference = selectedElements.length > 0;
    const referenceCount = targetElements.length;
    const referenceText = buildDiagramQuoteText(filePath, targetElements, MAX_QUOTED_ELEMENTS, {
      referenceHeader: t.diagramView.quoteReferenceHeader,
      pathLabel: t.diagramView.quotePathLabel,
      elementsLabel: t.diagramView.quoteElementsLabel,
      typeBreakdownLabel: t.diagramView.quoteTypeBreakdownLabel,
      itemsLabel: t.diagramView.quoteItemsLabel,
      noneLabel: t.diagramView.quoteNoneLabel,
      omittedSuffix: t.diagramView.quoteOmittedSuffix,
    });
    const sourceName = filePath.split(/[/\\]/).pop() || t.diagramView.defaultSource;
    const summaryTemplate = isSelectionReference
      ? t.diagramView.selectionSummary
      : t.diagramView.canvasSummary;
    const locatorTemplate = isSelectionReference
      ? t.diagramView.selectionLocator
      : t.diagramView.canvasLocator;

    useAIStore.getState().addTextSelection({
      text: referenceText,
      source: sourceName,
      sourcePath: filePath,
      summary: summaryTemplate.replace("{count}", String(referenceCount)),
      locator: locatorTemplate.replace("{count}", String(referenceCount)),
      range: {
        kind: "diagram",
        filePath,
        elementCount: referenceCount,
        elementIds: targetElements.slice(0, MAX_QUOTED_ELEMENTS).map((element) => element.id),
      },
    });

    const uiStore = useUIStore.getState();
    uiStore.setRightSidebarOpen(true);
    uiStore.setRightPanelTab("chat");
    uiStore.setFloatingPanelOpen(true);
  }, [filePath, t]);

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center gap-2 text-sm text-muted-foreground", className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{t.diagramView.loading}</span>
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs text-muted-foreground">
        <span className="truncate">{filePath}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSendReferenceToChat}
            className="inline-flex items-center gap-1 rounded-ui-sm border border-border px-2 py-1 text-[11px] text-foreground hover:bg-muted"
            title={t.diagramView.sendToChatHint}
          >
            <MessageSquareQuote className="h-3 w-3" />
            <span>{t.diagramView.sendToChat}</span>
            {selectedElementCount > 0 ? (
              <span className="text-muted-foreground">({selectedElementCount})</span>
            ) : null}
          </button>
          <span>
            {lastSavedAt
              ? t.diagramView.autoSavedAt.replace("{time}", new Date(lastSavedAt).toLocaleTimeString())
              : t.diagramView.notSavedYet}
          </span>
        </div>
      </div>
      {error ? (
        <div className="flex items-center justify-between border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span className="pr-3">{error}</span>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setInitialData(createInitialScene());
            }}
            className="inline-flex items-center gap-1 rounded-ui-sm border border-destructive/30 px-2 py-1 text-[11px] hover:bg-destructive/15"
          >
            <RotateCcw className="h-3 w-3" />
            {t.diagramView.reset}
          </button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <Excalidraw
          excalidrawAPI={(api) => {
            excalidrawApiRef.current = api;
          }}
          initialData={initialData}
          theme={isDarkMode ? "dark" : "light"}
          onChange={(elements, appState, files) => {
            latestElementsRef.current = elements;
            const selectedIds = getSelectedElementIds(appState);
            selectedElementIdsRef.current = selectedIds;
            setSelectedElementCount(selectedIds.length);
            const serialized = serializeAsJSON(elements, appState, files, "local");
            scheduleSave(serialized);
          }}
        />
      </div>
    </div>
  );
}
