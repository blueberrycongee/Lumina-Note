import { useEffect, useMemo, useState } from "react";
import { useLocaleStore } from "@/stores/useLocaleStore";
import {
  pluginStyleRuntime,
  PLUGIN_STYLE_RUNTIME_EVENT,
  type PluginStyleConflict,
  type PluginStyleEntry,
} from "@/services/plugins/styleRuntime";

export function PluginStyleDevSection() {
  const { t } = useLocaleStore();
  const [entries, setEntries] = useState<PluginStyleEntry[]>(() => pluginStyleRuntime.listEntries());
  const [conflicts, setConflicts] = useState<PluginStyleConflict[]>(() => pluginStyleRuntime.listConflicts());

  useEffect(() => {
    const sync = () => {
      setEntries(pluginStyleRuntime.listEntries());
      setConflicts(pluginStyleRuntime.listConflicts());
    };
    window.addEventListener(PLUGIN_STYLE_RUNTIME_EVENT, sync);
    return () => window.removeEventListener(PLUGIN_STYLE_RUNTIME_EVENT, sync);
  }, []);

  const byPlugin = useMemo(() => {
    const map = new Map<string, PluginStyleEntry[]>();
    for (const entry of entries) {
      const list = map.get(entry.pluginId) || [];
      list.push(entry);
      map.set(entry.pluginId, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [entries]);

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        {t.plugins.styleRuntimeTitle}
      </h3>
      <div className="text-xs text-muted-foreground">
        {t.plugins.styleRuntimeLayerOrder}: <code>base</code> &lt; <code>theme</code> &lt;{" "}
        <code>component</code> &lt; <code>override</code>
      </div>

      <div className="border border-border rounded-lg p-3 bg-background/60 space-y-2">
        <div className="text-xs font-medium">
          {t.plugins.styleRuntimeConflicts} ({conflicts.length})
        </div>
        {conflicts.length === 0 ? (
          <div className="text-xs text-muted-foreground">{t.plugins.styleRuntimeNoConflicts}</div>
        ) : (
          <div className="space-y-2 max-h-36 overflow-auto">
            {conflicts.slice(0, 20).map((item) => (
              <div key={item.selector} className="text-[11px] border border-border/60 rounded px-2 py-1 bg-muted/30">
                <div className="font-mono break-all">{item.selector}</div>
                <div className="text-muted-foreground mt-1">
                  {t.plugins.styleRuntimePlugins}: {item.pluginIds.join(", ")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border border-border rounded-lg p-3 bg-background/60 space-y-2">
        <div className="text-xs font-medium">
          {t.plugins.styleRuntimeInjected} ({entries.length})
        </div>
        {byPlugin.length === 0 ? (
          <div className="text-xs text-muted-foreground">{t.plugins.styleRuntimeNoInjected}</div>
        ) : (
          <div className="space-y-2 max-h-48 overflow-auto">
            {byPlugin.map(([pluginId, list]) => (
              <div key={pluginId} className="text-[11px] border border-border/60 rounded px-2 py-1 bg-muted/30">
                <div className="font-medium">{pluginId}</div>
                <div className="text-muted-foreground mt-1">
                  {list
                    .map((entry) => `${entry.layer}${entry.scopeId ? `:${entry.scopeId}` : ""}`)
                    .join(" · ")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
