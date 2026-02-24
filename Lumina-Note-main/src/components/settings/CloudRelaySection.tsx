import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Cloud, Copy, Power } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { reportOperationError } from "@/lib/reportError";

interface CloudRelayStatus {
  running: boolean;
  connected: boolean;
  relay_url?: string | null;
  pairing_payload?: string | null;
  error?: string | null;
}

interface CloudRelayConfig {
  relay_url: string;
  email: string;
  password: string;
}

export function CloudRelaySection() {
  const { t } = useLocaleStore();
  const [status, setStatus] = useState<CloudRelayStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<CloudRelayConfig>({
    relay_url: "",
    email: "",
    password: "",
  });

  const loadStatus = async () => {
    try {
      const data = await invoke<CloudRelayStatus>("cloud_relay_get_status");
      setStatus(data);
      setError(null);
    } catch (err) {
      reportOperationError({
        source: "CloudRelaySection.loadStatus",
        action: "Load cloud relay status",
        error: err,
        level: "warning",
      });
      setError(String(err));
    }
  };

  useEffect(() => {
    loadStatus();
    invoke<CloudRelayConfig>("cloud_relay_get_config")
      .then((config) => setFormData(config))
      .catch((err) => {
        reportOperationError({
          source: "CloudRelaySection",
          action: "Load cloud relay config",
          error: err,
          level: "warning",
        });
      });
  }, []);

  const handleStart = async () => {
    setLoading(true);
    try {
      await invoke("cloud_relay_set_config", { config: formData });
      const data = await invoke<CloudRelayStatus>("cloud_relay_start");
      setStatus(data);
      setError(null);
    } catch (err) {
      reportOperationError({
        source: "CloudRelaySection.handleStart",
        action: "Start cloud relay",
        error: err,
      });
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await invoke("cloud_relay_stop");
      await loadStatus();
    } catch (err) {
      reportOperationError({
        source: "CloudRelaySection.handleStop",
        action: "Stop cloud relay",
        error: err,
      });
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
      reportOperationError({
        source: "CloudRelaySection.handleCopy",
        action: "Copy cloud relay pairing payload",
        error: err,
        level: "warning",
      });
    }
  };

  const isRunning = Boolean(status?.running);
  const isConnected = Boolean(status?.connected);
  const statusError = status?.error || null;

  return (
    <section className="space-y-4 rounded-xl border border-border bg-background/60 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground/90 flex items-center gap-2">
            <Cloud size={14} />
            {t.settingsModal.cloudRelayTitle}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {t.settingsModal.cloudRelayDesc}
          </p>
        </div>
        <button
          type="button"
          onClick={isRunning ? handleStop : handleStart}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
        >
          <Power size={12} />
          {isRunning ? t.settingsModal.cloudRelayStop : t.settingsModal.cloudRelayStart}
        </button>
      </div>

      <div className="space-y-2 text-xs text-muted-foreground">
        <div>
          {t.settingsModal.cloudRelayStatus}: {isConnected ? t.settingsModal.cloudRelayConnected : t.settingsModal.cloudRelayDisconnected}
        </div>
        {statusError && <div className="text-red-500">{statusError}</div>}
        {error && !statusError && <div className="text-red-500">{error}</div>}
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            {t.settingsModal.cloudRelayUrl}
          </label>
          <input
            type="text"
            value={formData.relay_url}
            onChange={(e) => setFormData({ ...formData, relay_url: e.target.value })}
            placeholder="wss://cloud.example.com/relay"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              {t.settingsModal.cloudRelayEmail}
            </label>
            <input
              type="text"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="you@example.com"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              {t.settingsModal.cloudRelayPassword}
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="••••••••"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground"
            />
          </div>
        </div>
      </div>

      {status?.pairing_payload && (
        <div className="rounded-lg border border-border bg-background/70 p-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground/80">
              {t.settingsModal.cloudRelayPairingPayload}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Copy size={12} />
              {copied ? t.settingsModal.cloudRelayCopied : t.settingsModal.cloudRelayCopy}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-md border border-border bg-background p-2">
              <QRCodeSVG value={status.pairing_payload} size={120} level="M" includeMargin />
            </div>
            <div className="text-[10px] text-foreground/70">
              {t.settingsModal.cloudRelayQrHint}
            </div>
          </div>
          <div className="text-[10px] text-foreground/70 break-all">
            {status.pairing_payload}
          </div>
        </div>
      )}
    </section>
  );
}
