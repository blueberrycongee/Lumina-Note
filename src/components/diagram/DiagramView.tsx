import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { readFile, saveFile } from "@/lib/tauri";

interface DiagramViewProps {
  filePath: string;
  className?: string;
}

interface DiagramDocument {
  type: "excalidraw";
  version: number;
  source: string;
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

const DIAGRAM_SOURCE = "https://lumina-note.app";
const SAVE_DEBOUNCE_MS = 700;

const createEmptyDiagramDocument = (): DiagramDocument => ({
  type: "excalidraw",
  version: 2,
  source: DIAGRAM_SOURCE,
  elements: [],
  appState: {},
  files: {},
});

const normalizeDiagramDocument = (value: unknown): DiagramDocument => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createEmptyDiagramDocument();
  }
  const obj = value as Record<string, unknown>;
  return {
    type: "excalidraw",
    version: typeof obj.version === "number" ? obj.version : 2,
    source: typeof obj.source === "string" ? obj.source : DIAGRAM_SOURCE,
    elements: Array.isArray(obj.elements) ? obj.elements : [],
    appState:
      obj.appState && typeof obj.appState === "object" && !Array.isArray(obj.appState)
        ? (obj.appState as Record<string, unknown>)
        : {},
    files:
      obj.files && typeof obj.files === "object" && !Array.isArray(obj.files)
        ? (obj.files as Record<string, unknown>)
        : {},
  };
};

export function DiagramView({ filePath, className }: DiagramViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const lastSavedTextRef = useRef("");
  const pendingTextRef = useRef<string | null>(null);

  const saveNow = useCallback(
    async (raw: string) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        setError("Diagram JSON is invalid. Fix syntax before saving.");
        return;
      }

      const normalized = normalizeDiagramDocument(parsed);
      const serialized = `${JSON.stringify(normalized, null, 2)}\n`;
      if (serialized === lastSavedTextRef.current) {
        return;
      }

      await saveFile(filePath, serialized);
      lastSavedTextRef.current = serialized;
      setText(serialized);
      setLastSavedAt(Date.now());
      setError(null);
    },
    [filePath],
  );

  const scheduleSave = useCallback(
    (nextText: string) => {
      pendingTextRef.current = nextText;
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        const pending = pendingTextRef.current;
        pendingTextRef.current = null;
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
        const parsed = raw.trim().length > 0 ? JSON.parse(raw) : createEmptyDiagramDocument();
        const normalized = normalizeDiagramDocument(parsed);
        const serialized = `${JSON.stringify(normalized, null, 2)}\n`;
        if (cancelled) return;
        setText(serialized);
        lastSavedTextRef.current = serialized;
        setLoading(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (cancelled) return;
        setError(`Failed to load diagram: ${message}`);
        setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
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
      {error ? <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div> : null}
      <textarea
        value={text}
        onChange={(event) => {
          const nextValue = event.target.value;
          setText(nextValue);
          scheduleSave(nextValue);
        }}
        spellCheck={false}
        className="flex-1 resize-none border-0 bg-background px-4 py-3 font-mono text-xs leading-6 outline-none"
      />
    </div>
  );
}
