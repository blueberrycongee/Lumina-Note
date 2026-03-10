import { beforeEach, describe, expect, it, vi } from "vitest";

const moveFile = vi.hoisted(() => vi.fn());
const executeImageMove = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tauri", () => ({
  listDirectory: vi.fn(() => Promise.resolve([])),
  readFile: vi.fn(),
  saveFile: vi.fn(),
  createFile: vi.fn(),
  createDir: vi.fn(() => Promise.resolve()),
  moveFile,
}));

vi.mock("@/services/assets/imageOperations", () => ({
  executeImageMove,
}));

import { useFileStore } from "./useFileStore";

describe("useFileStore.moveFileToFolder", () => {
  beforeEach(() => {
    moveFile.mockReset();
    executeImageMove.mockReset();
    useFileStore.setState({
      tabs: [
        {
          id: "/vault/assets/hero.png",
          type: "file",
          path: "/vault/assets/hero.png",
          name: "hero.png",
          content: "",
          isDirty: false,
          undoStack: [],
          redoStack: [],
        },
      ],
      activeTabIndex: 0,
      currentFile: "/vault/assets/hero.png",
      currentContent: "",
      fileTree: [
        {
          name: "assets",
          path: "/vault/assets",
          is_dir: true,
          children: [
            {
              name: "hero.png",
              path: "/vault/assets/hero.png",
              is_dir: false,
              children: null,
            },
          ],
        },
      ],
    });
  });

  it("routes image moves through the safe asset operation flow", async () => {
    executeImageMove.mockResolvedValue({
      changes: [{ from: "/vault/assets/hero.png", to: "/vault/notes/assets/hero.png" }],
      noteUpdates: [],
      notePaths: [],
    });

    await useFileStore.getState().moveFileToFolder("/vault/assets/hero.png", "/vault/notes/assets");

    expect(executeImageMove).toHaveBeenCalledWith(
      expect.any(Array),
      ["/vault/assets/hero.png"],
      "/vault/notes/assets",
    );
    expect(moveFile).not.toHaveBeenCalled();
    expect(useFileStore.getState().tabs[0]?.path).toBe("/vault/notes/assets/hero.png");
    expect(useFileStore.getState().currentFile).toBe("/vault/notes/assets/hero.png");
  });
});
