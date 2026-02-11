import "@excalidraw/excalidraw/index.css";
import { Excalidraw, restore, serializeAsJSON } from "@excalidraw/excalidraw";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { readFile, saveFile } from "@/lib/tauri";
import { useUIStore } from "@/stores/useUIStore";

interface DiagramViewProps {
  filePath: string;
  className?: string;
}

const SAVE_DEBOUNCE_MS = 700;

const createInitialScene = (): ExcalidrawInitialDataState => {
  const restored = restore({ elements: [], appState: {}, files: {} }, null, null);
  return {
    elements: restored.elements,
    appState: restored.appState,
    files: restored.files,
  };
};

export function DiagramView({ filePath, className }: DiagramViewProps) {
  const isDarkMode = useUIStore((state) => state.isDarkMode);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState>(() => createInitialScene());
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const lastSavedSerializedRef = useRef("");
  const pendingSerializedRef = useRef<string | null>(null);

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
          setError(`Failed to save diagram: ${message}`);
        });
      }, SAVE_DEBOUNCE_MS);
    },
    [saveNow],
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const raw = await readFile(filePath);
        const parsed = raw.trim().length > 0 ? (JSON.parse(raw) as Record<string, unknown>) : null;
        const restored = restore(parsed as any, null, null);
        const normalizedState: ExcalidrawInitialDataState = {
          elements: restored.elements,
          appState: restored.appState,
          files: restored.files,
        };
        const serialized = serializeAsJSON(
          normalizedState.elements as OrderedExcalidrawElement[],
          normalizedState.appState || {},
          normalizedState.files || {},
          "local",
        );
        if (cancelled) return;
        setInitialData(normalizedState);
        lastSavedSerializedRef.current = serialized;
        setLoading(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (cancelled) return;
        setInitialData(createInitialScene());
        setError(`Failed to load diagram, started with a blank canvas: ${message}`);
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
  }, [filePath]);

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center gap-2 text-sm text-muted-foreground", className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading diagram...</span>
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs text-muted-foreground">
        <span className="truncate">{filePath}</span>
        <span>{lastSavedAt ? `Auto-saved ${new Date(lastSavedAt).toLocaleTimeString()}` : "Not saved yet"}</span>
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
            Reset
          </button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <Excalidraw
          initialData={initialData}
          theme={isDarkMode ? "dark" : "light"}
          onChange={(elements, appState, files) => {
            const serialized = serializeAsJSON(elements, appState, files, "local");
            scheduleSave(serialized);
          }}
        />
      </div>
    </div>
  );
}
