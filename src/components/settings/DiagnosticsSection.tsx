import { useEffect, useMemo, useState } from "react";
import { saveDialog as save } from "@/lib/host";
import { writeTextFile } from "@/lib/host";
import { invoke } from "@/lib/host";
import { useUIStore } from "@/stores/useUIStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { getDebugLogPath } from "@/lib/debugLogger";
import { reportOperationError } from "@/lib/reportError";
import {
  getRecentErrors,
  subscribeErrors,
  type ErrorEnvelope,
} from "@/services/errors";

type EditorTraceWindow = Window & {
  __luminaEditorTrace?: {
    clear?: () => unknown;
    getData?: () => unknown;
  };
};

// Error.toJSON returns {} by default; expand the standard fields so cause
// chains land usefully in the exported JSON instead of as `{}`.
function causeReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

export function DiagnosticsSection() {
  const { t } = useLocaleStore();
  const diagnosticsEnabled = useUIStore((s) => s.diagnosticsEnabled);
  const setDiagnosticsEnabled = useUIStore((s) => s.setDiagnosticsEnabled);
  const editorInteractionTraceEnabled = useUIStore((s) => s.editorInteractionTraceEnabled);
  const setEditorInteractionTraceEnabled = useUIStore((s) => s.setEditorInteractionTraceEnabled);

  const [logPath, setLogPath] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [traceBusy, setTraceBusy] = useState(false);

  // Live tail of the in-memory error ring buffer. Re-renders on every
  // new envelope; cap to last 50 in the panel itself (the buffer holds
  // up to 200 — exporting writes the full slice).
  const [recentErrors, setRecentErrors] = useState<ErrorEnvelope[]>(() =>
    getRecentErrors(),
  );
  useEffect(() => {
    return subscribeErrors(() => setRecentErrors(getRecentErrors()));
  }, []);
  const visibleErrors = useMemo(
    () => recentErrors.slice(-50).reverse(),
    [recentErrors],
  );

  const copyErrorsToClipboard = async () => {
    const payload = JSON.stringify(getRecentErrors(), causeReplacer, 2);
    try {
      await navigator.clipboard.writeText(payload);
    } catch (err) {
      reportOperationError({
        source: "DiagnosticsSection",
        action: "Copy error envelopes",
        error: err,
        level: "warning",
      });
    }
  };

  const exportErrorsToFile = async () => {
    try {
      const destination = await save({
        defaultPath: `lumina-errors-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!destination || typeof destination !== "string") return;
      await writeTextFile(
        destination,
        JSON.stringify(getRecentErrors(), causeReplacer, 2),
      );
    } catch (err) {
      reportOperationError({
        source: "DiagnosticsSection",
        action: "Export error envelopes",
        error: err,
      });
    }
  };

  useEffect(() => {
    if (!diagnosticsEnabled) return;
    getDebugLogPath()
      .then(setLogPath)
      .catch((error) => {
        reportOperationError({
          source: "DiagnosticsSection",
          action: "Read diagnostics log path",
          error,
          level: "warning",
        });
      });
  }, [diagnosticsEnabled]);

  const exportDiagnostics = async () => {
    try {
      setBusy(true);
      const destination = await save({
        title: t.settingsModal.diagnosticsExportDialogTitle,
        defaultPath: `lumina-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.log`,
        filters: [{ name: "Log", extensions: ["log", "txt"] }],
      });
      if (!destination || typeof destination !== "string") return;
      await invoke("export_diagnostics", { destination });
    } catch (err) {
      reportOperationError({
        source: "DiagnosticsSection",
        action: "Export diagnostics",
        error: err,
      });
    } finally {
      setBusy(false);
    }
  };

  const clearInteractionTrace = () => {
    try {
      (window as EditorTraceWindow).__luminaEditorTrace?.clear?.();
    } catch (err) {
      reportOperationError({
        source: "DiagnosticsSection",
        action: "Clear interaction trace",
        error: err,
        level: "warning",
      });
    }
  };

  const exportInteractionTrace = async () => {
    try {
      setTraceBusy(true);
      const traceApi = (window as EditorTraceWindow).__luminaEditorTrace;
      const data = traceApi?.getData?.();
      if (!data) {
        throw new Error(t.settingsModal.diagnosticsTraceUnavailable);
      }
      const destination = await save({
        title: t.settingsModal.diagnosticsExportTraceDialogTitle,
        defaultPath: `lumina-editor-trace-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!destination || typeof destination !== "string") return;
      await writeTextFile(destination, JSON.stringify(data, null, 2));
    } catch (err) {
      reportOperationError({
        source: "DiagnosticsSection",
        action: "Export interaction trace",
        error: err,
      });
    } finally {
      setTraceBusy(false);
    }
  };

  return (
    <section className="space-y-6">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        {t.settingsModal.diagnosticsTitle}
      </h3>

      {/* Recent errors — live tail of the in-memory ring buffer. Independent
          of the Rust-side log toggle below; always available. */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium">Recent errors</p>
            <p className="text-sm text-muted-foreground">
              Last {visibleErrors.length} of {recentErrors.length} structured error envelopes (max 200 in memory). Persisted to <code className="text-xs">.lumina/logs/errors.ndjson</code> when a vault is open.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copyErrorsToClipboard}
              disabled={recentErrors.length === 0}
              className="h-8 px-3 rounded-lg text-xs font-medium border border-border bg-background/60 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Copy JSON
            </button>
            <button
              type="button"
              onClick={exportErrorsToFile}
              disabled={recentErrors.length === 0}
              className="h-8 px-3 rounded-lg text-xs font-medium border border-border bg-background/60 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Export
            </button>
          </div>
        </div>
        {visibleErrors.length === 0 ? (
          <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-4 text-xs text-muted-foreground italic">
            No errors recorded this session.
          </div>
        ) : (
          <ul className="rounded-lg border border-border/60 bg-background/40 divide-y divide-border/40 max-h-72 overflow-y-auto">
            {visibleErrors.map((env) => (
              <li key={env.id} className="px-3 py-2 text-xs">
                <div className="flex items-center gap-2 font-mono">
                  <span
                    className={
                      env.severity === "blocker"
                        ? "text-destructive"
                        : env.severity === "transient"
                          ? "text-warning"
                          : "text-muted-foreground"
                    }
                  >
                    [{env.severity}]
                  </span>
                  <span className="font-medium">{env.kind}</span>
                  <span className="text-muted-foreground">
                    {new Date(env.timestamp).toLocaleTimeString()}
                  </span>
                  {env.traceId && (
                    <span className="text-muted-foreground">{env.traceId}</span>
                  )}
                </div>
                <div className="mt-0.5 text-foreground/80 break-words">
                  {env.message}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between py-2 gap-4">
        <div className="min-w-0">
          <p className="font-medium">{t.settingsModal.diagnosticsCollectLogs}</p>
          <p className="text-sm text-muted-foreground">
            {t.settingsModal.diagnosticsCollectLogsDesc}
          </p>
          {diagnosticsEnabled && (
            <p className="text-xs text-muted-foreground truncate mt-1" title={logPath}>
              {t.settingsModal.diagnosticsLogFolder}: {logPath || `(${t.settingsModal.diagnosticsLoading})`}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="Toggle diagnostics logs"
          onClick={() => setDiagnosticsEnabled(!diagnosticsEnabled)}
          className={`h-9 px-3 rounded-lg text-sm font-medium border transition-colors ${
            diagnosticsEnabled
              ? "bg-primary text-primary-foreground border-primary/40 hover:bg-primary/90"
              : "bg-background/60 border-border hover:bg-muted"
          }`}
        >
          {diagnosticsEnabled ? t.settingsModal.diagnosticsOn : t.settingsModal.diagnosticsOff}
        </button>
      </div>

      {import.meta.env.DEV && (
        <div className="flex items-center justify-between py-2 gap-4">
          <div className="min-w-0">
            <p className="font-medium">{t.settingsModal.diagnosticsEditorTrace}</p>
            <p className="text-sm text-muted-foreground">
              {t.settingsModal.diagnosticsEditorTraceDesc}
            </p>
          </div>
          <button
            type="button"
            aria-label="Toggle editor interaction trace"
            onClick={() => setEditorInteractionTraceEnabled(!editorInteractionTraceEnabled)}
            className={`h-9 px-3 rounded-lg text-sm font-medium border transition-colors ${
              editorInteractionTraceEnabled
                ? "bg-primary text-primary-foreground border-primary/40 hover:bg-primary/90"
                : "bg-background/60 border-border hover:bg-muted"
            }`}
          >
            {editorInteractionTraceEnabled ? t.settingsModal.diagnosticsRecording : t.settingsModal.diagnosticsOff}
          </button>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={exportDiagnostics}
          disabled={!diagnosticsEnabled || busy}
          className="h-9 px-3 rounded-lg text-sm font-medium border border-border bg-background/60 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? t.settingsModal.diagnosticsExporting : t.settingsModal.diagnosticsExport}
        </button>
        {import.meta.env.DEV && (
          <>
            <button
              type="button"
              aria-label="Clear editor interaction trace"
              onClick={clearInteractionTrace}
              disabled={!editorInteractionTraceEnabled || traceBusy}
              className="h-9 px-3 rounded-lg text-sm font-medium border border-border bg-background/60 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t.settingsModal.diagnosticsClearTrace}
            </button>
            <button
              type="button"
              aria-label="Export editor interaction trace"
              onClick={exportInteractionTrace}
              disabled={!editorInteractionTraceEnabled || traceBusy}
              className="h-9 px-3 rounded-lg text-sm font-medium border border-border bg-background/60 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {traceBusy ? t.settingsModal.diagnosticsExporting : t.settingsModal.diagnosticsExportTrace}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
