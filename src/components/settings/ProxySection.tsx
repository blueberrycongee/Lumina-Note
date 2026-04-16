import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useUIStore } from "@/stores/useUIStore";
import { reportOperationError } from "@/lib/reportError";

export function ProxySection() {
  const { t } = useLocaleStore();
  const { proxyUrl, proxyEnabled, setProxyUrl, setProxyEnabled } = useUIStore();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Sync proxy config to Rust backend whenever it changes
  useEffect(() => {
    invoke("set_proxy_config", {
      proxyUrl: proxyUrl,
      enabled: proxyEnabled,
    }).catch((err) => {
      reportOperationError({
        source: "ProxySection",
        action: "Sync proxy config",
        error: err,
        level: "warning",
      });
    });
  }, [proxyUrl, proxyEnabled]);

  // Load saved config from Rust on mount
  useEffect(() => {
    invoke<{ proxy_url: string; enabled: boolean }>("get_proxy_config")
      .then((config) => {
        if (config.proxy_url && config.proxy_url !== proxyUrl) {
          setProxyUrl(config.proxy_url);
        }
        if (config.enabled !== proxyEnabled) {
          setProxyEnabled(config.enabled);
        }
      })
      .catch(() => {
        // First launch, no config yet
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTest = async () => {
    if (!proxyUrl.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      await invoke("test_proxy_connection", { proxyUrl: proxyUrl.trim() });
      setTestResult({ ok: true, msg: t.settingsModal.proxyTestSuccess });
    } catch (err) {
      setTestResult({
        ok: false,
        msg: t.settingsModal.proxyTestFailed.replace("{error}", String(err)),
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          {t.settingsModal.proxyTitle}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          {t.settingsModal.proxyDesc}
        </p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            {t.settingsModal.proxyUrl}
          </label>
          <input
            type="text"
            value={proxyUrl}
            onChange={(e) => setProxyUrl(e.target.value)}
            placeholder={t.settingsModal.proxyUrlPlaceholder}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground"
          />
          <p className="text-[10px] text-muted-foreground">
            {t.settingsModal.proxyHint}
          </p>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-foreground/80">
            {t.settingsModal.proxyEnable}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={proxyEnabled}
            onClick={() => setProxyEnabled(!proxyEnabled)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              proxyEnabled ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                proxyEnabled ? "translate-x-4.5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        <button
          type="button"
          onClick={handleTest}
          disabled={testing || !proxyUrl.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
        >
          {testing && <Loader2 size={12} className="animate-spin" />}
          {t.settingsModal.proxyTestConnection}
        </button>

        {testResult && (
          <p className={`text-xs ${testResult.ok ? "text-green-500" : "text-red-500"}`}>
            {testResult.msg}
          </p>
        )}
      </div>
    </section>
  );
}
