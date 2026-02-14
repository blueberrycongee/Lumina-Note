import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useState } from "react";
import { CodexEmbeddedWebview } from "./CodexEmbeddedWebview";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { reportOperationError } from "@/lib/reportError";

type HostInfo = {
  origin: string;
  port: number;
};

type Props = {
  onClose?: () => void;
};

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border ${
        ok
          ? "bg-emerald-500/10 text-emerald-300 border-emerald-400/20"
          : "bg-rose-500/10 text-rose-300 border-rose-400/20"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-rose-400"}`} />
      {children}
    </span>
  );
}

export function CodexVscodeHostPanel({ onClose }: Props) {
  const { t } = useLocaleStore();
  const [extensionPath, setExtensionPath] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [viewType, setViewType] = useState("chatgpt.sidebarView");
  const [host, setHost] = useState<HostInfo | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const token = useMemo(() => crypto.randomUUID(), []);

  const reportHostPanelError = (action: string, rawError: unknown) => {
    const message = rawError instanceof Error ? rawError.message : String(rawError);
    setError(message);
    reportOperationError({
      source: "CodexVscodeHostPanel",
      action,
      error: rawError,
    });
  };

  const viewUrl = host
    ? `${host.origin}/view/${encodeURIComponent(viewType)}?token=${encodeURIComponent(token)}`
    : null;

  const start = async () => {
    setError(null);
    setHealth(null);
    const info = await invoke<HostInfo>("codex_vscode_host_start", { extensionPath, workspacePath });
    setHost(info);
  };

  const stop = async () => {
    setError(null);
    await invoke("codex_vscode_host_stop");
    setHost(null);
    setHealth(null);
  };

  const pickExtensionDir = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select VS Code extension folder (contains package.json)",
    });
    if (selected && typeof selected === "string") {
      setExtensionPath(selected);
    }
  };

  const pickWorkspaceDir = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select workspace folder (maps to vscode.workspace.workspaceFolders[0])",
    });
    if (selected && typeof selected === "string") {
      setWorkspacePath(selected);
    }
  };

  useEffect(() => {
    if (!host) return;
    let canceled = false;

    const tick = async () => {
      try {
        const h = await fetch(`${host.origin}/health`).then((r) => r.json());
        if (!canceled) setHealth(h);
      } catch (e) {
        if (!canceled) setHealth({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    };

    tick();
    const id = setInterval(tick, 1500);
    return () => {
      canceled = true;
      clearInterval(id);
    };
  }, [host]);

  useEffect(() => {
    return () => {
      void invoke("codex_vscode_host_stop").catch((error) => {
        reportOperationError({
          source: "CodexVscodeHostPanel",
          action: "Stop Codex VSCode host on unmount",
          error,
          level: "warning",
        });
      });
    };
  }, []);

  const healthOk = Boolean(health?.ok);
  const viewTypes: string[] = Array.isArray(health?.viewTypes) ? health.viewTypes : [];

  return (
    <div className="h-full w-full bg-slate-950 text-slate-100">
      <div className="sticky top-0 z-10 border-b border-slate-200/10 bg-slate-950/70 backdrop-blur-md">
        <div className="mx-auto max-w-[1200px] px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold tracking-tight">Codex Extension Host</div>
              {health ? (
                <Badge ok={healthOk}>{healthOk ? "healthy" : "error"}</Badge>
              ) : (
                <Badge ok={false}>idle</Badge>
              )}
            </div>
            <div className="text-xs text-slate-400 truncate">
              {host ? <span className="font-mono">{host.origin}</span> : "Runs a minimal VS Code host for openai.chatgpt (Codex)"}
            </div>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="h-9 px-3 rounded-lg border border-slate-200/10 bg-slate-900/40 hover:bg-slate-900/70 transition-colors text-sm"
            >
              {t.common.close} (Esc)
            </button>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] p-4 grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-5 space-y-4">
          <div className="rounded-xl border border-slate-200/10 bg-slate-900/30 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
            <div className="p-4 space-y-3">
              <div>
                <div className="text-xs font-medium text-slate-300">Extension Folder</div>
                <div className="text-[11px] text-slate-400">
                  Select the extracted VSIX <span className="font-mono">extension/</span> directory (contains{" "}
                  <span className="font-mono">package.json</span>).
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  className="h-10 flex-1 min-w-0 px-3 rounded-lg border border-slate-200/10 bg-slate-950/60 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:border-slate-200/20"
                  placeholder="D:\\...\\openai.chatgpt\\extension"
                  value={extensionPath}
                  onChange={(e) => setExtensionPath(e.target.value)}
                />
                <button
                  className="h-10 px-3 rounded-lg border border-slate-200/10 bg-slate-900/40 hover:bg-slate-900/70 transition-colors text-sm"
                  onClick={pickExtensionDir}
                >
                  Browse
                </button>
              </div>

              <div className="pt-3 border-t border-slate-200/10 space-y-2">
                <div className="text-xs font-medium text-slate-300">Workspace Folder</div>
                <div className="text-[11px] text-slate-400">
                  Codex requires a workspace. This maps to <span className="font-mono">vscode.workspace.workspaceFolders[0]</span>.
                </div>
                <div className="flex gap-2">
                  <input
                    className="h-10 flex-1 min-w-0 px-3 rounded-lg border border-slate-200/10 bg-slate-950/60 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:border-slate-200/20"
                    placeholder="D:\\...\\YourVault"
                    value={workspacePath}
                    onChange={(e) => setWorkspacePath(e.target.value)}
                  />
                  <button
                    className="h-10 px-3 rounded-lg border border-slate-200/10 bg-slate-900/40 hover:bg-slate-900/70 transition-colors text-sm"
                    onClick={pickWorkspaceDir}
                  >
                    Browse
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="flex items-center gap-2 text-xs text-slate-400 min-w-0">
                  <span className="shrink-0">viewType</span>
                  <input
                    className="h-9 flex-1 min-w-0 sm:flex-none sm:w-[240px] px-3 rounded-lg border border-slate-200/10 bg-slate-950/60 text-sm font-mono placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:border-slate-200/20"
                    value={viewType}
                    onChange={(e) => setViewType(e.target.value)}
                  />
                </div>

                {!host ? (
                  <button
                    className="h-10 px-4 rounded-lg bg-slate-100 text-slate-950 hover:bg-white transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() =>
                      start().catch((e) => reportHostPanelError("Start Codex VSCode host", e))
                    }
                    disabled={!extensionPath.trim()}
                  >
                    Start
                  </button>
                ) : (
                  <button
                    className="h-10 px-4 rounded-lg bg-rose-500/15 text-rose-200 border border-rose-400/20 hover:bg-rose-500/20 transition-colors text-sm font-medium"
                    onClick={() =>
                      stop().catch((e) => reportHostPanelError("Stop Codex VSCode host", e))
                    }
                  >
                    Stop
                  </button>
                )}
              </div>

              {viewTypes.length > 0 && (
                <div className="pt-2 border-t border-slate-200/10">
                  <div className="text-[11px] text-slate-400 mb-2">Detected view types</div>
                  <div className="flex flex-wrap gap-2">
                    {viewTypes.slice(0, 6).map((vt) => (
                      <button
                        key={vt}
                        onClick={() => setViewType(vt)}
                        className="px-2 py-1 rounded-lg border border-slate-200/10 bg-slate-950/40 hover:bg-slate-900/60 transition-colors text-[11px] font-mono text-slate-200"
                      >
                        {vt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {(error || health?.activateError) && (
            <div className="rounded-xl border border-rose-400/20 bg-rose-500/5">
              <div className="p-4 space-y-2">
                <div className="text-xs font-medium text-rose-200">Error</div>
                {error && <div className="text-sm text-rose-200">{error}</div>}
                {health?.activateError && (
                  <pre className="text-xs text-rose-100/90 whitespace-pre-wrap break-words font-mono">{String(health.activateError)}</pre>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200/10 bg-slate-900/30">
              <div className="p-4">
                <div className="text-xs text-slate-400 mb-2">Host</div>
                <pre className="text-xs whitespace-pre-wrap break-words font-mono text-slate-200/90">
                  {host ? JSON.stringify(host, null, 2) : "not running"}
                </pre>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200/10 bg-slate-900/30">
              <div className="p-4">
                <div className="text-xs text-slate-400 mb-2">/health</div>
                <pre className="text-xs whitespace-pre-wrap break-words font-mono text-slate-200/90">
                  {health ? JSON.stringify(health, null, 2) : "not fetched"}
                </pre>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-7">
          <div className="min-h-[520px] h-[calc(100vh-160px)]">
            {viewUrl ? (
              <CodexEmbeddedWebview url={viewUrl} visible />
            ) : (
              <div className="h-full rounded-xl border border-slate-200/10 bg-slate-950 shadow-[0_0_0_1px_rgba(255,255,255,0.04)] flex items-center justify-center">
                <div className="text-sm text-slate-400">Start the host to load the webview.</div>
              </div>
            )}
          </div>

          {viewUrl && <div className="mt-3 text-[11px] text-slate-500 font-mono break-all">{viewUrl}</div>}
        </div>
      </div>
    </div>
  );
}
