// IPC endpoints that expose opencode server credentials to the renderer.
// The renderer uses these to build `createOpencodeClient({ baseUrl, auth })`.

import { BrowserWindow, ipcMain } from "electron";
import { getOpencodeServer, onOpencodeHandleChange } from "./server.js";

export const OPENCODE_GET_SERVER_INFO = "opencode:get-server-info";
export const OPENCODE_SERVER_CHANGED = "opencode:server-changed";

export type OpencodeServerInfo = {
  url: string;
  username: string;
  password: string;
} | null;

function handleInfo(): OpencodeServerInfo {
  const handle = getOpencodeServer();
  if (!handle) return null;
  return {
    url: handle.url,
    username: handle.username,
    password: handle.password,
  };
}

export function registerOpencodeIpc(): void {
  ipcMain.handle(OPENCODE_GET_SERVER_INFO, (): OpencodeServerInfo => handleInfo());

  // Push new credentials to every renderer whenever the server restarts
  // (e.g. after the user updates provider settings). The renderer resets its
  // cached OpencodeClient so subsequent requests hit the fresh URL.
  onOpencodeHandleChange(() => {
    const info = handleInfo();
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(OPENCODE_SERVER_CHANGED, info);
      }
    }
  });
}
