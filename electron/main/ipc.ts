/**
 * IPC handler registration — wires all 'tauri-invoke' calls to their
 * Node.js implementations. Each handler receives (args, win) and returns
 * a value that is sent back to the renderer as the invoke() result.
 */

import { ipcMain, BrowserWindow, app } from "electron";
import path from "node:path";
import { fsHandlers } from "./handlers/fs.js";
import { platformHandlers } from "./handlers/platform.js";
import { storeHandlers } from "./handlers/store.js";
import { startFileWatcher } from "./handlers/watcher.js";
import { createWebDAVHandlers } from "./handlers/webdav.js";
import { createProxyHandlers } from "./handlers/proxy.js";
import { createUpdaterHandlers } from "./handlers/updater.js";
import { createDiagnosticsHandlers } from "./handlers/diagnostics.js";
import { createPluginsHandlers } from "./handlers/plugins.js";
import { createLuminaCloudLicenseHandlers } from "./handlers/luminaCloudLicense.js";
import { session, safeStorage } from "electron";
import electronUpdater from "electron-updater";
import type { ProviderSettingsStore } from "./agent/providers/settings-store.js";
import type { ImageProviderSettingsStore } from "./agent/image-providers/settings-store.js";
import type { WikiSettingsStore } from "./wiki/settings-store.js";
import type { WikiManager } from "./wiki/manager.js";
import { dispatchAgentCommand, isAgentCommand } from "./agent/ipc-dispatch.js";
import { setDirtyFileCount } from "../main/index.js";

const { autoUpdater } = electronUpdater;

// Stub response for unimplemented commands
function notImplemented(cmd: string) {
  console.warn(`[ipc] unimplemented command: ${cmd}`);
  return null;
}

// ── Typesetting stubs ───────────────────────────────────────────────────────
const typesettingStubs: Record<string, () => unknown> = {
  typesetting_preview_page_mm: () => {
    throw new Error("typesetting sidecar not yet configured");
  },
  typesetting_fixture_font_path: () => null,
  typesetting_layout_text: () => {
    throw new Error("typesetting sidecar not yet configured");
  },
  typesetting_export_pdf_base64: () => {
    throw new Error("typesetting sidecar not yet configured");
  },
  typesetting_render_docx_pdf_base64: () => {
    throw new Error("typesetting sidecar not yet configured");
  },
};

// ── Tauri event relay (plugin:event|*) ──────────────────────────────────────
// Tauri v2's @tauri-apps/api/event calls invoke('plugin:event|listen', ...)
// We handle this here rather than in the preload since it's IPC-based.
const eventHandlerIds = new Map<string, Map<number, true>>();
let nextEventHandlerId = 1;

const eventStubs: Record<string, () => unknown> = {
  "plugin:event|listen": () => nextEventHandlerId++,
  "plugin:event|unlisten": () => null,
  "plugin:event|emit": () => null,
};

export interface IpcHandlersOptions {
  getMainWindow: () => BrowserWindow | null;
  providerSettings?: ProviderSettingsStore;
  imageProviderSettings?: ImageProviderSettingsStore;
  wikiSettings?: WikiSettingsStore;
  wikiManager?: WikiManager;
  /**
   * Called by `vault_initialize` so main/index.ts can update the active
   * vault path (read by the opencode plugin via globalThis).
   */
  onActiveVaultChanged?: (vaultPath: string) => void;
  /**
   * Called after a renderer-initiated mutation to provider settings
   * (active provider / per-provider baseUrl / per-provider apiKey).
   * Hooked from main/index.ts to rebuild opencode env and restart its server.
   */
  onProviderSettingsChanged?: () => void | Promise<void>;
}

export function registerIpcHandlers(options: IpcHandlersOptions): void {
  const {
    getMainWindow,
    providerSettings,
    imageProviderSettings,
    wikiSettings,
    wikiManager,
    onActiveVaultChanged,
    onProviderSettingsChanged,
  } = options;

  const webdavHandlers = createWebDAVHandlers({
    configPath: path.join(app.getPath("userData"), "lumina-webdav-config.json"),
  });

  const proxyHandlers = createProxyHandlers({
    configPath: path.join(app.getPath("userData"), "lumina-proxy.json"),
    session: {
      async setProxy(rules) {
        await session.defaultSession.setProxy(rules);
      },
    },
  });

  const pluginsHandlers = createPluginsHandlers({
    userPluginsDir: path.join(app.getPath("userData"), "plugins"),
    fallbackPluginsDir: path.join(app.getPath("userData"), "global-plugins"),
    builtinPluginsDir: process.resourcesPath
      ? path.join(process.resourcesPath, "plugins")
      : null,
  });

  const luminaCloudLicenseHandlers = createLuminaCloudLicenseHandlers({
    filePath: path.join(app.getPath("userData"), "lumina-cloud-license.bin"),
    safeStorage,
  });

  const diagnosticsHandlers = createDiagnosticsHandlers({
    getAppInfo: () => ({
      version: app.getVersion(),
      logsDir: app.getPath("logs"),
    }),
  });

  const updaterHandlers = createUpdaterHandlers({
    autoUpdater: autoUpdater as unknown as Parameters<
      typeof createUpdaterHandlers
    >[0]["autoUpdater"],
    sendEvent: (eventName, payload) => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send("__tauri_event__", eventName, payload);
      }
    },
    getCacheDir: () => path.join(app.getPath("userData"), "pending-updates"),
  });

  // All invoke() calls from renderer land here
  ipcMain.handle(
    "tauri-invoke",
    async (event, cmd: string, args: Record<string, unknown> = {}) => {
      const win =
        BrowserWindow.fromWebContents(event.sender) ?? getMainWindow();

      // ── File watcher ────────────────────────────────────────────────────
      if (cmd === "start_file_watcher") {
        if (win) await startFileWatcher(args.watchPath as string, win);
        return null;
      }

      // ── File system ─────────────────────────────────────────────────────
      if (cmd in fsHandlers) return fsHandlers[cmd](args);

      // ── Platform (path / dialog / shell / os / process) ─────────────────
      if (cmd in platformHandlers)
        return platformHandlers[cmd](args, win ?? undefined);

      // ── Store ────────────────────────────────────────────────────────────
      if (cmd in storeHandlers) return storeHandlers[cmd](args);

      // ── WebDAV ──────────────────────────────────────────────────────────
      if (cmd in webdavHandlers) return webdavHandlers[cmd](args);

      // ── Proxy ───────────────────────────────────────────────────────────
      if (cmd in proxyHandlers) return proxyHandlers[cmd](args);

      // ── Updater ─────────────────────────────────────────────────────────
      if (cmd in updaterHandlers) return updaterHandlers[cmd](args);

      // ── Diagnostics ─────────────────────────────────────────────────────
      if (cmd in diagnosticsHandlers) return diagnosticsHandlers[cmd](args);

      // ── Plugins ─────────────────────────────────────────────────────────
      if (cmd in pluginsHandlers) return pluginsHandlers[cmd](args);

      // ── Lumina Cloud license storage ────────────────────────────────────
      if (cmd in luminaCloudLicenseHandlers) return luminaCloudLicenseHandlers[cmd](args);

      // ── Agent IPC surface (provider settings, skills, vault, wiki).
      // The agent runtime itself is gone; the main chat runs on opencode.
      if (isAgentCommand(cmd)) {
        return dispatchAgentCommand(
          {
            providerSettings,
            imageProviderSettings,
            wikiSettings,
            wikiManager,
            onActiveVaultChanged,
            onProviderSettingsChanged,
          },
          cmd,
          args,
        );
      }

      // ── Typesetting stubs ────────────────────────────────────────────────
      if (cmd in typesettingStubs) return typesettingStubs[cmd]();

      // ── Event stubs ──────────────────────────────────────────────────────
      if (cmd in eventStubs) return eventStubs[cmd]();

      // ── Dirty state tracking ─────────────────────────────────────────────
      if (cmd === "set_dirty_state") {
        setDirtyFileCount((args.count as number) ?? 0);
        return null;
      }

      // ── Misc Tauri internals ─────────────────────────────────────────────
      if (cmd === "tauri" || cmd === "get_version")
        return process.env.npm_package_version ?? "0.0.0";

      return notImplemented(cmd);
    },
  );

  // Forward renderer-emitted events (emit() in JS) back to all windows if needed
  ipcMain.on("tauri-emit", (_event, eventName: string, payload: unknown) => {
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed())
        w.webContents.send("__tauri_event__", eventName, payload);
    });
  });

  ipcMain.on("__preload_ready", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    console.log("[main] preload bridge ready for window", win?.id ?? "unknown");
  });

  ipcMain.on("window:minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.on("window:maximize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.isMaximized() ? win.unmaximize() : win.maximize();
    }
  });

  ipcMain.on("window:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
}
