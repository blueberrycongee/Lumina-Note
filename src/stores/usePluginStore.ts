import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  listPlugins,
  scaffoldWorkspaceExamplePlugin,
  getWorkspacePluginDir,
} from "@/lib/tauri";
import type { PluginInfo, PluginRuntimeStatus } from "@/types/plugins";
import { pluginRuntime } from "@/services/plugins/runtime";

interface PluginStoreState {
  plugins: PluginInfo[];
  enabledById: Record<string, boolean>;
  runtimeStatus: Record<string, PluginRuntimeStatus>;
  loading: boolean;
  error: string | null;
  workspacePluginDir: string | null;
  loadPlugins: (workspacePath?: string) => Promise<void>;
  reloadPlugins: (workspacePath?: string) => Promise<void>;
  setPluginEnabled: (pluginId: string, enabled: boolean, workspacePath?: string) => Promise<void>;
  ensureWorkspacePluginDir: (workspacePath: string) => Promise<string>;
  scaffoldExamplePlugin: (workspacePath: string) => Promise<string>;
}

export const usePluginStore = create<PluginStoreState>()(
  persist(
    (set, get) => ({
      plugins: [],
      enabledById: {},
      runtimeStatus: {},
      loading: false,
      error: null,
      workspacePluginDir: null,

      loadPlugins: async (workspacePath?: string) => {
        set({ loading: true, error: null });
        try {
          const discovered = await listPlugins(workspacePath);
          const plugins = Array.isArray(discovered) ? discovered : [];
          const runtimeStatus = await pluginRuntime.sync({
            plugins,
            workspacePath,
            enabledById: get().enabledById,
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
        const runtimeStatus = await pluginRuntime.sync({
          plugins,
          workspacePath,
          enabledById: get().enabledById,
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
    }),
    {
      name: "lumina-plugins",
      partialize: (state) => ({
        enabledById: state.enabledById,
      }),
    }
  )
);
