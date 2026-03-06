import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const WORKSPACE_PATH = "Y:/obsidian/vault";
const WORKSPACE_ID = "workspace-y-drive";
const TREE = [
  {
    name: "notes",
    path: `${WORKSPACE_PATH}/notes`,
    is_dir: true,
    children: [],
  },
];

async function flushAsyncWork() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("useFileStore rehydrate runtime fs roots", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("lumina-locale", JSON.stringify({ state: { locale: "zh-CN" } }));
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("rehydrates a persisted workspace outside default roots by syncing runtime roots before refreshing", async () => {
    localStorage.setItem(
      "lumina-workspace",
      JSON.stringify({
        state: {
          vaultPath: WORKSPACE_PATH,
          recentFiles: [],
        },
      })
    );
    localStorage.setItem(
      "lumina-workspaces",
      JSON.stringify({
        state: {
          workspaces: [{ id: WORKSPACE_ID, name: "vault", path: WORKSPACE_PATH }],
          currentWorkspaceId: WORKSPACE_ID,
        },
      })
    );

    const callOrder: string[] = [];
    let rootsSynced = false;

    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: unknown) => {
      callOrder.push(cmd);

      if (cmd === "fs_set_allowed_roots") {
        const roots = (args as { roots?: string[] } | undefined)?.roots ?? [];
        rootsSynced = roots.includes(WORKSPACE_PATH);
        return undefined;
      }

      if (cmd === "list_directory") {
        if (!rootsSynced) {
          throw new Error(`Path not permitted: ${WORKSPACE_PATH}`);
        }
        return TREE;
      }

      if (cmd === "mobile_set_workspace") {
        return undefined;
      }

      return undefined;
    });

    const { useFileStore } = await import("@/stores/useFileStore");

    await useFileStore.persist.rehydrate();
    await flushAsyncWork();

    expect(callOrder).toContain("fs_set_allowed_roots");
    expect(callOrder.indexOf("fs_set_allowed_roots")).toBeLessThan(callOrder.indexOf("list_directory"));
    expect(useFileStore.getState().vaultPath).toBe(WORKSPACE_PATH);
    expect(useFileStore.getState().fileTree).toEqual(TREE);
  });
});
