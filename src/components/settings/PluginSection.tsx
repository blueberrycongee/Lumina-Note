import { useMemo, useState } from "react";
import { usePluginStore, categorizePlugin, type PluginCategory } from "@/stores/usePluginStore";
import { usePluginUiStore } from "@/stores/usePluginUiStore";
import { useFileStore } from "@/stores/useFileStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { showInExplorer } from "@/lib/tauri";

const SOURCE_ORDER = ["global", "workspace", "user", "builtin"];

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
    setRibbonItemEnabled,
    isRibbonItemEnabled,
    ensureWorkspacePluginDir,
    scaffoldThemePlugin,
    appearanceSafeMode,
    setAppearanceSafeMode,
    isolatePluginStyles,
  } = usePluginStore();
  const ribbonItems = usePluginUiStore((state) => state.ribbonItems);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<PluginCategory | 'all'>('all');

  const grouped = useMemo(() => {
    const groups: Record<string, typeof plugins> = {};
    for (const plugin of plugins) {
      const source = plugin.source || "unknown";
      if (!groups[source]) groups[source] = [];
      groups[source].push(plugin);
    }
    return groups;
  }, [plugins]);

  const categorized = useMemo(() => {
    const categories: Record<PluginCategory, typeof plugins> = {
      functional: [],
      appearance: [],
      system: [],
    };
    for (const plugin of plugins) {
      const category = categorizePlugin(plugin);
      categories[category].push(plugin);
    }
    return categories;
  }, [plugins]);

  const sourceLabel = (source: string) => {
    if (source === "global") return t.plugins.sourceGlobal;
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
    try {
      setBusyAction("open-dir");
      const dir = await ensureWorkspacePluginDir();
      await showInExplorer(dir);
    } finally {
      setBusyAction(null);
    }
  };

  const handleScaffoldTheme = async () => {
    try {
      setBusyAction("scaffold-theme");
      const dir = await scaffoldThemePlugin();
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

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAppearanceSafeMode(!appearanceSafeMode, vaultPath || undefined)}
            title={t.plugins.safeModeHint}
            className={`h-9 px-3 rounded-lg text-sm font-medium border ${
              appearanceSafeMode
                ? "bg-warning/20 text-warning border-warning/40"
                : "border-border bg-background/60 hover:bg-muted"
            }`}
          >
            {appearanceSafeMode ? t.plugins.safeModeOn : t.plugins.safeModeOff}
          </button>
          <button
            type="button"
            onClick={() => isolatePluginStyles()}
            title={t.plugins.unloadStylesHint}
            className="h-9 px-3 rounded-lg text-sm font-medium border border-border bg-background/60 hover:bg-muted"
          >
            {t.plugins.unloadStyles}
          </button>
          <button
            type="button"
            onClick={() => loadPlugins(vaultPath || undefined)}
            disabled={loading}
            title={t.plugins.refreshListHint}
            className="h-9 px-3 rounded-lg text-sm font-medium border border-border bg-background/60 hover:bg-muted disabled:opacity-50"
          >
            {loading ? t.plugins.refreshing : t.plugins.refreshList}
          </button>
          <button
            type="button"
            onClick={() => reloadPlugins(vaultPath || undefined)}
            disabled={loading}
            title={t.plugins.reloadRuntimeHint}
            className="h-9 px-3 rounded-lg text-sm font-medium border border-border bg-background/60 hover:bg-muted disabled:opacity-50"
          >
            {t.plugins.reloadRuntime}
          </button>
          <button
            type="button"
            onClick={handleOpenWorkspacePluginDir}
            disabled={busyAction === "open-dir"}
            title={t.plugins.openWorkspaceFolderHint}
            className="h-9 px-3 rounded-lg text-sm font-medium border border-border bg-background/60 hover:bg-muted disabled:opacity-50"
          >
            {t.plugins.openWorkspaceFolder}
          </button>
          <button
            type="button"
            onClick={handleScaffoldTheme}
            disabled={busyAction === "scaffold-theme"}
            title={t.plugins.scaffoldTheme}
            className="h-9 px-3 rounded-lg text-sm font-medium border border-border bg-background/60 hover:bg-muted disabled:opacity-50"
          >
            {t.plugins.scaffoldTheme}
          </button>
        </div>
        
        {appearanceSafeMode && (
          <div className="text-xs text-muted-foreground bg-muted/30 border border-border rounded-md px-2 py-1.5">
            {t.plugins.safeModeHint}
          </div>
        )}
      </div>

      {/* 分类筛选 */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveCategory('all')}
          className={`h-8 px-3 rounded-lg text-xs font-medium border transition-colors ${
            activeCategory === 'all'
              ? "bg-primary text-primary-foreground border-primary/40"
              : "border-border bg-background/60 hover:bg-muted"
          }`}
        >
          全部 ({plugins.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveCategory('functional')}
          className={`h-8 px-3 rounded-lg text-xs font-medium border transition-colors ${
            activeCategory === 'functional'
              ? "bg-primary text-primary-foreground border-primary/40"
              : "border-border bg-background/60 hover:bg-muted"
          }`}
        >
          🔌 {t.plugins.categoryFunctional} ({categorized.functional.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveCategory('appearance')}
          className={`h-8 px-3 rounded-lg text-xs font-medium border transition-colors ${
            activeCategory === 'appearance'
              ? "bg-primary text-primary-foreground border-primary/40"
              : "border-border bg-background/60 hover:bg-muted"
          }`}
        >
          🎨 {t.plugins.categoryAppearance} ({categorized.appearance.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveCategory('system')}
          className={`h-8 px-3 rounded-lg text-xs font-medium border transition-colors ${
            activeCategory === 'system'
              ? "bg-primary text-primary-foreground border-primary/40"
              : "border-border bg-background/60 hover:bg-muted"
          }`}
        >
          ⚙️ {t.plugins.categorySystem} ({categorized.system.length})
        </button>
      </div>

      {workspacePluginDir && (
        <p className="text-xs text-muted-foreground break-all">
          {t.plugins.workspaceDirLabel}: <code>{workspacePluginDir}</code>
        </p>
      )}

      {error && (
        <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-2">{error}</div>
      )}

      {!loading && plugins.length === 0 && (
        <div className="text-xs text-muted-foreground border border-border rounded-lg p-3">
          {t.plugins.noPluginsFound}
        </div>
      )}

      {/* 按分类显示插件 */}
      {activeCategory === 'all' && SOURCE_ORDER.map((source) => {
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
                const pluginRibbonItems = ribbonItems
                  .filter((item) => item.pluginId === plugin.id)
                  .sort((a, b) => a.order - b.order);
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

                    <details className="space-y-2">
                      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                        {t.plugins.techDetails}
                      </summary>
                      <div className="space-y-2 text-[11px] text-muted-foreground">
                        <div className="break-all">
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
                      </div>
                    </details>

                    {pluginRibbonItems.length > 0 && (
                      <div className="space-y-1 rounded-md border border-border/70 bg-muted/20 p-2">
                        {pluginRibbonItems.map((item) => {
                          const itemEnabled = isRibbonItemEnabled(
                            plugin.id,
                            item.itemId,
                            item.defaultEnabled ?? true,
                          );
                          return (
                            <div
                              key={`${item.pluginId}:${item.itemId}`}
                              className="flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0">
                                <div className="truncate text-foreground">{item.title}</div>
                                <div className="truncate text-muted-foreground">{item.itemId}</div>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setRibbonItemEnabled(plugin.id, item.itemId, !itemEnabled)
                                }
                                className={`h-7 px-2 rounded-md text-[11px] font-medium border transition-colors ${
                                  itemEnabled
                                    ? "bg-primary text-primary-foreground border-primary/40 hover:bg-primary/90"
                                    : "bg-background/60 border-border hover:bg-muted"
                                }`}
                              >
                                {itemEnabled ? t.plugins.statusEnabled : t.plugins.statusDisabled}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {status?.error && !status?.incompatible && (
                      <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-2">
                        {t.plugins.statusRuntimeError}: {status.error}
                      </div>
                    )}
                    {status?.incompatible && status?.reason && (
                      <div className="text-xs text-warning bg-warning/10 border border-warning/30 rounded-md p-2">
                        {t.plugins.statusIncompatible}: {status.reason}
                        {status.error_detail?.field ? (
                          <div className="mt-1 text-[11px] text-warning/80">
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

      {activeCategory !== 'all' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-foreground">
            <span>
              {activeCategory === 'functional' && '🔌 '}{t.plugins.categoryFunctional}
              {activeCategory === 'appearance' && '🎨 '}{t.plugins.categoryAppearance}
              {activeCategory === 'system' && '⚙️ '}{t.plugins.categorySystem}
            </span>
            <span className="text-muted-foreground">
              {categorized[activeCategory].length}
            </span>
          </div>
          <div className="space-y-2">
            {categorized[activeCategory].map((plugin) => {
              const enabled = isEnabled(plugin.id, plugin.enabled_by_default);
              const status = runtimeStatus[plugin.id];
              const pluginRibbonItems = ribbonItems
                .filter((item) => item.pluginId === plugin.id)
                .sort((a, b) => a.order - b.order);
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

                  <details className="space-y-2">
                    <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                      {t.plugins.techDetails}
                    </summary>
                    <div className="space-y-2 text-[11px] text-muted-foreground">
                      <div className="break-all">
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
                    </div>
                  </details>

                  {pluginRibbonItems.length > 0 && (
                    <div className="space-y-1 rounded-md border border-border/70 bg-muted/20 p-2">
                      {pluginRibbonItems.map((item) => {
                        const itemEnabled = isRibbonItemEnabled(
                          plugin.id,
                          item.itemId,
                          item.defaultEnabled ?? true,
                        );
                        return (
                          <div
                            key={`${item.pluginId}:${item.itemId}`}
                            className="flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-foreground">{item.title}</div>
                              <div className="truncate text-muted-foreground">{item.itemId}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setRibbonItemEnabled(plugin.id, item.itemId, !itemEnabled)
                              }
                              className={`h-7 px-2 rounded-md text-[11px] font-medium border transition-colors ${
                                itemEnabled
                                  ? "bg-primary text-primary-foreground border-primary/40 hover:bg-primary/90"
                                  : "bg-background/60 border-border hover:bg-muted"
                              }`}
                            >
                              {itemEnabled ? t.plugins.statusEnabled : t.plugins.statusDisabled}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {status?.error && !status?.incompatible && (
                    <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-2">
                      {t.plugins.statusRuntimeError}: {status.error}
                    </div>
                  )}
                  {status?.incompatible && status?.reason && (
                    <div className="text-xs text-warning bg-warning/10 border border-warning/30 rounded-md p-2">
                      {t.plugins.statusIncompatible}: {status.reason}
                      {status.error_detail?.field ? (
                        <div className="mt-1 text-[11px] text-warning/80">
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
      )}
    </section>
  );
}
