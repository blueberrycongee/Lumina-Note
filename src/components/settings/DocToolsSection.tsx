import { useEffect, useState } from "react";
import { Download, RefreshCw, PackageCheck, PackageX } from "lucide-react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { getDocToolsStatus, installDocTools, type DocToolsStatus } from "@/lib/tauri";

export function DocToolsSection() {
  const { t } = useLocaleStore();
  const [status, setStatus] = useState<DocToolsStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const data = await getDocToolsStatus();
      setStatus(data);
      setError(null);
    } catch (err) {
      console.error("Failed to load doc tools status:", err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleInstall = async () => {
    setInstalling(true);
    try {
      const data = await installDocTools();
      setStatus(data);
      setError(null);
    } catch (err) {
      console.error("Failed to install doc tools:", err);
      setError(String(err));
    } finally {
      setInstalling(false);
    }
  };

  const isInstalled = Boolean(status?.installed);

  return (
    <section className="space-y-4 rounded-xl border border-border bg-background/60 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground/90 flex items-center gap-2">
            {isInstalled ? <PackageCheck size={14} /> : <PackageX size={14} />}
            {t.settingsModal.docToolsTitle}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {t.settingsModal.docToolsDesc}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadStatus}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
          >
            <RefreshCw size={12} />
            {t.settingsModal.docToolsRefresh}
          </button>
          {!isInstalled && (
            <button
              type="button"
              onClick={handleInstall}
              disabled={installing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
            >
              <Download size={12} />
              {installing ? t.settingsModal.docToolsInstalling : t.settingsModal.docToolsInstall}
            </button>
          )}
        </div>
      </div>

      {error && <div className="text-xs text-red-500">{error}</div>}

      {status && (
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>{t.settingsModal.docToolsStatus}</span>
            <span className={isInstalled ? "text-green-500" : "text-muted-foreground"}>
              {isInstalled ? t.settingsModal.docToolsInstalled : t.settingsModal.docToolsNotInstalled}
            </span>
          </div>

          {status.version && (
            <div className="flex items-center justify-between">
              <span>{t.settingsModal.docToolsVersion}</span>
              <span className="text-foreground/80">{status.version}</span>
            </div>
          )}

          {status.binDir && (
            <div className="flex items-center justify-between">
              <span>{t.settingsModal.docToolsBin}</span>
              <span className="text-foreground/80 truncate max-w-[260px]">{status.binDir}</span>
            </div>
          )}

          {status.missing.length > 0 && (
            <div className="text-[11px] text-amber-500">
              {t.settingsModal.docToolsMissing}: {status.missing.join(", ")}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {Object.entries(status.tools).map(([name, tool]) => (
              <div
                key={name}
                className="flex items-center justify-between rounded-lg border border-border bg-background/70 px-2 py-1"
              >
                <span className="text-[11px]">{name}</span>
                <span className={tool.available ? "text-green-500" : "text-muted-foreground"}>
                  {tool.available ? (tool.source ?? t.settingsModal.docToolsAvailable) : t.settingsModal.docToolsUnavailable}
                </span>
              </div>
            ))}
          </div>

          <div className="text-[10px] text-foreground/70">
            {t.settingsModal.docToolsHint}
          </div>
        </div>
      )}
    </section>
  );
}
