import "@excalidraw/excalidraw/index.css";
import { CaptureUpdateAction, Excalidraw, restore, serializeAsJSON } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquareQuote, RotateCcw, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFsChangePath, type FsChangePayload } from "@/lib/fsChange";
import { readFile, saveFile } from "@/lib/tauri";
import { useAIStore } from "@/stores/useAIStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useUIStore } from "@/stores/useUIStore";

interface DiagramViewProps {
  filePath: string;
  externalContent?: string;
  className?: string;
  saveMode?: "auto" | "manual";
  showSendToChatButton?: boolean;
  liveSync?: boolean;
  viewModeEnabled?: boolean;
}

const SAVE_DEBOUNCE_MS = 700;
const MAX_QUOTED_ELEMENTS = 12;
const DIAGRAM_LOAD_TIMEOUT_MS = 12000;

async function readFileWithTimeout(path: string, timeoutMs: number): Promise<string> {
  let timeoutId: number | null = null;
  try {
    return await Promise.race([
      readFile(path),
      new Promise<string>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new Error(`Diagram load timed out after ${Math.round(timeoutMs / 1000)}s`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
}

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

function normalizeFsPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/g, "").toLowerCase();
}

export function DiagramView({
  filePath,
  externalContent,
  className,
  saveMode = "auto",
  showSendToChatButton = true,
  liveSync = false,
  viewModeEnabled = false,
}: DiagramViewProps) {
  const { t } = useLocaleStore();
  const isDarkMode = useUIStore((state) => state.isDarkMode);
  const isManualSave = saveMode === "manual";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState>(() => createInitialScene());
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [selectedElementCount, setSelectedElementCount] = useState(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const lastSavedSerializedRef = useRef("");
  const latestSerializedRef = useRef("");
  const pendingSerializedRef = useRef<string | null>(null);
  const latestElementsRef = useRef<readonly OrderedExcalidrawElement[]>([]);
  const selectedElementIdsRef = useRef<string[]>([]);
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const lastAppliedExternalContentRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    // React StrictMode (dev) mounts, unmounts, and mounts again.
    // Reset mount flag on every mount so async loaders can settle loading state.
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const applySceneSnapshot = useCallback(
    (snapshot: ExcalidrawInitialDataState, serialized: string, selectedIds: string[]) => {
      lastSavedSerializedRef.current = serialized;
      latestSerializedRef.current = serialized;
      latestElementsRef.current = snapshot.elements as OrderedExcalidrawElement[];
      selectedElementIdsRef.current = selectedIds;
      setSelectedElementCount(selectedIds.length);
      setHasUnsavedChanges(false);

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

  const saveDraftNow = useCallback(async () => {
    const serialized = latestSerializedRef.current;
    if (!serialized || serialized === lastSavedSerializedRef.current || isSaving) {
      return;
    }

    try {
      setIsSaving(true);
      await saveNow(serialized);
      setHasUnsavedChanges(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(t.diagramView.saveFailed.replace("{message}", message));
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, saveNow, t]);

  const loadSceneFromDisk = useCallback(
    async (options?: { showLoading?: boolean; resetOnError?: boolean }) => {
      const showLoading = options?.showLoading ?? false;
      const resetOnError = options?.resetOnError ?? false;
      try {
        if (showLoading) {
          setLoading(true);
        }
        setError(null);
        const raw = await readFileWithTimeout(filePath, DIAGRAM_LOAD_TIMEOUT_MS);
        const { normalizedState, serialized, selectedIds } = normalizeSceneFromRaw(raw);
        if (!isMountedRef.current) {
          return false;
        }
        applySceneSnapshot(normalizedState, serialized, selectedIds);
        return true;
      } catch (err) {
        if (!isMountedRef.current) {
          return false;
        }
        const message = err instanceof Error ? err.message : String(err);
        if (resetOnError) {
          setInitialData(createInitialScene());
          latestElementsRef.current = [];
          selectedElementIdsRef.current = [];
          setSelectedElementCount(0);
        }
        setError(t.diagramView.loadFailed.replace("{message}", message));
        return false;
      } finally {
        if (showLoading && isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [applySceneSnapshot, filePath, t],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await loadSceneFromDisk({ showLoading: true, resetOnError: true });
      if (cancelled || !loaded) return;
    })();

    return () => {
      cancelled = true;
      if (!isManualSave) {
        const pending = pendingSerializedRef.current;
        if (pending && pending !== lastSavedSerializedRef.current) {
          void saveNow(pending).catch((err) => {
            console.error("Failed to flush diagram save:", err);
          });
        }
      }
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [filePath, isManualSave, loadSceneFromDisk, saveNow]);

  useEffect(() => {
    if (!liveSync) return;

    let unlisten: (() => void) | null = null;
    let reloadTimer: number | null = null;
    const targetPath = normalizeFsPath(filePath);

    const setup = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<FsChangePayload | null>("fs:change", (event) => {
          const changedPath = getFsChangePath(event.payload);
          if (!changedPath || normalizeFsPath(changedPath) !== targetPath) {
            return;
          }

          const pending = pendingSerializedRef.current;
          if (!isManualSave && pending && pending !== lastSavedSerializedRef.current) {
            return;
          }
          if (isManualSave && hasUnsavedChanges) {
            return;
          }

          if (reloadTimer) {
            window.clearTimeout(reloadTimer);
          }
          reloadTimer = window.setTimeout(() => {
            void loadSceneFromDisk({ showLoading: false, resetOnError: false });
          }, 160);
        });
      } catch (err) {
        console.warn("[DiagramView] liveSync listener setup failed:", err);
      }
    };

    void setup();

    return () => {
      if (unlisten) {
        unlisten();
      }
      if (reloadTimer) {
        window.clearTimeout(reloadTimer);
      }
    };
  }, [filePath, hasUnsavedChanges, isManualSave, liveSync, loadSceneFromDisk]);

  useEffect(() => {
    if (loading) return;
    if (typeof externalContent !== "string") return;
    if (externalContent === lastAppliedExternalContentRef.current) return;

    const pending = pendingSerializedRef.current;
    if (!isManualSave && pending && pending !== lastSavedSerializedRef.current) {
      return;
    }
    if (isManualSave && hasUnsavedChanges) {
      return;
    }

    // `tab.content` for diagram tabs may start as an empty placeholder before any real reload.
    // Ignore it to avoid overriding an already loaded canvas with an empty scene.
    if (externalContent.trim().length === 0) {
      return;
    }

    try {
      const { normalizedState, serialized, selectedIds } = normalizeSceneFromRaw(externalContent);
      if (serialized === lastSavedSerializedRef.current) {
        lastAppliedExternalContentRef.current = externalContent;
        return;
      }
      applySceneSnapshot(normalizedState, serialized, selectedIds);
      lastAppliedExternalContentRef.current = externalContent;
      setLastSavedAt(Date.now());
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(t.diagramView.loadFailed.replace("{message}", message));
    }
  }, [applySceneSnapshot, externalContent, hasUnsavedChanges, isManualSave, loading, t]);

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
          {showSendToChatButton ? (
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
          ) : null}
          {isManualSave ? (
            <button
              type="button"
              onClick={() => {
                void saveDraftNow();
              }}
              disabled={!hasUnsavedChanges || isSaving}
              className="inline-flex items-center gap-1 rounded-ui-sm border border-border px-2 py-1 text-[11px] text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              title={t.diagramView.saveDraft}
            >
              <Save className="h-3 w-3" />
              <span>{isSaving ? t.diagramView.savingDraft : t.diagramView.saveDraft}</span>
            </button>
          ) : null}
          <span>
            {isManualSave
              ? (hasUnsavedChanges
                  ? t.diagramView.unsavedDraft
                  : (lastSavedAt
                      ? t.diagramView.savedAt.replace("{time}", new Date(lastSavedAt).toLocaleTimeString())
                      : t.diagramView.notSavedYet))
              : (lastSavedAt
                  ? t.diagramView.autoSavedAt.replace("{time}", new Date(lastSavedAt).toLocaleTimeString())
                  : t.diagramView.notSavedYet)}
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
          viewModeEnabled={viewModeEnabled}
          theme={isDarkMode ? "dark" : "light"}
          onChange={(elements, appState, files) => {
            latestElementsRef.current = elements;
            const selectedIds = getSelectedElementIds(appState);
            selectedElementIdsRef.current = selectedIds;
            setSelectedElementCount(selectedIds.length);
            const serialized = serializeAsJSON(elements, appState, files, "local");
            latestSerializedRef.current = serialized;
            if (isManualSave) {
              setHasUnsavedChanges(serialized !== lastSavedSerializedRef.current);
              return;
            }
            scheduleSave(serialized);
          }}
        />
      </div>
    </div>
  );
}
