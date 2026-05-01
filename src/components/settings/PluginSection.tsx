import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  FolderOpen,
  Info,
  RefreshCw,
  Search,
  Shield,
} from "lucide-react";
import { TextInput, Toggle } from "@/components/ui";
import { usePluginStore, categorizePlugin } from "@/stores/usePluginStore";
import {
  usePluginUiStore,
  type PluginRibbonItem,
} from "@/stores/usePluginUiStore";
import { useFileStore } from "@/stores/useFileStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { showInExplorer } from "@/lib/host";
import { cn } from "@/lib/utils";
import type { PluginInfo, PluginRuntimeStatus } from "@/types/plugins";
import { getPluginDisplay } from "./pluginDisplay";

export function PluginSection() {
  const { locale, t } = useLocaleStore();
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
  const [query, setQuery] = useState("");
  const [expandedPluginId, setExpandedPluginId] = useState<string | null>(null);

  const isEnabled = (pluginId: string, fallback: boolean) => {
    if (Object.prototype.hasOwnProperty.call(enabledById, pluginId)) {
      return Boolean(enabledById[pluginId]);
    }
    return fallback;
  };

  const visiblePlugins = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return plugins
      .filter((plugin) => {
        if (!normalizedQuery) return true;
        const display = getPluginDisplay(plugin, locale);
        return [
          display.name,
          plugin.id,
          display.description,
          plugin.author,
          plugin.source,
          ...plugin.permissions,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(normalizedQuery),
          );
      })
      .sort((a, b) => {
        const issueDelta =
          Number(hasPluginIssue(b, runtimeStatus[b.id])) -
          Number(hasPluginIssue(a, runtimeStatus[a.id]));
        if (issueDelta !== 0) return issueDelta;
        return getPluginDisplay(a, locale).name.localeCompare(
          getPluginDisplay(b, locale).name,
        );
      });
  }, [locale, plugins, query, runtimeStatus]);

  const affectedBySafeMode = useMemo(() => {
    if (!appearanceSafeMode) return [];
    return plugins.filter(
      (plugin) => categorizePlugin(plugin) === "appearance",
    );
  }, [appearanceSafeMode, plugins]);

  const showDeveloperTools = import.meta.env.DEV;

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
    <section className="bg-popover px-8 py-6">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.plugins.searchPlugins}
            className="h-10 bg-popover pl-9 text-sm"
          />
        </div>
        <IconButton
          onClick={() => loadPlugins(vaultPath || undefined)}
          disabled={loading}
          label={t.plugins.refreshListHint}
        >
          <RefreshCw size={17} className={cn(loading && "animate-spin")} />
        </IconButton>
        <IconButton
          onClick={handleOpenWorkspacePluginDir}
          disabled={busyAction === "open-dir"}
          label={t.plugins.openWorkspaceFolderHint}
        >
          <FolderOpen size={17} />
        </IconButton>
      </div>

      {error ? (
        <div className="mt-4 rounded-ui-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      <div className="mt-5 divide-y divide-border/60">
        {!loading && plugins.length === 0 ? (
          <EmptyMessage>{t.plugins.noPluginsFound}</EmptyMessage>
        ) : null}

        {plugins.length > 0 && visiblePlugins.length === 0 ? (
          <EmptyMessage>{t.plugins.noPluginsMatch}</EmptyMessage>
        ) : null}

        {visiblePlugins.map((plugin) => {
          const display = getPluginDisplay(plugin, locale);
          const enabled = isEnabled(plugin.id, plugin.enabled_by_default);
          const status = runtimeStatus[plugin.id];
          const pluginRibbonItems = ribbonItems
            .filter((item) => item.pluginId === plugin.id)
            .sort((a, b) => a.order - b.order);
          const expanded = expandedPluginId === plugin.id;

          return (
            <PluginRow
              key={`${plugin.source}:${plugin.id}`}
              plugin={plugin}
              displayName={display.name}
              displayDescription={display.description}
              enabled={enabled}
              expanded={expanded}
              status={status}
              ribbonItems={pluginRibbonItems}
              onToggleDetails={() =>
                setExpandedPluginId(expanded ? null : plugin.id)
              }
              onEnabledChange={(next) =>
                setPluginEnabled(plugin.id, next, vaultPath || undefined)
              }
              isRibbonItemEnabled={(item) =>
                isRibbonItemEnabled(
                  plugin.id,
                  item.itemId,
                  item.defaultEnabled ?? true,
                )
              }
              onRibbonItemEnabledChange={(item, next) =>
                setRibbonItemEnabled(plugin.id, item.itemId, next)
              }
            />
          );
        })}
      </div>

      {showDeveloperTools ? (
        <details className="group mt-6 text-xs">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground">
            <ChevronDown
              size={13}
              className="-rotate-90 transition-transform group-open:rotate-0"
              aria-hidden="true"
            />
            {t.plugins.developerTools}
          </summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-1.5">
              <div className="flex items-center gap-3">
                <Shield size={14} className="text-muted-foreground" />
                <span className="flex-1 text-foreground">
                  {appearanceSafeMode
                    ? t.plugins.safeModeOn
                    : t.plugins.safeModeOff}
                </span>
                <Toggle
                  checked={appearanceSafeMode}
                  onChange={(next) =>
                    setAppearanceSafeMode(next, vaultPath || undefined)
                  }
                  label={
                    appearanceSafeMode
                      ? t.plugins.safeModeOn
                      : t.plugins.safeModeOff
                  }
                />
              </div>
              {appearanceSafeMode ? (
                <div className="pl-6 text-warning">
                  {t.plugins.safeModeAffected.replace(
                    "{count}",
                    String(affectedBySafeMode.length),
                  )}
                </div>
              ) : null}
            </div>
            <div className="space-y-1">
              <SidebarAction
                onClick={() => reloadPlugins(vaultPath || undefined)}
                disabled={loading}
              >
                {t.plugins.reloadRuntime}
              </SidebarAction>
              <SidebarAction onClick={() => isolatePluginStyles()}>
                {t.plugins.unloadStyles}
              </SidebarAction>
              <SidebarAction
                onClick={handleScaffoldTheme}
                disabled={busyAction === "scaffold-theme"}
              >
                {t.plugins.scaffoldTheme}
              </SidebarAction>
              {workspacePluginDir ? (
                <div className="break-all px-2 pt-1 text-xs text-muted-foreground">
                  {workspacePluginDir}
                </div>
              ) : null}
            </div>
          </div>
        </details>
      ) : null}
    </section>
  );
}

function PluginRow({
  plugin,
  displayName,
  displayDescription,
  enabled,
  expanded,
  status,
  ribbonItems,
  onToggleDetails,
  onEnabledChange,
  isRibbonItemEnabled,
  onRibbonItemEnabledChange,
}: {
  plugin: PluginInfo;
  displayName: string;
  displayDescription?: string;
  enabled: boolean;
  expanded: boolean;
  status?: PluginRuntimeStatus;
  ribbonItems: PluginRibbonItem[];
  onToggleDetails: () => void;
  onEnabledChange: (enabled: boolean) => void;
  isRibbonItemEnabled: (item: PluginRibbonItem) => boolean;
  onRibbonItemEnabledChange: (item: PluginRibbonItem, enabled: boolean) => void;
}) {
  const { t } = useLocaleStore();
  const hasIssue = hasPluginIssue(plugin, status);

  return (
    <div className="py-4">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-medium text-foreground">
              {displayName}
            </h3>
            <span className="shrink-0 text-xs text-muted-foreground">
              v{plugin.version}
            </span>
            {hasIssue ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs text-warning">
                <AlertTriangle size={12} />
                {status?.incompatible
                  ? t.plugins.statusIncompatible
                  : t.plugins.filterIssues}
              </span>
            ) : null}
          </div>
          {displayDescription ? (
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {displayDescription}
            </p>
          ) : null}
        </div>

        <IconButton
          onClick={onToggleDetails}
          label={t.plugins.techDetails}
          selected={expanded}
        >
          <Info size={16} />
        </IconButton>
        <Toggle
          checked={enabled}
          onChange={onEnabledChange}
          label={`${displayName} ${enabled ? t.plugins.statusEnabled : t.plugins.statusDisabled}`}
        />
      </div>

      {expanded ? (
        <div className="mt-3 ml-0 space-y-3 text-xs text-muted-foreground">
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <Detail label={t.plugins.labelId} value={plugin.id} />
            <Detail
              label={t.plugins.labelApi}
              value={plugin.api_version || "1"}
            />
            {plugin.min_app_version ? (
              <Detail
                label={t.plugins.labelMinApp}
                value={plugin.min_app_version}
              />
            ) : null}
            <Detail
              label={t.plugins.labelEntry}
              value={plugin.entry_path}
              wide
            />
          </div>

          {(plugin.permissions || []).length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {plugin.permissions.map((perm) => (
                <span
                  key={perm}
                  className="rounded-ui-sm bg-muted px-1.5 py-0.5 font-mono"
                >
                  {perm}
                </span>
              ))}
            </div>
          ) : null}

          {ribbonItems.length > 0 ? (
            <div className="space-y-1.5">
              <div className="font-medium text-foreground">
                {t.plugins.ribbonItemsSection}
              </div>
              {ribbonItems.map((item) => {
                const itemEnabled = isRibbonItemEnabled(item);
                return (
                  <div
                    key={`${item.pluginId}:${item.itemId}`}
                    className="flex items-center gap-3"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {item.title}
                    </span>
                    <Toggle
                      checked={itemEnabled}
                      onChange={(next) => onRibbonItemEnabledChange(item, next)}
                      label={`${item.title} ${itemEnabled ? t.plugins.statusEnabled : t.plugins.statusDisabled}`}
                    />
                  </div>
                );
              })}
            </div>
          ) : null}

          {status?.error && !status?.incompatible ? (
            <div className="text-destructive">
              {t.plugins.statusRuntimeError}: {status.error}
            </div>
          ) : null}
          {status?.incompatible && status?.reason ? (
            <div className="text-warning">
              {t.plugins.statusIncompatible}: {status.reason}
            </div>
          ) : null}
          {plugin.validation_error ? (
            <div className="text-destructive">
              {plugin.validation_error.message}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Detail({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={cn("min-w-0", wide && "sm:col-span-2")}>
      <span className="text-muted-foreground">{label}: </span>
      <span className="break-all font-mono text-foreground/75">{value}</span>
    </div>
  );
}

function SidebarAction({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="block w-full truncate rounded-ui-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function IconButton({
  children,
  disabled,
  label,
  selected,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-ui-md text-muted-foreground",
        "transition-colors duration-fast ease-out-subtle hover:bg-foreground/5 hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
        selected && "bg-accent text-foreground",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      {children}
    </button>
  );
}

function EmptyMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function hasPluginIssue(plugin: PluginInfo, status?: PluginRuntimeStatus) {
  return Boolean(
    plugin.validation_error || status?.error || status?.incompatible,
  );
}
