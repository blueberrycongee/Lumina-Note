// MUST be first: sets XDG env vars so opencode's global/index.ts picks
// an isolated base path instead of ~/.config/opencode / ~/.opencode.
// Any import below that transitively loads virtual:opencode-server would
// freeze the paths before we get a chance to redirect them.
import "./agent-v2/opencode-xdg.js";

import { app, BrowserWindow, Menu } from "electron";
import path from "path";

// Force overlay scrollbars so custom ::-webkit-scrollbar CSS does not
// push content left (classic mode). The scrollbar paints on top instead.
app.commandLine.appendSwitch("enable-features", "OverlayScrollbar");
import { registerIpcHandlers } from "./ipc.js";
import { installMainLogForwarding } from "./log-forward.js";
import { registerOpencodeIpc } from "./agent-v2/ipc.js";
import {
  getOpencodeServer,
  restartOpencodeServer,
  startOpencodeServer,
  stopOpencodeServer,
} from "./agent-v2/server.js";
import {
  applyOpencodeBridge,
  buildOpencodeBridge,
} from "./agent-v2/provider-bridge.js";
import { storeHandlers } from "./handlers/store.js";
import { stopAllWatchers } from "./handlers/watcher.js";
import {
  ProviderSettingsStore,
  type SecretStore,
} from "./agent/providers/settings-store.js";
import { ImageProviderSettingsStore } from "./agent/image-providers/settings-store.js";
import {
  getImageProvider,
  type ImageProviderId,
} from "./agent/image-providers/registry.js";
import { setLuminaPluginContext } from "./agent-v2/plugin/context.js";
import { SkillLoader } from "./agent/skills/loader.js";
import { WikiSettingsStore } from "./wiki/settings-store.js";
import { WikiManager } from "./wiki/manager.js";
import { createMainWindowOptions } from "./window-config.js";

// ── State ──────────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let dirtyFileCount = 0;
export function setDirtyFileCount(count: number): void {
  dirtyFileCount = count;
}

export default function createWindow(): BrowserWindow {
  const preloadPath = path.join(__dirname, "../preload/index.cjs");
  console.log("[main] preload path:", preloadPath);

  const win = new BrowserWindow(createMainWindowOptions(preloadPath));

  if (process.platform === "darwin") {
    win.setWindowButtonVisibility(false);
  }

  // Log any preload errors (silent by default in Electron)
  win.webContents.on("preload-error", (_event, _preloadPath, error) => {
    console.error("[main] Preload script error:", error);
  });

  win.webContents.on("did-finish-load", () => {
    console.log("[main] renderer finished load");
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  win.on("close", (e) => {
    if (dirtyFileCount > 0) {
      const { dialog } = require("electron");
      const choice = dialog.showMessageBoxSync(win, {
        type: "warning",
        buttons: ["Cancel", "Close Without Saving"],
        defaultId: 0,
        cancelId: 0,
        title: "Unsaved Changes",
        message: `You have ${dirtyFileCount} file(s) with unsaved changes.`,
        detail: "Your changes will be lost if you close without saving.",
      });

      if (choice === 0) {
        e.preventDefault();
      }
      // choice === 1: allow close
    }
  });

  mainWindow = win;
  return win;
}

function getMainWindow() {
  return mainWindow;
}

// ── Native menu (macOS standard) ─────────────────────────────────────────
function buildMenu() {
  const isMac = process.platform === "darwin";
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: "appMenu" as const }] : []),
    { role: "fileMenu" as const },
    { role: "editMenu" as const },
    { role: "viewMenu" as const },
    { role: "windowMenu" as const },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── App lifecycle ─────────────────────────────────────────────────────────
// storeHandlers 是 secure_store_{get,set,delete} 的具体实现,SettingsStore
// 只需要一层适配(纯 promise 接口)。
const secretStore: SecretStore = {
  async get(key: string): Promise<string | null> {
    const value = await storeHandlers.secure_store_get({ key });
    return typeof value === "string" ? value : null;
  },
  async set(key: string, value: string): Promise<void> {
    await storeHandlers.secure_store_set({ key, value });
  },
  async delete(key: string): Promise<void> {
    await storeHandlers.secure_store_delete({ key });
  },
};

app.whenReady().then(() => {
  installMainLogForwarding();
  const providerSettings = new ProviderSettingsStore({
    baseDir: app.getPath("userData"),
    secretStore,
  });
  const imageProviderSettings = new ImageProviderSettingsStore({
    baseDir: app.getPath("userData"),
    secretStore,
  });

  // Active vault path tracked here and exposed to the opencode plugin via
  // globalThis. The plugin reads this at tool-execute time so generate_image
  // always writes to the user's currently-open vault, not the one bound at
  // server-start time.
  let activeVaultPath: string | null = null;
  setLuminaPluginContext({
    resolveImageSettings: (id) =>
      imageProviderSettings.resolveSettings(id as ImageProviderId),
    getImageProviderDefaults: (id) => {
      const entry = getImageProvider(id as ImageProviderId);
      if (!entry) {
        throw new Error(`Unknown image provider: ${id}`);
      }
      return {
        defaultModelId: entry.defaultModelId,
        defaultBaseUrl: entry.defaultBaseUrl,
        marketingName: entry.marketingName,
      };
    },
    getActiveVaultPath: () => activeVaultPath,
  });

  const skillLoader = new SkillLoader();
  const wikiSettings = new WikiSettingsStore({
    baseDir: app.getPath("userData"),
  });
  const wikiManager = new WikiManager({
    settings: wikiSettings,
    // Wiki synthesis now routes through the same opencode server the chat
    // uses; per-call resolver picks up server-restart credential changes.
    serverInfoResolver: () => {
      const handle = getOpencodeServer();
      if (!handle) return null;
      return {
        url: handle.url,
        username: handle.username,
        password: handle.password,
      };
    },
  });
  // Refresh env from provider settings and (re)start the opencode server.
  // Called once at cold start and again whenever the user updates AI Settings,
  // so opencode's next request uses the new provider / key / baseURL.
  const reloadAndRestartOpencode = async (): Promise<void> => {
    try {
      const bridge = await buildOpencodeBridge(providerSettings);
      applyOpencodeBridge(bridge);
      const handle = await restartOpencodeServer();
      console.log(
        `[main] opencode server at ${handle.url}${
          bridge ? ` (provider: ${bridge.summary})` : " (no provider configured)"
        }`,
      );
    } catch (err) {
      console.error("[main] opencode server failed to (re)start", err);
    }
  };

  // AISettingsModal.setConfig() fires three IPC calls in rapid succession
  // (set_active_provider / set_provider_settings / set_provider_api_key).
  // Debounce so we only do one restart per save.
  let restartDebounce: NodeJS.Timeout | null = null;
  const scheduleOpencodeRestart = (): void => {
    if (restartDebounce) clearTimeout(restartDebounce);
    restartDebounce = setTimeout(() => {
      restartDebounce = null;
      void reloadAndRestartOpencode();
    }, 150);
  };

  registerIpcHandlers({
    getMainWindow,
    providerSettings,
    imageProviderSettings,
    skillLoader,
    wikiSettings,
    wikiManager,
    onActiveVaultChanged: (vaultPath: string) => {
      activeVaultPath = vaultPath;
    },
    onProviderSettingsChanged: () => scheduleOpencodeRestart(),
  });
  registerOpencodeIpc();

  void (async () => {
    try {
      const bridge = await buildOpencodeBridge(providerSettings);
      applyOpencodeBridge(bridge);
      const h = await startOpencodeServer();
      console.log(
        `[main] opencode server at ${h.url}${
          bridge ? ` (provider: ${bridge.summary})` : " (no provider configured)"
        }`,
      );
    } catch (err) {
      console.error("[main] opencode server failed to start", err);
    }
  })();
  buildMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopAllWatchers();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  void stopOpencodeServer();
});
