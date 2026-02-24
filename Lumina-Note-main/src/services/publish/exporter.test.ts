import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileEntry } from "@/lib/tauri";
import { publishSite } from "./exporter";
import { buildAssetOutputName } from "./assets";

const readFileMock = vi.fn();
const createDirMock = vi.fn();
const saveFileMock = vi.fn();
const writeBinaryFileMock = vi.fn();
const readBinaryFileBase64Mock = vi.fn();

vi.mock("@/lib/tauri", () => ({
  readFile: (path: string) => readFileMock(path),
  createDir: (path: string) => createDirMock(path),
  saveFile: (path: string, content: string) => saveFileMock(path, content),
  writeBinaryFile: (path: string, data: Uint8Array) => writeBinaryFileMock(path, data),
  readBinaryFileBase64: (path: string) => readBinaryFileBase64Mock(path),
}));

const makeFileTree = (paths: string[]): FileEntry[] =>
  paths.map((path) => ({
    name: path.split("/").pop() || path,
    path,
    is_dir: false,
    children: null,
  }));

describe("publishSite", () => {
  beforeEach(() => {
    readFileMock.mockReset();
    createDirMock.mockReset();
    saveFileMock.mockReset();
    writeBinaryFileMock.mockReset();
    readBinaryFileBase64Mock.mockReset();
  });

  it("writes site files and copies assets", async () => {
    const markdown = `---
visibility: public
title: Hello
---

![Alt](./img.png)
`;
    readFileMock.mockResolvedValue(markdown);
    readBinaryFileBase64Mock.mockResolvedValue(Buffer.from("img").toString("base64"));

    const result = await publishSite({
      vaultPath: "/vault",
      fileTree: makeFileTree(["/vault/Hello.md"]),
      profile: {
        id: "profile-1",
        displayName: "Ada",
        bio: "Bio",
        avatarUrl: "",
        links: [],
        pinnedNotePaths: [],
      },
      options: {
        outputDir: "/vault/site",
      },
    });

    expect(result.postCount).toBe(1);
    expect(result.assetCount).toBe(1);

    expect(saveFileMock).toHaveBeenCalledWith("/vault/site/index.html", expect.any(String));
    expect(saveFileMock).toHaveBeenCalledWith("/vault/site/posts/hello/index.html", expect.any(String));

    const assetName = buildAssetOutputName("/vault/img.png");
    expect(readBinaryFileBase64Mock).toHaveBeenCalledWith("/vault/img.png");
    expect(writeBinaryFileMock).toHaveBeenCalledWith(`/vault/site/assets/${assetName}`, expect.any(Uint8Array));
  });
});
