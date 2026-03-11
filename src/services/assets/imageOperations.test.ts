import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FileEntry } from "@/lib/tauri";
import { useFileStore } from "@/stores/useFileStore";

import {
  buildImageMoveChanges,
  buildImageRenameTargetPath,
  executeImageAssetChanges,
  previewImageAssetChanges,
  previewImageRename,
  validateImageAssetPaths,
} from "./imageOperations";

const makeFile = (path: string): FileEntry => ({
  name: path.split("/").pop() || path,
  path,
  is_dir: false,
  size: null,
  modified_at: null,
  created_at: null,
  children: null,
});

const makeDir = (path: string, children: FileEntry[]): FileEntry => ({
  name: path.split("/").pop() || path,
  path,
  is_dir: true,
  size: null,
  modified_at: null,
  created_at: null,
  children,
});

describe("imageOperations", () => {
  beforeEach(() => {
    useFileStore.setState({
      tabs: [],
      activeTabIndex: -1,
      currentFile: null,
      currentContent: "",
      isDirty: false,
      fileTree: [],
      vaultPath: "/vault",
    });
  });

  it("builds safe rename and move target paths", () => {
    expect(buildImageRenameTargetPath("/vault/assets/hero.png", "cover")).toBe("/vault/assets/cover.png");
    expect(buildImageRenameTargetPath("/vault/assets/hero.png", "cover.png")).toBe("/vault/assets/cover.png");
    expect(buildImageMoveChanges(["/vault/assets/hero.png"], "/vault/media")).toEqual([
      { from: "/vault/assets/hero.png", to: "/vault/media/hero.png" },
    ]);
  });

  it("plans a rename preview from open note content", async () => {
    useFileStore.setState({
      currentFile: "/vault/notes/alpha.md",
      currentContent: "![Hero](../assets/hero.png)",
      tabs: [
        {
          id: "/vault/notes/alpha.md",
          type: "file",
          path: "/vault/notes/alpha.md",
          name: "alpha",
          content: "stale on disk",
          isDirty: true,
          undoStack: [],
          redoStack: [],
        },
      ],
    });

    const preview = await previewImageRename(
      [
        makeDir("/vault/notes", [makeFile("/vault/notes/alpha.md")]),
        makeDir("/vault/assets", [makeFile("/vault/assets/hero.png")]),
      ],
      "/vault/assets/hero.png",
      "cover",
      vi.fn(async () => {
        throw new Error("disk read should be skipped for the active note");
      }),
      vi.fn(async () => false),
    );

    expect(preview.noteUpdates).toHaveLength(1);
    expect(preview.noteUpdates[0].updatedContent).toContain("../assets/cover.png");
  });

  it("rolls back note updates and file moves when saving markdown refs fails", async () => {
    const renameFileFn = vi.fn(async () => {});
    const saveFileFn = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("save failed"))
      .mockResolvedValue(undefined);

    await expect(
      executeImageAssetChanges({
        changes: [{ from: "/vault/assets/hero.png", to: "/vault/media/hero.png" }],
        noteUpdates: [
          {
            notePath: "/vault/notes/alpha.md",
            originalContent: "![Hero](../assets/hero.png)",
            updatedContent: "![Hero](../media/hero.png)",
            changes: [
              {
                from: "/vault/assets/hero.png",
                to: "/vault/media/hero.png",
                occurrenceCount: 1,
              },
            ],
          },
          {
            notePath: "/vault/notes/beta.md",
            originalContent: "![[../assets/hero.png]]",
            updatedContent: "![[../media/hero.png]]",
            changes: [
              {
                from: "/vault/assets/hero.png",
                to: "/vault/media/hero.png",
                occurrenceCount: 1,
              },
            ],
          },
        ],
        renameFileFn,
        saveFileFn,
        createDirFn: vi.fn(async () => {}),
        refreshFileTree: vi.fn(async () => {}),
        reloadFileIfOpen: vi.fn(async () => {}),
      }),
    ).rejects.toThrow("save failed");

    expect(renameFileFn).toHaveBeenNthCalledWith(1, "/vault/assets/hero.png", "/vault/media/hero.png");
    expect(renameFileFn).toHaveBeenNthCalledWith(2, "/vault/media/hero.png", "/vault/assets/hero.png");
    expect(saveFileFn).toHaveBeenNthCalledWith(1, "/vault/notes/alpha.md", "![Hero](../media/hero.png)");
    expect(saveFileFn).toHaveBeenNthCalledWith(2, "/vault/notes/beta.md", "![[../media/hero.png]]");
    expect(saveFileFn).toHaveBeenNthCalledWith(3, "/vault/notes/alpha.md", "![Hero](../assets/hero.png)");
  });

  it("rejects duplicate or non-image targets", () => {
    expect(() =>
      validateImageAssetPaths([
        { from: "/vault/assets/a.png", to: "/vault/media/shared.png" },
        { from: "/vault/assets/b.png", to: "/vault/media/shared.png" },
      ]),
    ).toThrow("Target image paths must be unique");

    expect(() =>
      validateImageAssetPaths([{ from: "/vault/notes/a.md", to: "/vault/media/a.png" }]),
    ).toThrow("Only image files can be managed here");
  });

  it("rejects rename when target already exists on disk", async () => {
    await expect(
      previewImageAssetChanges(
        [makeDir("/vault/assets", [makeFile("/vault/assets/hero.png"), makeFile("/vault/assets/cover.png")])],
        [{ from: "/vault/assets/hero.png", to: "/vault/assets/cover.png" }],
        vi.fn(async () => ""),
        vi.fn(async () => true),
      ),
    ).rejects.toThrow("Target already exists: cover.png");
  });

  it("allows rename when target does not exist on disk", async () => {
    const preview = await previewImageAssetChanges(
      [makeDir("/vault/assets", [makeFile("/vault/assets/hero.png")])],
      [{ from: "/vault/assets/hero.png", to: "/vault/assets/cover.png" }],
      vi.fn(async () => ""),
      vi.fn(async () => false),
    );
    expect(preview.changes).toEqual([{ from: "/vault/assets/hero.png", to: "/vault/assets/cover.png" }]);
  });

  it('stops before renaming files when creating the target directory fails', async () => {
    const renameFileFn = vi.fn(async () => {});
    const saveFileFn = vi.fn(async () => {});
    const createDirFn = vi.fn(async () => {
      throw new Error('mkdir failed');
    });

    await expect(
      executeImageAssetChanges({
        changes: [{ from: '/vault/assets/hero.png', to: '/vault/media/hero.png' }],
        noteUpdates: [],
        renameFileFn,
        saveFileFn,
        createDirFn,
        refreshFileTree: vi.fn(async () => {}),
        reloadFileIfOpen: vi.fn(async () => {}),
      }),
    ).rejects.toThrow('mkdir failed');

    expect(renameFileFn).not.toHaveBeenCalled();
    expect(saveFileFn).not.toHaveBeenCalled();
  });
});
