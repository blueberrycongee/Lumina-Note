import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REHYDRATE_CASES = [
  {
    label: "mapped drive path",
    workspaceId: "workspace-y-drive",
    workspacePath: "Y:/obsidian/vault",
  },
  {
    label: "UNC network path",
    workspaceId: "workspace-unc",
    workspacePath: "\\\\Mac\\home\\obsidian\\vault",
  },
] as const;

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

  it.each(REHYDRATE_CASES)(
    "rehydrates a persisted workspace outside default roots for $label by syncing runtime roots before refreshing",
    async ({ workspaceId, workspacePath }) => {
      const tree = [
        {
          name: "notes",
          path: `${workspacePath}/notes`,
          is_dir: true,
          children: [],
        },
      ];

      localStorage.setItem(
        "lumina-workspace",
        JSON.stringify({
          state: {
            vaultPath: workspacePath,
            recentFiles: [],
          },
        })
      );
      localStorage.setItem(
        "lumina-workspaces",
        JSON.stringify({
          state: {
            workspaces: [{ id: workspaceId, name: "vault", path: workspacePath }],
            currentWorkspaceId: workspaceId,
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
          rootsSynced = roots.includes(workspacePath);
          return undefined;
        }

        if (cmd === "list_directory") {
          if (!rootsSynced) {
            throw new Error(`Path not permitted: ${workspacePath}`);
          }
          return tree;
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
      expect(useFileStore.getState().vaultPath).toBe(workspacePath);
      expect(useFileStore.getState().fileTree).toEqual(tree);
    }
  );
});
