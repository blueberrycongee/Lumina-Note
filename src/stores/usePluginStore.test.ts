import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginInfo } from "@/types/plugins";

const listPluginsMock = vi.hoisted(() => vi.fn<[], Promise<PluginInfo[]>>());
const syncMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tauri", () => ({
  listPlugins: listPluginsMock,
  scaffoldWorkspaceExamplePlugin: vi.fn(),
  scaffoldWorkspaceThemePlugin: vi.fn(),
  scaffoldWorkspaceUiOverhaulPlugin: vi.fn(),
  getWorkspacePluginDir: vi.fn(),
}));

vi.mock("@/services/plugins/runtime", () => ({
  pluginRuntime: {
    sync: syncMock,
    unloadAll: vi.fn(),
  },
}));

vi.mock("@/services/plugins/styleRuntime", () => ({
  pluginStyleRuntime: {
    clearAll: vi.fn(),
  },
}));

import { usePluginStore } from "./usePluginStore";

const workspaceThemePlugin: PluginInfo = {
  id: "theme-oceanic",
  name: "Theme Oceanic",
  version: "0.1.0",
  entry: "index.js",
  permissions: ["ui:theme", "ui:decorate"],
  enabled_by_default: true,
  source: "workspace",
  root_path: "/tmp/workspace/.lumina/plugins/theme-oceanic",
  entry_path: "/tmp/workspace/.lumina/plugins/theme-oceanic/index.js",
  validation_error: null,
  theme: null,
};

describe("usePluginStore", () => {
  beforeEach(() => {
    listPluginsMock.mockReset();
    syncMock.mockReset();
    syncMock.mockResolvedValue({});

    usePluginStore.setState({
      plugins: [],
      enabledById: {},
      runtimeStatus: {},
      loading: false,
      error: null,
      workspacePluginDir: null,
      appearanceSafeMode: false,
    });
  });

  it("disables non-builtin appearance plugins by default on first load", async () => {
    listPluginsMock.mockResolvedValue([workspaceThemePlugin]);

    await usePluginStore.getState().loadPlugins("/tmp/workspace");

    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(syncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enabledById: expect.objectContaining({
          "theme-oceanic": false,
        }),
      }),
    );
  });

  it("keeps explicit user enable for appearance plugin", async () => {
    listPluginsMock.mockResolvedValue([workspaceThemePlugin]);
    usePluginStore.setState({
      enabledById: {
        "theme-oceanic": true,
      },
    });

    await usePluginStore.getState().loadPlugins("/tmp/workspace");

    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(syncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enabledById: expect.objectContaining({
          "theme-oceanic": true,
        }),
      }),
    );
  });
});
