import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  listPlugins,
  scaffoldWorkspaceExamplePlugin,
  scaffoldWorkspaceThemePlugin,
  scaffoldWorkspaceUiOverhaulPlugin,
  getWorkspacePluginDir,
} from "@/lib/tauri";
import type { PluginInfo, PluginRuntimeStatus } from "@/types/plugins";
import { pluginRuntime } from "@/services/plugins/runtime";
import { pluginStyleRuntime } from "@/services/plugins/styleRuntime";

interface PluginStoreState {
  plugins: PluginInfo[];
  enabledById: Record<string, boolean>;
  ribbonItemEnabledByKey: Record<string, boolean>;
  runtimeStatus: Record<string, PluginRuntimeStatus>;
  loading: boolean;
  error: string | null;
  workspacePluginDir: string | null;
  appearanceSafeMode: boolean;
  loadPlugins: (workspacePath?: string) => Promise<void>;
  reloadPlugins: (workspacePath?: string) => Promise<void>;
  setPluginEnabled: (pluginId: string, enabled: boolean, workspacePath?: string) => Promise<void>;
  setRibbonItemEnabled: (pluginId: string, itemId: string, enabled: boolean) => void;
  isRibbonItemEnabled: (pluginId: string, itemId: string, defaultEnabled?: boolean) => boolean;
  ensureWorkspacePluginDir: () => Promise<string>;
  scaffoldExamplePlugin: () => Promise<string>;
  scaffoldThemePlugin: () => Promise<string>;
  scaffoldUiOverhaulPlugin: () => Promise<string>;
  setAppearanceSafeMode: (enabled: boolean, workspacePath?: string) => Promise<void>;
  isolatePluginStyles: () => void;
}

const isAppearancePlugin = (permissions: string[]) =>
  permissions.some((perm) =>
    [
      "ui:*",
      "ui:decorate",
      "ui:theme",
      "editor:decorate",
      "workspace:panel",
      "workspace:tab",
    ].includes(perm),
  );

const DEFAULT_DISABLED_SAMPLE_PLUGIN_IDS = new Set<string>([
  "hello-lumina",
  "ui-overhaul-lab",
  "theme-oceanic",
]);

const toEffectiveEnabledById = (
  plugins: PluginInfo[],
  enabledById: Record<string, boolean>,
  appearanceSafeMode: boolean,
) => {
  const next = { ...enabledById };

  // Sample plugins should stay opt-in unless user explicitly toggles them.
  for (const plugin of plugins) {
    if (
      DEFAULT_DISABLED_SAMPLE_PLUGIN_IDS.has(plugin.id) &&
      !Object.prototype.hasOwnProperty.call(next, plugin.id)
    ) {
      next[plugin.id] = false;
    }
  }

  // Guardrail: non-builtin appearance plugins can override core theme tokens/colors.
  // They must be explicitly enabled by user action, even if manifest sets enabled_by_default=true.
  // This prevents "cold start unexpectedly changes dark theme tint" regressions.
  for (const plugin of plugins) {
    if (
      plugin.source !== "builtin" &&
      isAppearancePlugin(plugin.permissions || []) &&
      !Object.prototype.hasOwnProperty.call(next, plugin.id)
    ) {
      next[plugin.id] = false;
    }
  }

  if (!appearanceSafeMode) {
    return next;
  }
  for (const plugin of plugins) {
    if (isAppearancePlugin(plugin.permissions || [])) {
      next[plugin.id] = false;
    }
  }
  return next;
};

export const usePluginStore = create<PluginStoreState>()(
  persist(
    (set, get) => ({
      plugins: [],
      enabledById: {},
      ribbonItemEnabledByKey: {},
      runtimeStatus: {},
      loading: false,
      error: null,
      workspacePluginDir: null,
      appearanceSafeMode: false,

      loadPlugins: async (workspacePath?: string) => {
        set({ loading: true, error: null });
        try {
          const discovered = await listPlugins(workspacePath);
          const plugins = Array.isArray(discovered) ? discovered : [];
          const effectiveEnabledById = toEffectiveEnabledById(
            plugins,
            get().enabledById,
            get().appearanceSafeMode,
          );
          const runtimeStatus = await pluginRuntime.sync({
            plugins,
            workspacePath,
            enabledById: effectiveEnabledById,
          });
          set({ plugins, runtimeStatus, loading: false });
        } catch (err) {
          set({
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },

      reloadPlugins: async (workspacePath?: string) => {
        pluginRuntime.unloadAll();
        await get().loadPlugins(workspacePath);
      },

      setPluginEnabled: async (pluginId: string, enabled: boolean, workspacePath?: string) => {
        set((state) => ({
          enabledById: {
            ...state.enabledById,
            [pluginId]: enabled,
          },
        }));

        const plugins = get().plugins;
        const effectiveEnabledById = toEffectiveEnabledById(
          plugins,
          get().enabledById,
          get().appearanceSafeMode,
        );
        const runtimeStatus = await pluginRuntime.sync({
          plugins,
          workspacePath,
          enabledById: effectiveEnabledById,
        });
        set({ runtimeStatus });
      },

      setRibbonItemEnabled: (pluginId: string, itemId: string, enabled: boolean) => {
        const key = `${pluginId}:${itemId}`;
        set((state) => ({
          ribbonItemEnabledByKey: {
            ...state.ribbonItemEnabledByKey,
            [key]: enabled,
          },
        }));
      },

      isRibbonItemEnabled: (pluginId: string, itemId: string, defaultEnabled: boolean = true) => {
        const key = `${pluginId}:${itemId}`;
        const state = get();
        if (Object.prototype.hasOwnProperty.call(state.ribbonItemEnabledByKey, key)) {
          return Boolean(state.ribbonItemEnabledByKey[key]);
        }
        return defaultEnabled;
      },

      ensureWorkspacePluginDir: async () => {
        const dir = await getWorkspacePluginDir();
        set({ workspacePluginDir: dir });
        return dir;
      },

      scaffoldExamplePlugin: async () => {
        const dir = await scaffoldWorkspaceExamplePlugin();
        await get().loadPlugins();
        return dir;
      },
      scaffoldThemePlugin: async () => {
        const dir = await scaffoldWorkspaceThemePlugin();
        await get().loadPlugins();
        return dir;
      },
      scaffoldUiOverhaulPlugin: async () => {
        const dir = await scaffoldWorkspaceUiOverhaulPlugin();
        await get().loadPlugins();
        return dir;
      },
      setAppearanceSafeMode: async (enabled: boolean, workspacePath?: string) => {
        set({ appearanceSafeMode: enabled });
        if (enabled) {
          pluginStyleRuntime.clearAll();
        }
        await get().loadPlugins(workspacePath);
      },
      isolatePluginStyles: () => {
        pluginStyleRuntime.clearAll();
      },
    }),
    {
      name: "lumina-plugins",
      partialize: (state) => ({
        enabledById: state.enabledById,
        ribbonItemEnabledByKey: state.ribbonItemEnabledByKey,
        appearanceSafeMode: state.appearanceSafeMode,
      }),
    }
  )
);
