import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Link2, Copy, Power } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useFileStore } from "@/stores/useFileStore";

interface MobileGatewayStatus {
  running: boolean;
  token?: string | null;
  port?: number | null;
  addresses: string[];
  ws_urls: string[];
  pairing_payload?: string | null;
}

export function MobileGatewaySection() {
  const { t } = useLocaleStore();
  const { vaultPath, syncMobileWorkspace } = useFileStore();
  const [status, setStatus] = useState<MobileGatewayStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const data = await invoke<MobileGatewayStatus>("mobile_get_status");
      setStatus(data);
      setError(null);
    } catch (err) {
      console.error("Failed to load mobile gateway status:", err);
      setError(String(err));
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (!status?.running || !vaultPath) return;
    syncMobileWorkspace({ path: vaultPath, force: true }).catch((err) => {
      console.warn("Failed to sync mobile workspace after start:", err);
    });
  }, [status?.running, vaultPath, syncMobileWorkspace]);

  const handleStart = async () => {
    setLoading(true);
    try {
      const data = await invoke<MobileGatewayStatus>("mobile_start_server");
      setStatus(data);
      setError(null);
      if (vaultPath) {
        await syncMobileWorkspace({ path: vaultPath, force: true });
      }
    } catch (err) {
      console.error("Failed to start mobile gateway:", err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await invoke("mobile_stop_server");
      await loadStatus();
    } catch (err) {
      console.error("Failed to stop mobile gateway:", err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!status?.pairing_payload) return;
    try {
      await navigator.clipboard.writeText(status.pairing_payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy pairing payload:", err);
    }
  };

  const isRunning = Boolean(status?.running);

  return (
    <section className="space-y-4 rounded-xl border border-border bg-background/60 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground/90 flex items-center gap-2">
            <Link2 size={14} />
            {t.settingsModal.mobileGatewayTitle}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {t.settingsModal.mobileGatewayDesc}
          </p>
        </div>
        <button
          type="button"
          onClick={isRunning ? handleStop : handleStart}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
        >
          <Power size={12} />
          {isRunning ? t.settingsModal.mobileGatewayStop : t.settingsModal.mobileGatewayStart}
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-500">{error}</div>
      )}

      {status && (
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>{t.settingsModal.mobileGatewayStatus}</span>
            <span className={isRunning ? "text-green-500" : "text-muted-foreground"}>
              {isRunning ? t.settingsModal.mobileGatewayRunning : t.settingsModal.mobileGatewayStopped}
            </span>
          </div>

          {isRunning && status.port && (
            <>
              <div className="flex items-center justify-between">
                <span>{t.settingsModal.mobileGatewayPort}</span>
                <span className="text-foreground/80">{status.port}</span>
              </div>
              <div>
                <div className="mb-1">{t.settingsModal.mobileGatewayAddresses}</div>
                <div className="space-y-1">
                  {status.ws_urls.map((url) => (
                    <div key={url} className="text-foreground/80">
                      {url}
                    </div>
                  ))}
                </div>
              </div>
              {status.token && (
                <div className="flex items-center justify-between">
                  <span>{t.settingsModal.mobileGatewayToken}</span>
                  <span className="text-foreground/80">{status.token}</span>
                </div>
              )}
              {status.pairing_payload && (
                <div className="rounded-lg border border-border bg-background/70 p-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span>{t.settingsModal.mobileGatewayPairingPayload}</span>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Copy size={12} />
                      {copied ? t.settingsModal.mobileGatewayCopied : t.settingsModal.mobileGatewayCopy}
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="rounded-md border border-border bg-background p-2">
                      <QRCodeSVG
                        value={status.pairing_payload}
                        size={120}
                        level="M"
                        includeMargin
                      />
                    </div>
                    <div className="text-[10px] text-foreground/70">
                      {t.settingsModal.mobileGatewayQrHint}
                    </div>
                  </div>
                  <div className="text-[10px] text-foreground/70 break-all">
                    {status.pairing_payload}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
