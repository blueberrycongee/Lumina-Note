import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Play,
  Download,
  FileUp,
  RefreshCw,
  RotateCcw,
  X,
} from "lucide-react";
import {
  checkLatestVscodeAiExtension,
  activateInstalledVscodeAiExtension,
  getVscodeAiExtensionDiagnostics,
  openActiveVscodeAiExtension,
  installVscodeAiCompatProfiles,
  installLatestVscodeAiExtension,
  installLocalVscodeAiExtensionVsix,
  openDialog,
  rollbackVscodeAiExtension,
  stopVscodeAiExtensionHost,
  type VscodeAiExtensionDiagnosticsItem,
  type VscodeAiExtensionHostSession,
  type VscodeAiExtensionId,
  type VscodeAiExtensionSource,
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
  const [source, setSource] = useState<VscodeAiExtensionSource>("marketplace");
  const [marketplaceTermsAccepted, setMarketplaceTermsAccepted] =
    useState(false);
  const [githubOwner, setGithubOwner] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [githubAssetPattern, setGithubAssetPattern] = useState("");
  const [compatIndexUrl, setCompatIndexUrl] = useState("");
  const [hostSession, setHostSession] =
    useState<VscodeAiExtensionHostSession | null>(null);

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
        ...remoteSourceOptions(source, {
          marketplaceTermsAccepted,
          githubOwner,
          githubRepo,
          githubAssetPattern,
        }),
      });
      return `Latest ${latest.version} from ${sourceLabel(source)}`;
    });

  const installLatest = (extensionId: VscodeAiExtensionId) =>
    runAction(`install:${extensionId}`, async () => {
      const result = await installLatestVscodeAiExtension({
        extensionId,
        ...remoteSourceOptions(source, {
          marketplaceTermsAccepted,
          githubOwner,
          githubRepo,
          githubAssetPattern,
        }),
      });
      return `Install result: ${result.outcome.decision}`;
    });

  const installCompatProfiles = () =>
    runAction("compat-profiles", async () => {
      const indexUrl = compatIndexUrl.trim();
      if (!indexUrl) return "Compatibility profile index URL is required";
      const result = await installVscodeAiCompatProfiles({ indexUrl });
      return `Installed ${result.profiles.length} compatibility profiles`;
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

  const activateLatest = (item: VscodeAiExtensionDiagnosticsItem) =>
    runAction(`activate:${item.extensionId}`, async () => {
      const latest = item.installed[0];
      if (!latest) return "No installed version to activate";
      const record = await activateInstalledVscodeAiExtension({
        extensionId: item.extensionId,
        version: latest.version,
        allowUnverified: latest.compatibility.status !== "stable",
      });
      return `Activated ${record.version}`;
    });

  const openExtension = (item: VscodeAiExtensionDiagnosticsItem) =>
    runAction(`open:${item.extensionId}`, async () => {
      if (!item.active) return "No active version to open";
      const session = await openActiveVscodeAiExtension({
        extensionId: item.extensionId,
      });
      setHostSession(session);
      return session.viewUrl
        ? `Opened ${item.displayName}`
        : `${item.displayName} is running, but it did not register a webview.`;
    });

  const closeHostSession = async () => {
    setHostSession(null);
    await stopVscodeAiExtensionHost().catch((err) => {
      reportOperationError({
        source: "VscodeAiExtensionsSection",
        action: "Stop VS Code AI extension host",
        error: err,
      });
    });
  };

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

      <div className="grid gap-3 rounded-lg border border-border/60 bg-background/40 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <label className="block text-xs font-medium text-muted-foreground">
            Remote source
          </label>
          <select
            aria-label="VS Code extension remote source"
            value={source}
            onChange={(event) =>
              setSource(event.target.value as VscodeAiExtensionSource)
            }
            className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm"
          >
            <option value="open-vsx">Open VSX</option>
            <option value="marketplace">Marketplace</option>
            <option value="github-release">GitHub Release</option>
          </select>
          {source === "marketplace" ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={marketplaceTermsAccepted}
                onChange={(event) =>
                  setMarketplaceTermsAccepted(event.target.checked)
                }
              />
              <span>I have accepted Marketplace terms</span>
            </label>
          ) : null}
          {source === "github-release" ? (
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                aria-label="GitHub owner"
                value={githubOwner}
                onChange={(event) => setGithubOwner(event.target.value)}
                className="h-8 min-w-0 rounded-lg border border-border bg-background px-2 text-sm"
                placeholder="owner"
              />
              <input
                aria-label="GitHub repo"
                value={githubRepo}
                onChange={(event) => setGithubRepo(event.target.value)}
                className="h-8 min-w-0 rounded-lg border border-border bg-background px-2 text-sm"
                placeholder="repo"
              />
              <input
                aria-label="GitHub asset pattern"
                value={githubAssetPattern}
                onChange={(event) => setGithubAssetPattern(event.target.value)}
                className="h-8 min-w-0 rounded-lg border border-border bg-background px-2 text-sm"
                placeholder="asset regex"
              />
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <label
            className="block text-xs font-medium text-muted-foreground"
            htmlFor="vscode-ai-compat-index"
          >
            Compatibility profile index URL
          </label>
          <div className="flex gap-2">
            <input
              id="vscode-ai-compat-index"
              value={compatIndexUrl}
              onChange={(event) => setCompatIndexUrl(event.target.value)}
              className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-sm"
              placeholder="https://..."
            />
            <button
              type="button"
              onClick={() => void installCompatProfiles()}
              disabled={action.key === "compat-profiles"}
              className="h-8 shrink-0 rounded-lg border border-border bg-background/60 px-3 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              {action.key === "compat-profiles" ? "Updating" : "Update"}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const missing = item.hostCapabilities?.missingCapabilities ?? [];
          const latestInstalled = item.installed[0] ?? null;
          const platformMismatch = item.platform?.compatible === false;
          const isReady =
            item.compatibility?.status === "stable" &&
            item.hostCapabilities?.canRunWithoutMissingCapabilities === true &&
            !platformMismatch;
          return (
            <article
              key={item.extensionId}
              className="rounded-lg border border-border/60 bg-background/40 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {missing.length === 0 && !platformMismatch ? (
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
                  <p className="mt-1 text-xs text-muted-foreground">
                    Installed: {item.installed.length}
                    {latestInstalled
                      ? ` · Latest installed: ${latestInstalled.version} (${latestInstalled.compatibility.status}, ${latestInstalled.smokeTestPassed ? "smoke passed" : "smoke pending"})`
                      : ""}
                  </p>
                  {missing.length > 0 ? (
                    <p className="mt-1 text-xs text-amber-600">
                      Missing: {missing.join(", ")}
                    </p>
                  ) : null}
                  {platformMismatch ? (
                    <p className="mt-1 text-xs text-amber-600">
                      Platform mismatch: expected {item.platform?.expectedPlatform},
                      got {item.platform?.targetPlatform ?? "unknown"}.
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
                    label={`Activate latest installed ${item.displayName}`}
                    busy={action.key === `activate:${item.extensionId}`}
                    onClick={() => void activateLatest(item)}
                    disabled={
                      !latestInstalled ||
                      latestInstalled.version === item.active?.version
                    }
                    icon={<Play className="h-4 w-4" />}
                  />
                  <IconButton
                    label={`Open ${item.displayName}`}
                    busy={action.key === `open:${item.extensionId}`}
                    onClick={() => void openExtension(item)}
                    disabled={
                      !item.active ||
                      platformMismatch ||
                      item.hostCapabilities?.canRunWithoutMissingCapabilities === false
                    }
                    icon={<Play className="h-4 w-4" />}
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
      {hostSession ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4">
          <div className="flex h-[82vh] w-[min(1120px,96vw)] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-elev-3">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {hostSession.extensionId}@{hostSession.version}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {hostSession.viewType ?? "No webview registered"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void closeHostSession()}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background/60 hover:bg-muted"
                aria-label="Close VS Code AI extension"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {hostSession.viewUrl ? (
              <iframe
                title={`${hostSession.extensionId} webview`}
                src={hostSession.viewUrl}
                className="min-h-0 flex-1 border-0 bg-background"
                sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-downloads"
                data-codex-iframe="true"
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
                This extension is active but did not register a webview entry.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function sourceLabel(source: VscodeAiExtensionSource): string {
  if (source === "marketplace") return "Marketplace";
  if (source === "github-release") return "GitHub Releases";
  return "Open VSX";
}

function remoteSourceOptions(
  source: VscodeAiExtensionSource,
  options: {
    marketplaceTermsAccepted: boolean;
    githubOwner: string;
    githubRepo: string;
    githubAssetPattern: string;
  },
): {
  source: VscodeAiExtensionSource;
  marketplaceTermsAccepted?: boolean;
  githubOwner?: string;
  githubRepo?: string;
  githubAssetPattern?: string;
} {
  if (source === "marketplace") {
    return { source, marketplaceTermsAccepted: options.marketplaceTermsAccepted };
  }
  if (source === "github-release") {
    return {
      source,
      githubOwner: options.githubOwner.trim(),
      githubRepo: options.githubRepo.trim(),
      githubAssetPattern: options.githubAssetPattern.trim() || undefined,
    };
  }
  return { source };
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
