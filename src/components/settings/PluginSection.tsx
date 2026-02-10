import { useMemo, useState } from "react";
import { usePluginStore } from "@/stores/usePluginStore";
import { useFileStore } from "@/stores/useFileStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { showInExplorer } from "@/lib/tauri";

const SOURCE_ORDER = ["workspace", "user", "builtin"];

export function PluginSection() {
  const { t } = useLocaleStore();
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
    scaffoldThemePlugin,
    scaffoldUiOverhaulPlugin,
    appearanceSafeMode,
    setAppearanceSafeMode,
    isolatePluginStyles,
  } = usePluginStore();
  const [busyAction, setBusyAction] = useState<string | null>(null);

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
    if (source === "workspace") return t.plugins.sourceWorkspace;
    if (source === "user") return t.plugins.sourceUser;
    if (source === "builtin") return t.plugins.sourceBuiltin;
    return t.plugins.sourceUnknown;
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

  const handleScaffoldTheme = async () => {
    if (!vaultPath) return;
    try {
      setBusyAction("scaffold-theme");
      const dir = await scaffoldThemePlugin(vaultPath);
      await showInExplorer(dir);
    } finally {
      setBusyAction(null);
    }
  };

  const handleScaffoldUiOverhaul = async () => {
    if (!vaultPath) return;
    try {
      setBusyAction("scaffold-ui-overhaul");
      const dir = await scaffoldUiOverhaulPlugin(vaultPath);
      await showInExplorer(dir);
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        {t.plugins.title}
      </h3>

      <p className="text-sm text-muted-foreground">
        {t.plugins.intro}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAppearanceSafeMode(!appearanceSafeMode, vaultPath || undefined)}
          className={`h-9 px-3 rounded-lg text-sm font-medium border ${
            appearanceSafeMode
              ? "bg-amber-500/20 text-amber-700 border-amber-500/40"
              : "border-border bg-background/60 hover:bg-muted"
          }`}
        >
          {appearanceSafeMode ? t.plugins.safeModeOn : t.plugins.safeModeOff}
        </button>
        <button
          type="button"
          onClick={() => isolatePluginStyles()}
          className="h-9 px-3 rounded-lg text-sm font-medium border border-border bg-background/60 hover:bg-muted"
        >
          {t.plugins.unloadStyles}
        </button>
        <button
          type="button"
          onClick={() => loadPlugins(vaultPath || undefined)}
          disabled={loading}
          className="h-9 px-3 rounded-lg text-sm font-medium border border-border bg-background/60 hover:bg-muted disabled:opacity-50"
        >
          {loading ? t.plugins.refreshing : t.plugins.refreshList}
        </button>
        <button
          type="button"
          onClick={() => reloadPlugins(vaultPath || undefined)}
          disabled={loading}
          className="h-9 px-3 rounded-lg text-sm font-medium border border-border bg-background/60 hover:bg-muted disabled:opacity-50"
        >
          {t.plugins.reloadRuntime}
        </button>
        <button
          type="button"
          onClick={handleOpenWorkspacePluginDir}
          disabled={!vaultPath || busyAction === "open-dir"}
          className="h-9 px-3 rounded-lg text-sm font-medium border border-border bg-background/60 hover:bg-muted disabled:opacity-50"
        >
          {t.plugins.openWorkspaceFolder}
        </button>
        <button
          type="button"
          onClick={handleScaffold}
          disabled={!vaultPath || busyAction === "scaffold"}
          className="h-9 px-3 rounded-lg text-sm font-medium border border-border bg-background/60 hover:bg-muted disabled:opacity-50"
        >
          {t.plugins.scaffoldExample}
        </button>
        <button
          type="button"
          onClick={handleScaffoldTheme}
          disabled={!vaultPath || busyAction === "scaffold-theme"}
          className="h-9 px-3 rounded-lg text-sm font-medium border border-border bg-background/60 hover:bg-muted disabled:opacity-50"
        >
          {t.plugins.scaffoldTheme}
        </button>
        <button
          type="button"
          onClick={handleScaffoldUiOverhaul}
          disabled={!vaultPath || busyAction === "scaffold-ui-overhaul"}
          className="h-9 px-3 rounded-lg text-sm font-medium border border-border bg-background/60 hover:bg-muted disabled:opacity-50"
        >
          {t.plugins.scaffoldUiOverhaul}
        </button>
      </div>

      {workspacePluginDir && (
        <p className="text-xs text-muted-foreground break-all">
          {t.plugins.workspaceDirLabel}: <code>{workspacePluginDir}</code>
        </p>
      )}

      {error && (
        <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-md p-2">{error}</div>
      )}

      {!loading && plugins.length === 0 && (
        <div className="text-xs text-muted-foreground border border-border rounded-lg p-3">
          {t.plugins.noPluginsFound}
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
                          {t.plugins.labelApi} {plugin.api_version || "1"}
                          {plugin.min_app_version
                            ? ` · ${t.plugins.labelMinApp} ${plugin.min_app_version}`
                            : ""}
                          {plugin.is_desktop_only ? ` · ${t.plugins.labelDesktopOnly}` : ""}
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
                        {enabled ? t.plugins.statusEnabled : t.plugins.statusDisabled}
                      </button>
                    </div>

                    <div className="text-xs text-muted-foreground break-all">
                      {t.plugins.labelEntry}: <code>{plugin.entry_path}</code>
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
                        <span className="text-[10px] text-muted-foreground">
                          {t.plugins.statusNoPermissions}
                        </span>
                      )}
                    </div>

                    {status?.error && !status?.incompatible && (
                      <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-md p-2">
                        {t.plugins.statusRuntimeError}: {status.error}
                      </div>
                    )}
                    {status?.incompatible && status?.reason && (
                      <div className="text-xs text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded-md p-2">
                        {t.plugins.statusIncompatible}: {status.reason}
                        {status.error_detail?.field ? (
                          <div className="mt-1 text-[11px] text-amber-700/80">
                            {t.plugins.labelField}: <code>{status.error_detail.field}</code>
                          </div>
                        ) : null}
                      </div>
                    )}
                    {enabled && status?.loaded && !status?.error && (
                      <div className="text-[11px] text-emerald-500">{t.plugins.statusLoaded}</div>
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
