import { useEffect, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useUIStore } from "@/stores/useUIStore";
import { getDebugLogPath } from "@/lib/debugLogger";

export function DiagnosticsSection() {
  const { diagnosticsEnabled, setDiagnosticsEnabled } = useUIStore((s) => ({
    diagnosticsEnabled: s.diagnosticsEnabled,
    setDiagnosticsEnabled: s.setDiagnosticsEnabled,
  }));

  const [logPath, setLogPath] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const title = "Diagnostics";

  useEffect(() => {
    if (!diagnosticsEnabled) return;
    getDebugLogPath().then(setLogPath).catch(() => {});
  }, [diagnosticsEnabled]);

  const exportDiagnostics = async () => {
    try {
      setBusy(true);
      const destination = await save({
        title: "Export Diagnostics",
        defaultPath: `lumina-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.log`,
        filters: [{ name: "Log", extensions: ["log", "txt"] }],
      });
      if (!destination || typeof destination !== "string") return;
      await invoke("export_diagnostics", { destination });
      alert("Diagnostics exported.");
    } catch (err) {
      console.error("Failed to export diagnostics:", err);
      alert(`Export failed: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        {title}
      </h3>

      <div className="flex items-center justify-between py-2 gap-4">
        <div className="min-w-0">
          <p className="font-medium">Collect diagnostics logs</p>
          <p className="text-sm text-muted-foreground">
            When enabled, Lumina writes console logs and crash events to a local file to help debugging.
          </p>
          {diagnosticsEnabled && (
            <p className="text-xs text-muted-foreground truncate mt-1" title={logPath}>
              Log folder: {logPath || "(loading...)"}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDiagnosticsEnabled(!diagnosticsEnabled)}
          className={`h-9 px-3 rounded-lg text-sm font-medium border transition-colors ${
            diagnosticsEnabled
              ? "bg-primary text-primary-foreground border-primary/40 hover:bg-primary/90"
              : "bg-background/60 border-border hover:bg-muted"
          }`}
        >
          {diagnosticsEnabled ? "On" : "Off"}
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={exportDiagnostics}
          disabled={!diagnosticsEnabled || busy}
          className="h-9 px-3 rounded-lg text-sm font-medium border border-border bg-background/60 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Exporting..." : "Export Diagnostics"}
        </button>
      </div>
    </section>
  );
}
