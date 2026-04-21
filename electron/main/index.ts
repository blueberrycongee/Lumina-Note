import { app, BrowserWindow, Menu } from "electron";
import path from "path";

// Force overlay scrollbars so custom ::-webkit-scrollbar CSS does not
// push content left (classic mode). The scrollbar paints on top instead.
app.commandLine.appendSwitch("enable-features", "OverlayScrollbar");
import { registerIpcHandlers } from "./ipc.js";
import { storeHandlers } from "./handlers/store.js";
import { stopAllWatchers } from "./handlers/watcher.js";
import { AgentEventBus } from "./agent/event-bus.js";
import { IpcApprovalGate } from "./agent/approval-gate.js";
import { DebugLog } from "./agent/debug-log.js";
import { MemoryStore } from "./agent/memory-store.js";
import { AiSdkProvider } from "./agent/providers/ai-sdk-provider.js";
import {
  createLanguageModel,
  getProvider,
} from "./agent/providers/registry.js";
import {
  ProviderSettingsStore,
  type SecretStore,
} from "./agent/providers/settings-store.js";
import { AgentRuntime } from "./agent/runtime.js";
import { SkillLoader } from "./agent/skills/loader.js";
import { McpManager } from "./agent/mcp/manager.js";
import { refreshMcpTools } from "./agent/mcp/tools.js";
import { registerFsTools } from "./agent/tools/fs.js";
import { registerShellTool } from "./agent/tools/shell.js";
import { registerApplyPatchTool } from "./agent/tools/apply-patch.js";
import { ToolRegistry } from "./agent/tool-registry.js";
import type { ProviderInterface } from "./agent/types.js";
import { WikiSettingsStore } from "./wiki/settings-store.js";
import { WikiManager } from "./wiki/manager.js";
import { createMainWindowOptions } from "./window-config.js";

// ── State ──────────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let dirtyFileCount = 0;

export default function createWindow(): BrowserWindow {
  const preloadPath = path.join(__dirname, "../preload/index.cjs");
  console.log("[main] preload path:", preloadPath);

  const win = new BrowserWindow(createMainWindowOptions(preloadPath));

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
  const agentEventBus = new AgentEventBus(getMainWindow);
  const approvalGate = new IpcApprovalGate();
  const debugLog = new DebugLog({ baseDir: app.getPath("logs") });
  const memoryStore = new MemoryStore();
  const providerSettings = new ProviderSettingsStore({
    baseDir: app.getPath("userData"),
    secretStore,
  });

  const providerSelector = async (): Promise<ProviderInterface | null> => {
    const activeId = providerSettings.getActiveProvider();
    if (!activeId) return null;
    const entry = getProvider(activeId);
    if (!entry) return null;
    const settings = await providerSettings.resolveSettings(activeId);
    const modelId = providerSettings.getProviderSettings(activeId).modelId;
    if (!modelId) return null;
    try {
      const model = createLanguageModel(activeId, settings, modelId);
      return new AiSdkProvider({ model });
    } catch (err) {
      console.error("[main] provider selection failed", err);
      return null;
    }
  };

  const toolRegistry = new ToolRegistry();
  registerFsTools(toolRegistry);
  registerShellTool(toolRegistry);
  // apply_patch needs the active vault path; beforeStart below keeps it fresh.
  let currentVaultPath: string | null = null;
  registerApplyPatchTool(toolRegistry, { rootDir: () => currentVaultPath });

  const mcpManager = new McpManager({ baseDir: app.getPath("userData") });
  void mcpManager.init().catch((err) => {
    console.error("[main] mcp init failed", err);
  });

  const agentRuntime = new AgentRuntime({
    eventBus: agentEventBus,
    approvalGate,
    debugLog,
    memoryStore,
    providerSelector,
    toolRegistry,
    beforeStart: async (context) => {
      currentVaultPath = context.workspace_path ?? null;
      await refreshMcpTools(toolRegistry, mcpManager).catch((err) => {
        console.error("[main] mcp tool refresh failed", err);
      });
    },
  });
  const skillLoader = new SkillLoader();
  const wikiSettings = new WikiSettingsStore({
    baseDir: app.getPath("userData"),
  });
  const wikiManager = new WikiManager({
    settings: wikiSettings,
    providerSelector,
  });
  registerIpcHandlers({
    getMainWindow,
    agentRuntime,
    debugLog,
    providerSettings,
    skillLoader,
    mcpManager,
    wikiSettings,
    wikiManager,
  });
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
