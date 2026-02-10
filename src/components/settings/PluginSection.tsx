import { useEffect, useMemo, useState } from "react";
import { usePluginStore } from "@/stores/usePluginStore";
import { useFileStore } from "@/stores/useFileStore";
import { showInExplorer } from "@/lib/tauri";

const SOURCE_ORDER = ["workspace", "user", "builtin"];

export function PluginSection() {
  const { vaultPath } = useFileStore();
  const {
    plugins,
    enabledById,
    runtimeStatus,
    loading,
    error,
    workspacePluginDir,
    loadPlugins,
    reloadPlugins,
    setPluginEnabled,
    ensureWorkspacePluginDir,
    scaffoldExamplePlugin,
  } = usePluginStore();
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    void loadPlugins(vaultPath || undefined);
  }, [vaultPath, loadPlugins]);

  const grouped = useMemo(() => {
    const groups: Record<string, typeof plugins> = {};
    for (const plugin of plugins) {
      const source = plugin.source || "unknown";
      if (!groups[source]) groups[source] = [];
      groups[source].push(plugin);
    }
    return groups;
  }, [plugins]);

  const sourceLabel = (source: string) => {
    if (source === "workspace") return "Workspace";
    if (source === "user") return "User";
    if (source === "builtin") return "Built-in";
    return source;
  };

  const isEnabled = (pluginId: string, fallback: boolean) => {
    if (Object.prototype.hasOwnProperty.call(enabledById, pluginId)) {
      return Boolean(enabledById[pluginId]);
    }
    return fallback;
  };

  const handleOpenWorkspacePluginDir = async () => {
    if (!vaultPath) return;
    try {
      setBusyAction("open-dir");
      const dir = await ensureWorkspacePluginDir(vaultPath);
      await showInExplorer(dir);
    } finally {
      setBusyAction(null);
    }
  };

  const handleScaffold = async () => {
    if (!vaultPath) return;
    try {
      setBusyAction("scaffold");
      const dir = await scaffoldExamplePlugin(vaultPath);
      await showInExplorer(dir);
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Plugins (Developer Preview)</h3>

      <p className="text-sm text-muted-foreground">
        Lumina loads plugins from <code>.lumina/plugins</code> (workspace), app data plugins (user), and bundled plugins.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => loadPlugins(vaultPath || undefined)}
          disabled={loading}
          className="h-9 px-3 rounded-lg text-sm font-medium border border-border bg-background/60 hover:bg-muted disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh List"}
        </button>
        <button
          type="button"
          onClick={() => reloadPlugins(vaultPath || undefined)}
          disabled={loading}
          className="h-9 px-3 rounded-lg text-sm font-medium border border-border bg-background/60 hover:bg-muted disabled:opacity-50"
        >
          Reload Runtime
        </button>
        <button
          type="button"
          onClick={handleOpenWorkspacePluginDir}
          disabled={!vaultPath || busyAction === "open-dir"}
          className="h-9 px-3 rounded-lg text-sm font-medium border border-border bg-background/60 hover:bg-muted disabled:opacity-50"
        >
          Open Workspace Plugin Folder
        </button>
        <button
          type="button"
          onClick={handleScaffold}
          disabled={!vaultPath || busyAction === "scaffold"}
          className="h-9 px-3 rounded-lg text-sm font-medium border border-border bg-background/60 hover:bg-muted disabled:opacity-50"
        >
          Scaffold Example Plugin
        </button>
      </div>

      {workspacePluginDir && (
        <p className="text-xs text-muted-foreground break-all">
          Workspace plugins dir: <code>{workspacePluginDir}</code>
        </p>
      )}

      {error && (
        <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-md p-2">{error}</div>
      )}

      {!loading && plugins.length === 0 && (
        <div className="text-xs text-muted-foreground border border-border rounded-lg p-3">
          No plugins found yet. Use "Scaffold Example Plugin" to create your first plugin.
        </div>
      )}

      {SOURCE_ORDER.map((source) => {
        const items = grouped[source];
        if (!items || items.length === 0) return null;
        return (
          <div key={source} className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-foreground">
              <span>{sourceLabel(source)}</span>
              <span className="text-muted-foreground">{items.length}</span>
            </div>

            <div className="space-y-2">
              {items.map((plugin) => {
                const enabled = isEnabled(plugin.id, plugin.enabled_by_default);
                const status = runtimeStatus[plugin.id];
                return (
                  <div
                    key={`${plugin.source}:${plugin.id}`}
                    className="border border-border rounded-lg p-3 bg-background/60 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{plugin.name}</p>
                        <p className="text-xs text-muted-foreground">{plugin.id} · v{plugin.version}</p>
                        <p className="text-[11px] text-muted-foreground">
                          API {plugin.api_version || "1"}
                          {plugin.min_app_version ? ` · min app ${plugin.min_app_version}` : ""}
                          {plugin.is_desktop_only ? " · desktop-only" : ""}
                        </p>
                        {plugin.description && (
                          <p className="text-xs text-muted-foreground mt-1">{plugin.description}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setPluginEnabled(plugin.id, !enabled, vaultPath || undefined)}
                        className={`h-8 px-3 rounded-lg text-xs font-medium border transition-colors ${
                          enabled
                            ? "bg-primary text-primary-foreground border-primary/40 hover:bg-primary/90"
                            : "bg-background/60 border-border hover:bg-muted"
                        }`}
                      >
                        {enabled ? "Enabled" : "Disabled"}
                      </button>
                    </div>

                    <div className="text-xs text-muted-foreground break-all">
                      Entry: <code>{plugin.entry_path}</code>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {(plugin.permissions || []).map((perm) => (
                        <span
                          key={perm}
                          className="px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground"
                        >
                          {perm}
                        </span>
                      ))}
                      {(plugin.permissions || []).length === 0 && (
                        <span className="text-[10px] text-muted-foreground">No permissions declared</span>
                      )}
                    </div>

                    {status?.error && (
                      <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-md p-2">
                        Runtime error: {status.error}
                      </div>
                    )}
                    {enabled && status?.loaded && !status?.error && (
                      <div className="text-[11px] text-emerald-500">Loaded</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
