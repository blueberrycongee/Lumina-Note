import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { usePluginStore } from "@/stores/usePluginStore";
import { useFileStore } from "@/stores/useFileStore";
import { useBrowserStore } from "@/stores/useBrowserStore";

interface InstalledPluginsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SOURCE_ORDER = ["workspace", "user", "builtin"];
const isAppearancePlugin = (permissions: string[]) =>
  permissions.some((perm) =>
    ["ui:*", "ui:decorate", "ui:theme", "editor:decorate", "workspace:panel", "workspace:tab"].includes(
      perm,
    ),
  );

export function InstalledPluginsModal({ isOpen, onClose }: InstalledPluginsModalProps) {
  const { vaultPath } = useFileStore();
  const { hideAllWebViews, showAllWebViews } = useBrowserStore();
  const {
    plugins,
    enabledById,
    runtimeStatus,
    loading,
    error,
    loadPlugins,
    setPluginEnabled,
    appearanceSafeMode,
    setAppearanceSafeMode,
  } = usePluginStore();

  const grouped = useMemo(() => {
    const groups: Record<string, typeof plugins> = {};
    for (const plugin of plugins) {
      const source = plugin.source || "unknown";
      if (!groups[source]) groups[source] = [];
      groups[source].push(plugin);
    }
    return groups;
  }, [plugins]);

  useEffect(() => {
    if (!isOpen) return;
    hideAllWebViews();
    return () => {
      showAllWebViews();
    };
  }, [hideAllWebViews, isOpen, showAllWebViews]);

  useEffect(() => {
    if (!isOpen) return;
    void loadPlugins(vaultPath || undefined);
  }, [isOpen, loadPlugins, vaultPath]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

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

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-[720px] max-h-[80vh] rounded-xl shadow-2xl overflow-hidden border border-border bg-background/95">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/50">
          <h2 className="text-lg font-semibold text-foreground/90">Plugins</h2>
          <button onClick={onClose} className="p-2 rounded-full transition-colors hover:bg-muted">
            <X size={18} className="text-foreground/70" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto max-h-[calc(80vh-60px)]">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Installed plugins from workspace, user directory, and built-in resources.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => loadPlugins(vaultPath || undefined)}
                disabled={loading}
                className="h-8 px-3 rounded-lg text-xs font-medium border border-border bg-background/60 hover:bg-muted disabled:opacity-50"
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          {appearanceSafeMode && (
            <div className="text-xs text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded-md p-2 flex items-center justify-between gap-3">
              <span>
                Appearance Safe Mode is ON. UI/theme/editor decoration plugins are blocked and may look like they only flash once.
              </span>
              <button
                type="button"
                onClick={() => setAppearanceSafeMode(false, vaultPath || undefined)}
                className="h-7 px-2 rounded-md border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 whitespace-nowrap"
              >
                Turn Off Safe Mode
              </button>
            </div>
          )}

          {error && (
            <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-md p-2">
              {error}
            </div>
          )}

          {!loading && plugins.length === 0 && (
            <div className="text-xs text-muted-foreground border border-border rounded-lg p-3">
              No plugins installed yet.
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
                    const blockedBySafeMode =
                      appearanceSafeMode && isAppearancePlugin(plugin.permissions || []);
                    return (
                      <div
                        key={`${plugin.source}:${plugin.id}`}
                        className="border border-border rounded-lg p-3 bg-background/60 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{plugin.name}</p>
                            <p className="text-xs text-muted-foreground">{plugin.id} · v{plugin.version}</p>
                            {plugin.description ? (
                              <p className="text-xs text-muted-foreground mt-1">{plugin.description}</p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setPluginEnabled(plugin.id, !enabled, vaultPath || undefined)
                            }
                            disabled={blockedBySafeMode}
                            className={`h-8 px-3 rounded-lg text-xs font-medium border transition-colors ${
                              enabled
                                ? "bg-primary text-primary-foreground border-primary/40 hover:bg-primary/90"
                                : "bg-background/60 border-border hover:bg-muted"
                            } ${blockedBySafeMode ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            {blockedBySafeMode ? "Blocked by Safe Mode" : enabled ? "Enabled" : "Disabled"}
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
                            <span className="text-[10px] text-muted-foreground">
                              No permissions declared
                            </span>
                          )}
                        </div>

                        {status?.error && !status?.incompatible && (
                          <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-md p-2">
                            Runtime error: {status.error}
                          </div>
                        )}
                        {status?.incompatible && status?.reason && (
                          <div className="text-xs text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded-md p-2">
                            Incompatible: {status.reason}
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
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
