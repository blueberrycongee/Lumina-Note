import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileUp,
  Play,
  RefreshCw,
  Settings,
  Square,
} from "lucide-react";
import {
  activateInstalledVscodeAiExtension,
  getVscodeAiExtensionDiagnostics,
  installLatestVscodeAiExtension,
  installLocalVscodeAiExtensionVsix,
  openActiveVscodeAiExtension,
  openDialog,
  stopVscodeAiExtensionHost,
  type VscodeAiExtensionDiagnosticsItem,
  type VscodeAiExtensionHostSession,
  type VscodeAiExtensionId,
  type VscodeAiExtensionSource,
} from "@/lib/host";
import { reportOperationError } from "@/lib/reportError";
import { cn } from "@/lib/utils";

const EXTENSIONS: Array<{ id: VscodeAiExtensionId; label: string }> = [
  { id: "openai.chatgpt", label: "Codex" },
  { id: "anthropic.claude-code", label: "Claude Code" },
];

type ActionState = {
  key: string;
  message: string | null;
};

export function VscodeAiExtensionSidebarPanel() {
  const [items, setItems] = useState<VscodeAiExtensionDiagnosticsItem[]>([]);
  const [selectedId, setSelectedId] =
    useState<VscodeAiExtensionId>("openai.chatgpt");
  const [source, setSource] = useState<VscodeAiExtensionSource>("marketplace");
  const [marketplaceTermsAccepted, setMarketplaceTermsAccepted] =
    useState(false);
  const [action, setAction] = useState<ActionState>({
    key: "",
    message: null,
  });
  const [hostSession, setHostSession] =
    useState<VscodeAiExtensionHostSession | null>(null);

  const selected = useMemo(
    () => items.find((item) => item.extensionId === selectedId) ?? null,
    [items, selectedId],
  );
  const missingCapabilities = selected?.hostCapabilities?.missingCapabilities ?? [];
  const latestInstalled = selected?.installed[0] ?? null;
  const canOpen =
    Boolean(selected?.active) &&
    selected?.hostCapabilities?.canRunWithoutMissingCapabilities !== false;

  const refresh = async () => {
    try {
      setItems(await getVscodeAiExtensionDiagnostics());
    } catch (err) {
      reportOperationError({
        source: "VscodeAiExtensionSidebarPanel",
        action: "Load diagnostics",
        error: err,
      });
      setAction({ key: "", message: normalizeError(err) });
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (hostSession && hostSession.extensionId !== selectedId) {
      setHostSession(null);
    }
  }, [hostSession, selectedId]);

  const runAction = async (key: string, fn: () => Promise<string | null>) => {
    setAction({ key, message: null });
    try {
      const message = await fn();
      setAction({ key: "", message });
      await refresh();
    } catch (err) {
      reportOperationError({
        source: "VscodeAiExtensionSidebarPanel",
        action: key,
        error: err,
      });
      setAction({ key: "", message: normalizeError(err) });
    }
  };

  const installLatest = () =>
    runAction(`install:${selectedId}`, async () => {
      const result = await installLatestVscodeAiExtension({
        extensionId: selectedId,
        source,
        marketplaceTermsAccepted,
      });
      return `Install result: ${result.outcome.decision}`;
    });

  const importVsix = () =>
    runAction(`import:${selectedId}`, async () => {
      const selectedPath = await openDialog({
        filters: [{ name: "VSIX", extensions: ["vsix"] }],
        multiple: false,
      });
      const vsixPath = Array.isArray(selectedPath) ? selectedPath[0] : selectedPath;
      if (!vsixPath) return null;
      const result = await installLocalVscodeAiExtensionVsix({
        extensionId: selectedId,
        vsixPath,
      });
      return `Import result: ${result.outcome.decision}`;
    });

  const activateLatest = () =>
    runAction(`activate:${selectedId}`, async () => {
      if (!latestInstalled) return "No installed version to activate";
      const record = await activateInstalledVscodeAiExtension({
        extensionId: selectedId,
        version: latestInstalled.version,
        allowUnverified: latestInstalled.compatibility.status !== "stable",
      });
      return `Activated ${record.version}`;
    });

  const openExtension = () =>
    runAction(`open:${selectedId}`, async () => {
      if (!selected?.active) return "No active version to open";
      const session = await openActiveVscodeAiExtension({
        extensionId: selectedId,
      });
      setHostSession(session);
      return session.viewUrl
        ? `Opened ${selected.displayName}`
        : `${selected.displayName} is running, but it did not register a sidebar view.`;
    });

  const stopHost = () =>
    runAction("stop-host", async () => {
      await stopVscodeAiExtensionHost();
      setHostSession(null);
      return "Stopped extension host";
    });

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-border/60 p-2">
        <div className="flex rounded-ui-md border border-border/60 bg-muted/35 p-0.5">
          {EXTENSIONS.map((extension) => (
            <button
              key={extension.id}
              type="button"
              onClick={() => setSelectedId(extension.id)}
              className={cn(
                "min-w-0 flex-1 rounded-ui-sm px-2 py-1.5 text-xs font-medium transition-colors",
                selectedId === extension.id
                  ? "bg-background text-foreground shadow-ui-card"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="truncate">{extension.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-2 flex items-center gap-1">
          <select
            aria-label="VS Code AI extension source"
            value={source}
            onChange={(event) =>
              setSource(event.target.value as VscodeAiExtensionSource)
            }
            className="h-8 min-w-0 flex-1 rounded-ui-md border border-border bg-background px-2 text-xs"
          >
            <option value="marketplace">Marketplace</option>
            <option value="open-vsx">Open VSX</option>
          </select>
          <IconButton
            label="Refresh"
            busy={action.key === "refresh"}
            onClick={() => void runAction("refresh", async () => null)}
            icon={<RefreshCw size={14} />}
          />
        </div>
        {source === "marketplace" ? (
          <label className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={marketplaceTermsAccepted}
              onChange={(event) =>
                setMarketplaceTermsAccepted(event.target.checked)
              }
            />
            <span>I have accepted Marketplace terms.</span>
          </label>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="space-y-3 p-3">
          <div className="rounded-ui-md border border-border/60 bg-popover/40 p-3">
            <div className="flex items-start gap-2">
              {missingCapabilities.length === 0 ? (
                <CheckCircle2 size={16} className="mt-0.5 text-emerald-500" />
              ) : (
                <AlertTriangle size={16} className="mt-0.5 text-warning" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {selected?.displayName ?? "VS Code AI extension"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Active: {selected?.active?.version ?? "none"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Installed: {selected?.installed.length ?? 0}
                  {latestInstalled
                    ? ` · Latest ${latestInstalled.version}`
                    : ""}
                </div>
                {selected?.compatibility?.reason ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {selected.compatibility.reason}
                  </div>
                ) : null}
                {missingCapabilities.length > 0 ? (
                  <div className="mt-1 text-xs text-warning">
                    Missing: {missingCapabilities.join(", ")}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-5 gap-1">
              <IconButton
                label="Install latest"
                busy={action.key === `install:${selectedId}`}
                onClick={() => void installLatest()}
                icon={<Download size={14} />}
              />
              <IconButton
                label="Import VSIX"
                busy={action.key === `import:${selectedId}`}
                onClick={() => void importVsix()}
                icon={<FileUp size={14} />}
              />
              <IconButton
                label="Activate latest installed"
                busy={action.key === `activate:${selectedId}`}
                disabled={
                  !latestInstalled ||
                  latestInstalled.version === selected?.active?.version
                }
                onClick={() => void activateLatest()}
                icon={<Settings size={14} />}
              />
              <IconButton
                label="Open"
                busy={action.key === `open:${selectedId}`}
                disabled={!canOpen}
                onClick={() => void openExtension()}
                icon={<Play size={14} />}
              />
              <IconButton
                label="Stop host"
                busy={action.key === "stop-host"}
                disabled={!hostSession}
                onClick={() => void stopHost()}
                icon={<Square size={14} />}
              />
            </div>

            {action.message ? (
              <div className="mt-3 rounded-ui-sm border border-border/60 bg-background/60 px-2 py-1.5 text-xs text-muted-foreground">
                {action.message}
              </div>
            ) : null}
          </div>

          {hostSession ? (
            <div className="min-h-[420px] overflow-hidden rounded-ui-md border border-border bg-background">
              <div className="border-b border-border/60 px-2 py-1.5 text-xs text-muted-foreground">
                <div className="truncate">
                  {hostSession.extensionId}@{hostSession.version}
                </div>
                <div className="truncate">
                  {hostSession.viewType ?? "No webview registered"}
                </div>
              </div>
              {hostSession.viewUrl ? (
                <iframe
                  title={`${hostSession.extensionId} sidebar`}
                  src={hostSession.viewUrl}
                  className="h-[520px] w-full border-0 bg-background"
                  sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-downloads"
                  data-codex-iframe="true"
                />
              ) : (
                <div className="p-3 text-xs text-muted-foreground">
                  This extension is active but did not register a sidebar view.
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
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
  icon: ReactNode;
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
      className="inline-flex h-8 min-w-0 items-center justify-center rounded-ui-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? <RefreshCw size={14} className="animate-spin" /> : icon}
    </button>
  );
}

function normalizeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
