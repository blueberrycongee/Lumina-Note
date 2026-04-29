import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAllWindows: vi.fn(),
  getOpencodeServer: vi.fn(),
  getOpencodeServerWhenReady: vi.fn(),
  ipcHandle: vi.fn(),
  onOpencodeHandleChange: vi.fn(),
}));

vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: mocks.getAllWindows,
  },
  ipcMain: {
    handle: mocks.ipcHandle,
  },
}));

vi.mock("./server.js", () => ({
  getOpencodeServer: mocks.getOpencodeServer,
  getOpencodeServerWhenReady: mocks.getOpencodeServerWhenReady,
  onOpencodeHandleChange: mocks.onOpencodeHandleChange,
}));

import { OPENCODE_GET_SERVER_INFO, registerOpencodeIpc } from "./ipc.js";

describe("registerOpencodeIpc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAllWindows.mockReturnValue([]);
    mocks.getOpencodeServer.mockReturnValue(null);
    mocks.getOpencodeServerWhenReady.mockReset();
    mocks.onOpencodeHandleChange.mockImplementation(() => () => {});
  });

  it("waits for an in-flight server startup before returning server info", async () => {
    const handle = {
      url: "http://127.0.0.1:12345",
      username: "opencode",
      password: "pw",
      stop: vi.fn(),
    };
    mocks.getOpencodeServerWhenReady.mockResolvedValue(handle);

    registerOpencodeIpc();

    const registered = mocks.ipcHandle.mock.calls.find(
      ([channel]) => channel === OPENCODE_GET_SERVER_INFO,
    );
    expect(registered).toBeDefined();

    const handler = registered?.[1] as () => Promise<unknown>;
    await expect(handler()).resolves.toEqual({
      url: handle.url,
      username: handle.username,
      password: handle.password,
    });
    expect(mocks.getOpencodeServerWhenReady).toHaveBeenCalledTimes(1);
  });
});
