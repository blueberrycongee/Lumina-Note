import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Download, RefreshCw, ExternalLink, Code2 } from "lucide-react";
import { CodexEmbeddedWebview } from "@/components/codex/CodexEmbeddedWebview";
import { useUIStore } from "@/stores/useUIStore";
import { useFileStore } from "@/stores/useFileStore";
import { reportOperationError } from "@/lib/reportError";

type HostInfo = {
  origin: string;
  port: number;
};

type ExtensionStatus = {
  installed: boolean;
  version: string | null;
  extensionPath: string | null;
  latestVersion: string | null;
};

type HostHealth = {
  ok?: boolean;
  activateError?: string | null;
  viewTypes?: string[];
  latestRuntimeIssue?: HostRuntimeIssue | null;
};

type HostRuntimeIssue = {
  id: number;
  viewType: string;
  kind: string;
  message: string;
  detail?: Record<string, unknown> | null;
  createdAt: number;
  lastSeenAt: number;
  count: number;
};

type Props = {
  visible: boolean;
  workspacePath: string | null;
  renderMode?: "native" | "iframe";
};

function inferLanguageId(filePath: string | null): string {
  if (!filePath) return "plaintext";
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".ts")) return "typescript";
  if (lower.endsWith(".tsx")) return "typescriptreact";
  if (lower.endsWith(".js")) return "javascript";
  if (lower.endsWith(".jsx")) return "javascriptreact";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".rs")) return "rust";
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".go")) return "go";
  if (lower.endsWith(".java")) return "java";
  if (lower.endsWith(".c")) return "c";
  if (lower.endsWith(".cc") || lower.endsWith(".cpp") || lower.endsWith(".cxx")) return "cpp";
  if (lower.endsWith(".h") || lower.endsWith(".hpp")) return "cpp";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "yaml";
  if (lower.endsWith(".toml")) return "toml";
  return "plaintext";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function readHostHealth(origin: string, signal: AbortSignal): Promise<HostHealth> {
  const response = await fetch(`${origin}/health`, { signal });
  return (await response.json()) as HostHealth;
}

function formatCodexRuntimeIssue(issue: HostRuntimeIssue): string {
  if (issue.kind === "securitypolicyviolation") {
    const directive =
      typeof issue.detail?.effectiveDirective === "string"
        ? issue.detail.effectiveDirective
        : typeof issue.detail?.violatedDirective === "string"
          ? issue.detail.violatedDirective
          : "content security policy";
    const blockedUri =
      typeof issue.detail?.blockedURI === "string" && issue.detail.blockedURI.trim().length > 0
        ? issue.detail.blockedURI
        : "a resource";
    return `Codex blocked ${blockedUri} because of ${directive}.`;
  }
  return issue.message;
}

async function waitForCodexViewReady(
  origin: string,
  viewType: string,
  signal: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + 15_000;
  let lastError: string | null = null;

  while (!signal.aborted && Date.now() < deadline) {
    try {
      const health = await readHostHealth(origin, signal);
      if (health.activateError) {
        throw new Error(String(health.activateError));
      }

      const viewTypes = Array.isArray(health.viewTypes) ? health.viewTypes : [];
      if (health.ok !== false && viewTypes.includes(viewType)) {
        return;
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, 150);
      signal.addEventListener(
        "abort",
        () => {
          window.clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
    });
  }

  if (signal.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  throw new Error(
    lastError
      ? `Codex host did not become ready: ${lastError}`
      : `Codex host did not register ${viewType} within 15 seconds`,
  );
}

export function CodexPanel({ visible, workspacePath, renderMode = "native" }: Props) {
  const isDarkMode = useUIStore((s) => s.isDarkMode);
  const currentFile = useFileStore((s) => s.currentFile);
  const currentContent = useFileStore((s) => s.currentContent);

  const [status, setStatus] = useState<ExtensionStatus | null>(null);
  const [host, setHost] = useState<HostInfo | null>(null);
  const [hostStarting, setHostStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [autoInstallAttempted, setAutoInstallAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hostLifecycleRef = useRef(false);
  const lastRuntimeIssueIdRef = useRef<number | null>(null);
  const token = useMemo(() => crypto.randomUUID(), []);

  const reportCodexPanelError = (action: string, rawError: unknown, context?: Record<string, unknown>) => {
    const message = rawError instanceof Error ? rawError.message : String(rawError);
    setError(message);
    reportOperationError({
      source: "CodexPanel",
      action,
      error: rawError,
      context,
    });
  };

  const viewType = "chatgpt.sidebarView";
  const themeParam = isDarkMode ? "dark" : "light";
  const viewUrl = host
    ? `${host.origin}/view/${encodeURIComponent(viewType)}?token=${encodeURIComponent(token)}&theme=${encodeURIComponent(themeParam)}`
    : null;

  const refresh = async () => {
    const s = await invoke<ExtensionStatus>("codex_extension_get_status");
    setStatus(s);
  };

  const installLatest = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await invoke<ExtensionStatus>("codex_extension_install_latest");
      setStatus(s);
    } catch (e) {
      reportCodexPanelError("Install latest Codex extension", e);
    } finally {
      setBusy(false);
    }
  };

  const installFromVsix = async () => {
    setError(null);
    const selected = await open({
      title: "Select Codex VSIX",
      multiple: false,
      filters: [{ name: "VSIX", extensions: ["vsix"] }],
    });
    if (!selected || typeof selected !== "string") return;

    setBusy(true);
    try {
      const s = await invoke<ExtensionStatus>("codex_extension_install_vsix", {
        vsixPath: selected,
      });
      setStatus(s);
    } catch (e) {
      reportCodexPanelError("Install Codex extension from VSIX", e, { vsixPath: selected });
    } finally {
      setBusy(false);
    }
  };

  const shouldRunHost = visible && Boolean(workspacePath) && Boolean(status?.installed && status?.extensionPath);

  useEffect(() => {
    refresh().catch((e) => reportCodexPanelError("Load Codex extension status", e));
  }, []);

  useEffect(() => {
    if (!visible) {
      setAutoInstallAttempted(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!shouldRunHost || !status?.extensionPath || !workspacePath) return;

    let canceled = false;
    const controller = new AbortController();

    const run = async () => {
      setError(null);
      setHost(null);
      setHostStarting(true);
      lastRuntimeIssueIdRef.current = null;
      hostLifecycleRef.current = true;

      const info = await invoke<HostInfo>("codex_vscode_host_start", {
        extensionPath: status.extensionPath,
        workspacePath,
      });

      await waitForCodexViewReady(info.origin, viewType, controller.signal);
      if (canceled) return;
      setHost(info);
    };

    run().catch((error) => {
      if (canceled || isAbortError(error)) return;
      hostLifecycleRef.current = false;
      void invoke("codex_vscode_host_stop").catch((stopError) => {
        reportOperationError({
          source: "CodexPanel",
          action: "Stop failed Codex host startup",
          error: stopError,
          level: "warning",
        });
      });
      reportCodexPanelError("Start Codex host", error, { visible, workspacePath });
    }).finally(() => {
      if (!canceled) {
        setHostStarting(false);
      }
    });

    return () => {
      canceled = true;
      controller.abort();
    };
  }, [shouldRunHost, status?.extensionPath, viewType, visible, workspacePath]);

  useEffect(() => {
    if (shouldRunHost) return;
    setHost(null);
    setHostStarting(false);
    lastRuntimeIssueIdRef.current = null;
    if (!hostLifecycleRef.current) return;
    hostLifecycleRef.current = false;
    void invoke("codex_vscode_host_stop").catch((stopError) => {
      reportOperationError({
        source: "CodexPanel",
        action: "Stop Codex host when panel becomes inactive",
        error: stopError,
        level: "warning",
      });
    });
  }, [shouldRunHost]);

  useEffect(() => {
    if (!visible || !workspacePath || busy) return;
    if (!status || status.installed) return;
    if (autoInstallAttempted) return;
    setAutoInstallAttempted(true);
    installLatest().catch((error) => {
      reportCodexPanelError("Auto-install Codex extension", error, { workspacePath });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, workspacePath, status?.installed, busy, autoInstallAttempted]);

  useEffect(() => {
    return () => {
      if (!hostLifecycleRef.current) return;
      hostLifecycleRef.current = false;
      void invoke("codex_vscode_host_stop").catch((stopError) => {
        reportOperationError({
          source: "CodexPanel",
          action: "Stop Codex host on unmount",
          error: stopError,
          level: "warning",
        });
      });
    };
  }, []);

  useEffect(() => {
    if (!host || !visible) return;

    let canceled = false;
    const controller = new AbortController();

    const syncHealth = async () => {
      const health = await readHostHealth(host.origin, controller.signal);
      if (canceled) return;

      if (health.activateError) {
        reportCodexPanelError("Codex host runtime health check", new Error(String(health.activateError)), {
          hostOrigin: host.origin,
        });
        return;
      }

      const runtimeIssue = health.latestRuntimeIssue;
      if (!runtimeIssue || lastRuntimeIssueIdRef.current === runtimeIssue.id) return;

      lastRuntimeIssueIdRef.current = runtimeIssue.id;
      const message = formatCodexRuntimeIssue(runtimeIssue);
      setError(message);
      reportOperationError({
        source: "CodexPanel",
        action: "Render Codex webview",
        error: message,
        userMessage: message,
        context: {
          hostOrigin: host.origin,
          viewType: runtimeIssue.viewType,
          kind: runtimeIssue.kind,
          detail: runtimeIssue.detail ?? null,
          count: runtimeIssue.count,
        },
      });
    };

    syncHealth().catch((healthError) => {
      if (canceled || isAbortError(healthError)) return;
      reportOperationError({
        source: "CodexPanel",
        action: "Poll Codex host health",
        error: healthError,
        level: "warning",
        context: { hostOrigin: host.origin },
      });
    });

    const interval = window.setInterval(() => {
      void syncHealth().catch((healthError) => {
        if (canceled || isAbortError(healthError)) return;
        reportOperationError({
          source: "CodexPanel",
          action: "Poll Codex host health",
          error: healthError,
          level: "warning",
          context: { hostOrigin: host.origin },
        });
      });
    }, 2000);

    return () => {
      canceled = true;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [host, visible]);

  // Push theme + current document into the VS Code shim.
  useEffect(() => {
    if (!host || !visible) return;

    const controller = new AbortController();
    const run = async () => {
      const activeDocument = currentFile
        ? {
            path: currentFile,
            languageId: inferLanguageId(currentFile),
            content: currentContent ?? "",
          }
        : null;

      await fetch(`${host.origin}/lumina/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: themeParam,
          activeDocument,
        }),
        signal: controller.signal,
      });
    };

    const id = window.setTimeout(() => {
      run().catch((error) => {
        reportOperationError({
          source: "CodexPanel",
          action: "Sync current document to Codex host",
          error,
          level: "warning",
          context: { hostOrigin: host.origin, currentFile },
        });
      });
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(id);
    };
  }, [host?.origin, visible, themeParam, currentFile, currentContent]);

  const needsInstall = status ? !status.installed : true;
  const needsUpdate =
    Boolean(status?.installed && status?.version && status?.latestVersion) &&
    status?.version !== status?.latestVersion;

  return (
    <div className="flex-1 h-full w-full flex flex-col overflow-hidden min-h-0">
      <div className="p-3 border-b border-border flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-xs font-medium tracking-tight flex items-center gap-1.5">
              <Code2 size={14} />
              Codex
            </div>
            {status?.installed && status.version && (
              <span className="text-[11px] text-muted-foreground font-mono">v{status.version}</span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {workspacePath ? (
              <span className="font-mono">{workspacePath}</span>
            ) : (
              "Open a vault to use Codex"
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status?.installed && needsUpdate && (
            <button
              onClick={() => installLatest()}
              disabled={busy}
              className="h-8 px-2 rounded-md border border-border bg-muted/40 hover:bg-muted/70 text-xs flex items-center gap-1 disabled:opacity-50"
              title="Update Codex extension"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Update
            </button>
          )}
          <button
            onClick={() => {
              refresh().catch((error) => {
                reportCodexPanelError("Refresh Codex extension status", error);
              });
            }}
            disabled={busy}
            className="h-8 px-2 rounded-md border border-border bg-muted/40 hover:bg-muted/70 text-xs flex items-center gap-1 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 text-xs text-red-500 border-b border-border bg-red-500/5">
          {error}
        </div>
      )}

      {needsInstall && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-sm w-full rounded-xl border border-border bg-card/60 p-4 space-y-3">
            <div className="text-sm font-semibold tracking-tight">Install Codex</div>
            <div className="text-xs text-muted-foreground">
              Downloads the latest <span className="font-mono">openai.chatgpt</span> VS Code extension from the official
              Marketplace and runs it inside Lumina Note.
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => installLatest()}
                disabled={busy || !workspacePath}
                className="h-9 px-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                Download & Install
              </button>
              <button
                onClick={() => installFromVsix()}
                disabled={busy || !workspacePath}
                className="h-9 px-3 rounded-lg border border-border bg-muted/40 hover:bg-muted/70 text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                Import VSIX
              </button>
              <button
                onClick={() => openExternal("https://marketplace.visualstudio.com/items?itemName=openai.chatgpt")}
                className="h-9 px-3 rounded-lg border border-border bg-muted/40 hover:bg-muted/70 text-sm font-medium flex items-center gap-2"
              >
                <ExternalLink size={14} />
                Marketplace
              </button>
            </div>
            {!workspacePath && <div className="text-[11px] text-muted-foreground">Open a vault first.</div>}
          </div>
        </div>
      )}

      {!needsInstall && (
        <div className="flex-1 overflow-hidden min-h-0">
          {hostStarting && !viewUrl ? (
            <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground gap-2">
              <Loader2 size={16} className="animate-spin" />
              Starting Codex...
            </div>
          ) : renderMode === "iframe" && viewUrl ? (
            <iframe
              title="Codex Webview"
              src={viewUrl}
              className="block w-full h-full border-0 bg-background"
              data-codex-iframe="true"
            />
          ) : viewUrl ? (
            <CodexEmbeddedWebview
              url={viewUrl}
              visible={visible}
              className="w-full h-full bg-background"
              closeOnUnmount={false}
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
              {workspacePath ? "Codex is unavailable right now." : "Open a vault to use Codex"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
