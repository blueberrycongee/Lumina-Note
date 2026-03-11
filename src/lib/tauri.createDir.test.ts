import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { createDir } from "./tauri";

const mockedInvoke = vi.mocked(invoke);

describe("createDir", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
  });

  it("calls create_dir directly when recursive is not set", async () => {
    mockedInvoke.mockResolvedValueOnce(undefined);

    await createDir("/vault/new-folder");

    expect(mockedInvoke).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).toHaveBeenCalledWith("create_dir", { path: "/vault/new-folder" });
  });

  it("calls create_dir when recursive is true and path does not exist", async () => {
    mockedInvoke
      .mockResolvedValueOnce(false)    // path_exists → false
      .mockResolvedValueOnce(undefined); // create_dir → ok

    await createDir("/vault/assets", { recursive: true });

    expect(mockedInvoke).toHaveBeenCalledTimes(2);
    expect(mockedInvoke).toHaveBeenNthCalledWith(1, "path_exists", { path: "/vault/assets" });
    expect(mockedInvoke).toHaveBeenNthCalledWith(2, "create_dir", { path: "/vault/assets" });
  });

  it("skips create_dir when recursive is true and path already exists", async () => {
    mockedInvoke.mockResolvedValueOnce(true); // path_exists → true

    await createDir("/vault/assets", { recursive: true });

    expect(mockedInvoke).toHaveBeenCalledTimes(1);
    expect(mockedInvoke).toHaveBeenCalledWith("path_exists", { path: "/vault/assets" });
  });

  it("propagates create_dir errors when directory does not exist", async () => {
    mockedInvoke
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error("permission denied"));

    await expect(createDir("/root/forbidden", { recursive: true })).rejects.toThrow(
      "permission denied",
    );
  });

  it("propagates errors without recursive (existing dir triggers FileExists)", async () => {
    mockedInvoke.mockRejectedValueOnce(new Error("File already exists: /vault/assets"));

    await expect(createDir("/vault/assets")).rejects.toThrow("File already exists");
  });
});
