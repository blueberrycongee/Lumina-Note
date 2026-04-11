import os from 'os'
import path from 'path'
import { app, shell, dialog, BrowserWindow } from 'electron'

export const platformHandlers: Record<string, (args: Record<string, unknown>, win?: BrowserWindow) => Promise<unknown>> = {
  // ── @tauri-apps/api/path ────────────────────────────────────────────────
  async 'plugin:path|home_dir'() { return os.homedir() },
  async 'plugin:path|temp_dir'() { return os.tmpdir() },
  async 'plugin:path|app_config_dir'() { return app.getPath('userData') },
  async 'plugin:path|app_data_dir'() { return app.getPath('userData') },
  async 'plugin:path|app_local_data_dir'() { return app.getPath('userData') },
  async 'plugin:path|app_log_dir'() { return app.getPath('logs') },
  async 'plugin:path|desktop_dir'() { return app.getPath('desktop') },
  async 'plugin:path|document_dir'() { return app.getPath('documents') },
  async 'plugin:path|download_dir'() { return app.getPath('downloads') },
  async 'plugin:path|picture_dir'() { return app.getPath('pictures') },
  async 'plugin:path|resolve_directory'({ directory, path: p }) {
    const base = await platformHandlers[`plugin:path|${String(directory).toLowerCase()}_dir`]?.({}) as string
    return p ? path.join(base, p as string) : base
  },
  async 'plugin:path|join'({ parts }) { return path.join(...(parts as string[])) },
  async 'plugin:path|basename'({ path: p, ext }) { return ext ? path.basename(p as string, ext as string) : path.basename(p as string) },
  async 'plugin:path|dirname'({ path: p }) { return path.dirname(p as string) },
  async 'plugin:path|extname'({ path: p }) { return path.extname(p as string) },
  async 'plugin:path|normalize'({ path: p }) { return path.normalize(p as string) },
  async 'plugin:path|is_absolute'({ path: p }) { return path.isAbsolute(p as string) },

  // ── @tauri-apps/api/app ─────────────────────────────────────────────────
  async get_version() { return app.getVersion() },

  // ── @tauri-apps/plugin-os ───────────────────────────────────────────────
  async 'plugin:os|platform'() { return process.platform },
  async 'plugin:os|version'() { return os.version() },
  async 'plugin:os|type'() { return os.type() },
  async 'plugin:os|arch'() { return process.arch },
  async 'plugin:os|family'() { return process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'unix' : 'unix' },
  async 'plugin:os|exe_extension'() { return process.platform === 'win32' ? '.exe' : '' },

  // ── @tauri-apps/plugin-shell ────────────────────────────────────────────
  async 'plugin:shell|open'({ path: url }) { await shell.openExternal(url as string) },

  // ── @tauri-apps/plugin-process ──────────────────────────────────────────
  async 'plugin:process|relaunch'() { app.relaunch(); app.exit(0) },
  async 'plugin:process|exit'({ exitCode }) { app.exit((exitCode as number) ?? 0) },

  // ── @tauri-apps/plugin-updater (stub) ──────────────────────────────────
  async 'plugin:updater|check'() { return null },

  // ── @tauri-apps/plugin-clipboard (stub) ────────────────────────────────
  async 'plugin:clipboard-manager|read_text'() { return '' },
  async 'plugin:clipboard-manager|write_text'() {},

  // ── Window management ────────────────────────────────────────────────────
  async open_new_window() {
    const { default: createWindow } = await import('../index.js')
    createWindow()
  },

  // ── Dialog ───────────────────────────────────────────────────────────────
  async 'plugin:dialog|open'({ filters, multiple, directory, defaultPath, title }, win) {
    const options: Electron.OpenDialogOptions = {
      title: title as string | undefined,
      defaultPath: defaultPath as string | undefined,
      properties: [],
    }
    if (directory) options.properties!.push('openDirectory')
    else options.properties!.push('openFile')
    if (multiple) options.properties!.push('multiSelections')
    if (filters) {
      options.filters = (filters as Array<{ name: string; extensions: string[] }>).map(f => ({
        name: f.name,
        extensions: f.extensions.map(e => e.replace(/^\./, '')),
      }))
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled) return null
    return multiple ? result.filePaths : result.filePaths[0]
  },

  async 'plugin:dialog|save'({ filters, defaultPath, title }, win) {
    const options: Electron.SaveDialogOptions = {
      title: title as string | undefined,
      defaultPath: defaultPath as string | undefined,
    }
    if (filters) {
      options.filters = (filters as Array<{ name: string; extensions: string[] }>).map(f => ({
        name: f.name,
        extensions: f.extensions.map(e => e.replace(/^\./, '')),
      }))
    }
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    return result.canceled ? null : result.filePath
  },

  async 'plugin:dialog|message'({ message, title, kind }, win) {
    const options: Electron.MessageBoxOptions = {
      message: message as string,
      title: title as string | undefined,
      type: (kind as 'info' | 'error' | 'warning') ?? 'info',
      buttons: ['OK'],
    }
    win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options)
  },

  async 'plugin:dialog|ask'({ message, title, kind }, win) {
    const options: Electron.MessageBoxOptions = {
      message: message as string,
      title: title as string | undefined,
      type: (kind as 'info' | 'error' | 'warning') ?? 'info',
      buttons: ['Yes', 'No'],
      defaultId: 0,
      cancelId: 1,
    }
    const result = win
      ? await dialog.showMessageBox(win, options)
      : await dialog.showMessageBox(options)
    return result.response === 0
  },

  async 'plugin:dialog|confirm'({ message, title, kind }, win) {
    return platformHandlers['plugin:dialog|ask']({ message, title, kind }, win)
  },
}
