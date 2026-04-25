import type { BrowserWindowConstructorOptions } from 'electron'

export const MAIN_WINDOW_DEFAULT_WIDTH = 1080
export const MAIN_WINDOW_DEFAULT_HEIGHT = 720
export const MAIN_WINDOW_MIN_WIDTH = 800
export const MAIN_WINDOW_MIN_HEIGHT = 600

export function createMainWindowOptions(
  preloadPath: string,
  platformName = process.platform,
): BrowserWindowConstructorOptions {
  return {
    width: MAIN_WINDOW_DEFAULT_WIDTH,
    height: MAIN_WINDOW_DEFAULT_HEIGHT,
    minWidth: MAIN_WINDOW_MIN_WIDTH,
    minHeight: MAIN_WINDOW_MIN_HEIGHT,
    titleBarStyle: platformName === 'darwin' ? 'hidden' : 'default',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  }
}
