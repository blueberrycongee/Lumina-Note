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
  runtimeStatus: Record<string, PluginRuntimeStatus>;
  loading: boolean;
  error: string | null;
  workspacePluginDir: string | null;
  appearanceSafeMode: boolean;
  loadPlugins: (workspacePath?: string) => Promise<void>;
  reloadPlugins: (workspacePath?: string) => Promise<void>;
  setPluginEnabled: (pluginId: string, enabled: boolean, workspacePath?: string) => Promise<void>;
  ensureWorkspacePluginDir: (workspacePath: string) => Promise<string>;
  scaffoldExamplePlugin: (workspacePath: string) => Promise<string>;
  scaffoldThemePlugin: (workspacePath: string) => Promise<string>;
  scaffoldUiOverhaulPlugin: (workspacePath: string) => Promise<string>;
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

const toEffectiveEnabledById = (
  plugins: PluginInfo[],
  enabledById: Record<string, boolean>,
  appearanceSafeMode: boolean,
) => {
  if (!appearanceSafeMode) {
    return { ...enabledById };
  }
  const next = { ...enabledById };
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

      ensureWorkspacePluginDir: async (workspacePath: string) => {
        const dir = await getWorkspacePluginDir(workspacePath);
        set({ workspacePluginDir: dir });
        return dir;
      },

      scaffoldExamplePlugin: async (workspacePath: string) => {
        const dir = await scaffoldWorkspaceExamplePlugin(workspacePath);
        await get().loadPlugins(workspacePath);
        return dir;
      },
      scaffoldThemePlugin: async (workspacePath: string) => {
        const dir = await scaffoldWorkspaceThemePlugin(workspacePath);
        await get().loadPlugins(workspacePath);
        return dir;
      },
      scaffoldUiOverhaulPlugin: async (workspacePath: string) => {
        const dir = await scaffoldWorkspaceUiOverhaulPlugin(workspacePath);
        await get().loadPlugins(workspacePath);
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
        appearanceSafeMode: state.appearanceSafeMode,
      }),
    }
  )
);
