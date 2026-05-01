import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileUp,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import {
  checkLatestVscodeAiExtension,
  getVscodeAiExtensionDiagnostics,
  installLatestVscodeAiExtension,
  installLocalVscodeAiExtensionVsix,
  openDialog,
  rollbackVscodeAiExtension,
  type VscodeAiExtensionDiagnosticsItem,
  type VscodeAiExtensionId,
} from "@/lib/host";
import { reportOperationError } from "@/lib/reportError";

type ActionState = {
  key: string;
  message: string | null;
};

export function VscodeAiExtensionsSection() {
  const [items, setItems] = useState<VscodeAiExtensionDiagnosticsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<ActionState>({ key: "", message: null });

  const refresh = async () => {
    setLoading(true);
    try {
      setItems(await getVscodeAiExtensionDiagnostics());
    } catch (err) {
      reportOperationError({
        source: "VscodeAiExtensionsSection",
        action: "Load VS Code AI extension diagnostics",
        error: err,
      });
      setAction({ key: "load", message: normalizeError(err) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const runAction = async (key: string, fn: () => Promise<string | null>) => {
    setAction({ key, message: null });
    try {
      const message = await fn();
      setAction({ key: "", message });
      await refresh();
    } catch (err) {
      reportOperationError({
        source: "VscodeAiExtensionsSection",
        action: key,
        error: err,
      });
      setAction({ key: "", message: normalizeError(err) });
    }
  };

  const checkLatest = (extensionId: VscodeAiExtensionId) =>
    runAction(`check:${extensionId}`, async () => {
      const latest = await checkLatestVscodeAiExtension({
        extensionId,
        source: "open-vsx",
      });
      return `Latest ${latest.version} from Open VSX`;
    });

  const installLatest = (extensionId: VscodeAiExtensionId) =>
    runAction(`install:${extensionId}`, async () => {
      const result = await installLatestVscodeAiExtension({
        extensionId,
        source: "open-vsx",
      });
      return `Install result: ${result.outcome.decision}`;
    });

  const importVsix = (extensionId: VscodeAiExtensionId) =>
    runAction(`import:${extensionId}`, async () => {
      const selected = await openDialog({
        filters: [{ name: "VSIX", extensions: ["vsix"] }],
        multiple: false,
      });
      const vsixPath = Array.isArray(selected) ? selected[0] : selected;
      if (!vsixPath) return null;
      const result = await installLocalVscodeAiExtensionVsix({
        extensionId,
        vsixPath,
      });
      return `Import result: ${result.outcome.decision}`;
    });

  const rollback = (extensionId: VscodeAiExtensionId) =>
    runAction(`rollback:${extensionId}`, async () => {
      const record = await rollbackVscodeAiExtension({ extensionId });
      return `Rolled back to ${record.version}`;
    });

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            VS Code AI Extensions
          </h3>
          <p className="text-sm text-muted-foreground">
            Codex and Claude Code compatibility status.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border bg-background/60 hover:bg-muted disabled:opacity-50"
          aria-label="Refresh VS Code AI extensions"
          title="Refresh"
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </button>
      </div>

      {action.message ? (
        <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs text-muted-foreground">
          {action.message}
        </div>
      ) : null}

      <div className="space-y-3">
        {items.map((item) => {
          const missing = item.hostCapabilities?.missingCapabilities ?? [];
          const isReady =
            item.compatibility?.status === "stable" &&
            item.hostCapabilities?.canRunWithoutMissingCapabilities === true;
          return (
            <article
              key={item.extensionId}
              className="rounded-lg border border-border/60 bg-background/40 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {missing.length === 0 ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    )}
                    <h4 className="font-medium">{item.displayName}</h4>
                    <span className="text-xs text-muted-foreground">
                      {item.extensionId}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Active: {item.active?.version ?? "none"} · Compatibility:{" "}
                    {item.compatibility?.status ?? "none"}
                    {isReady ? " · stable" : ""}
                  </p>
                  {missing.length > 0 ? (
                    <p className="mt-1 text-xs text-amber-600">
                      Missing: {missing.join(", ")}
                    </p>
                  ) : null}
                  {item.compatibility?.reason ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.compatibility.reason}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton
                    label={`Check latest ${item.displayName}`}
                    busy={action.key === `check:${item.extensionId}`}
                    onClick={() => void checkLatest(item.extensionId)}
                    icon={<RefreshCw className="h-4 w-4" />}
                  />
                  <IconButton
                    label={`Install latest ${item.displayName}`}
                    busy={action.key === `install:${item.extensionId}`}
                    onClick={() => void installLatest(item.extensionId)}
                    icon={<Download className="h-4 w-4" />}
                  />
                  <IconButton
                    label={`Import VSIX ${item.displayName}`}
                    busy={action.key === `import:${item.extensionId}`}
                    onClick={() => void importVsix(item.extensionId)}
                    icon={<FileUp className="h-4 w-4" />}
                  />
                  <IconButton
                    label={`Rollback ${item.displayName}`}
                    busy={action.key === `rollback:${item.extensionId}`}
                    onClick={() => void rollback(item.extensionId)}
                    disabled={!item.active || item.installed.length < 2}
                    icon={<RotateCcw className="h-4 w-4" />}
                  />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function IconButton({
  label,
  icon,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled || busy}
      className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border bg-background/60 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : icon}
    </button>
  );
}

function normalizeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
