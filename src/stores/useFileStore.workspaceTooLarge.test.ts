/**
 * Verify that useFileStore handles WorkspaceTooLargeError from
 * directory loading by surfacing a typed warning and not leaving the store
 * in a half-loaded state.
 *
 * The walker invariant (electron/main/handlers/fs.ts) is that on a too-
 * large workspace it throws — never returns a partial tree. The store
 * must recognize that throw and translate it into actionable UI signal,
 * not a generic "open workspace failed" error.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/host", async () => {
  // Keep parseWorkspaceTooLargeError live (it's pure) — only the IO
  // surface gets stubbed, so the store's parser-based discrimination
  // exercises the real regex.
  const actual =
    await vi.importActual<typeof import("@/lib/host")>("@/lib/host");
  return {
    invoke: vi.fn(async () => undefined),
    listDirectory: vi.fn(),
    listDirShallow: vi.fn(),
    parseWorkspaceTooLargeError: actual.parseWorkspaceTooLargeError,
    readFile: vi.fn(),
    saveFile: vi.fn(),
    createFile: vi.fn(),
    createDir: vi.fn(async () => undefined),
    estimateDirSize: vi.fn(async () => ({
      warning: false,
      isSystemDir: false,
      topLevelCount: 0,
    })),
  };
});

vi.mock("@/stores/useErrorStore", () => ({
  useErrorStore: {
    getState: () => ({
      pushNotice: vi.fn(),
    }),
  },
}));

import { listDirShallow } from "@/lib/host";
import { useFileStore } from "@/stores/useFileStore";
import { useErrorStore } from "@/stores/useErrorStore";

describe("useFileStore — WorkspaceTooLargeError handling", () => {
  let pushNotice: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    pushNotice = vi.fn();
    vi.spyOn(useErrorStore, "getState").mockReturnValue({
      pushNotice,
    } as never);
    useFileStore.setState({
      vaultPath: null,
      fileTree: [],
      isLoadingTree: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("setVaultPath surfaces a count-mode warning and clears loading state", async () => {
    vi.mocked(listDirShallow).mockRejectedValueOnce(
      new Error(
        "WORKSPACE_TOO_LARGE:count:500001: Workspace exceeds the supported 500,000-entry ceiling.",
      ),
    );

    await useFileStore.getState().setVaultPath("/test/huge");

    const state = useFileStore.getState();
    // Vault is rolled back; store doesn't pretend the open succeeded.
    expect(state.vaultPath).toBeNull();
    expect(state.isLoadingTree).toBe(false);
    expect(state.fileTree).toEqual([]);

    expect(pushNotice).toHaveBeenCalled();
    const notice = pushNotice.mock.calls[0][0];
    expect(notice.level).toBe("warning");
    expect(notice.title).toMatch(/exceeds size ceiling/i);
    expect(notice.message).toMatch(/Workspace exceeds the supported/);
  });

  it("setVaultPath surfaces a timeout-mode warning with the actionable text", async () => {
    vi.mocked(listDirShallow).mockRejectedValueOnce(
      new Error(
        "WORKSPACE_TOO_LARGE:timeout:42000: Workspace took longer than 10s to enumerate.",
      ),
    );

    await useFileStore.getState().setVaultPath("/test/slow");

    expect(pushNotice).toHaveBeenCalled();
    const notice = pushNotice.mock.calls[0][0];
    expect(notice.level).toBe("warning");
    expect(notice.title).toMatch(/timed out/i);
    expect(notice.message).toMatch(/longer than 10s/);
  });

  it("refreshFileTree preserves the existing fileTree on too-large error", async () => {
    // Simulate a vault that was previously loaded successfully, then a
    // refresh fails due to a sudden size explosion (e.g., a build dir
    // filled up). The user shouldn't lose their working context.
    const priorTree = [
      {
        name: "note.md",
        path: "/v/note.md",
        is_dir: false,
        isDirectory: false,
        size: null,
        modified_at: null,
        created_at: null,
        children: null,
      },
    ];
    useFileStore.setState({
      vaultPath: "/v",
      fileTree: priorTree,
      isLoadingTree: false,
    });

    vi.mocked(listDirShallow).mockRejectedValueOnce(
      new Error("WORKSPACE_TOO_LARGE:count:500001: ..."),
    );

    await useFileStore.getState().refreshFileTree();

    const state = useFileStore.getState();
    expect(state.fileTree).toBe(priorTree);
    expect(state.isLoadingTree).toBe(false);
    expect(pushNotice).toHaveBeenCalled();
  });

  it("non-workspace-too-large errors fall through to the generic error path", async () => {
    vi.mocked(listDirShallow).mockRejectedValueOnce(
      new Error("EACCES: permission denied"),
    );

    await useFileStore.getState().setVaultPath("/test/locked");

    expect(pushNotice).toHaveBeenCalled();
    const notice = pushNotice.mock.calls[0][0];
    // Generic path uses "failed", not "warning".
    expect(notice.title).toMatch(/Open workspace failed/);
    expect(notice.level).toBe("error");
  });
});
