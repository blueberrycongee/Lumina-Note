import { useEffect, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { useUIStore } from "@/stores/useUIStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { getDebugLogPath } from "@/lib/debugLogger";
import { reportOperationError } from "@/lib/reportError";

type EditorTraceWindow = Window & {
  __luminaEditorTrace?: {
    clear?: () => unknown;
    getData?: () => unknown;
  };
};

export function DiagnosticsSection() {
  const { t } = useLocaleStore();
  const diagnosticsEnabled = useUIStore((s) => s.diagnosticsEnabled);
  const setDiagnosticsEnabled = useUIStore((s) => s.setDiagnosticsEnabled);
  const editorInteractionTraceEnabled = useUIStore((s) => s.editorInteractionTraceEnabled);
  const setEditorInteractionTraceEnabled = useUIStore((s) => s.setEditorInteractionTraceEnabled);

  const [logPath, setLogPath] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [traceBusy, setTraceBusy] = useState(false);

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
    <section className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        {t.settingsModal.diagnosticsTitle}
      </h3>

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

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={exportDiagnostics}
          disabled={!diagnosticsEnabled || busy}
          className="h-9 px-3 rounded-lg text-sm font-medium border border-border bg-background/60 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? t.settingsModal.diagnosticsExporting : t.settingsModal.diagnosticsExport}
        </button>
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
      </div>
    </section>
  );
}
