// IPC endpoints that expose opencode server credentials to the renderer.
// The renderer uses these to build `createOpencodeClient({ baseUrl, auth })`.

import { ipcMain } from "electron";
import { getOpencodeServer } from "./server.js";

export const OPENCODE_GET_SERVER_INFO = "opencode:get-server-info";

export type OpencodeServerInfo = {
  url: string;
  username: string;
  password: string;
} | null;

export function registerOpencodeIpc(): void {
  ipcMain.handle(OPENCODE_GET_SERVER_INFO, (): OpencodeServerInfo => {
    const handle = getOpencodeServer();
    if (!handle) return null;
    return {
      url: handle.url,
      username: handle.username,
      password: handle.password,
    };
  });
}
