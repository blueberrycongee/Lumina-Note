import { app, BrowserWindow, Menu } from 'electron'
import path from 'path'
import { registerIpcHandlers } from './ipc.js'
import { stopAllWatchers } from './handlers/watcher.js'
import { AgentEventBus } from './agent/event-bus.js'
import { IpcApprovalGate } from './agent/approval-gate.js'
import { DebugLog } from './agent/debug-log.js'
import { AgentRuntime } from './agent/runtime.js'

// ── State ──────────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null

export default function createWindow(): BrowserWindow {
  const preloadPath = path.join(__dirname, '../preload/index.cjs')
  console.log('[main] preload path:', preloadPath)

  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 12, y: 16 },
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Log any preload errors (silent by default in Electron)
  win.webContents.on('preload-error', (_event, _preloadPath, error) => {
    console.error('[main] Preload script error:', error)
  })

  win.webContents.on('did-finish-load', () => {
    console.log('[main] renderer finished load')
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  mainWindow = win
  return win
}

function getMainWindow() {
  return mainWindow
}

// ── Native menu (macOS standard) ─────────────────────────────────────────
function buildMenu() {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    { role: 'fileMenu' as const },
    { role: 'editMenu' as const },
    { role: 'viewMenu' as const },
    { role: 'windowMenu' as const },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── App lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(() => {
  const agentEventBus = new AgentEventBus(getMainWindow)
  const approvalGate = new IpcApprovalGate()
  const debugLog = new DebugLog({ baseDir: app.getPath('logs') })
  const agentRuntime = new AgentRuntime({
    eventBus: agentEventBus,
    approvalGate,
    debugLog,
  })
  registerIpcHandlers({ getMainWindow, agentRuntime, debugLog })
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopAllWatchers()
  if (process.platform !== 'darwin') app.quit()
})
