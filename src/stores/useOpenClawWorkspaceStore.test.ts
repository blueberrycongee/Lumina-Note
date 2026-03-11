import { beforeEach, describe, expect, it, vi } from "vitest";

const inspectMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/openclaw/workspace", () => ({
  inspectOpenClawWorkspace: inspectMock,
}));

import { useOpenClawWorkspaceStore } from "./useOpenClawWorkspaceStore";

describe("useOpenClawWorkspaceStore", () => {
  beforeEach(() => {
    localStorage.clear();
    inspectMock.mockReset();
    useOpenClawWorkspaceStore.setState({
      snapshotsByPath: {},
      activeWorkspacePath: null,
      isRefreshing: false,
      lastError: null,
    });
  });

  it("stores the refreshed snapshot for the active workspace", async () => {
    inspectMock.mockResolvedValue({
      workspacePath: "/tmp/openclaw",
      status: "detected",
      checkedAt: 1,
      matchedRequiredFiles: ["AGENTS.md", "SOUL.md", "USER.md"],
      matchedOptionalFiles: [],
      matchedDirectories: ["memory"],
      missingRequiredFiles: [],
      memoryDirectoryPath: "/tmp/openclaw/memory",
      todayMemoryPath: "/tmp/openclaw/memory/2026-03-11.md",
      artifactDirectoryPaths: [],
      recentMemoryPaths: [],
      artifactFilePaths: [],
      artifactFileCount: 0,
      editablePriorityFiles: ["AGENTS.md", "SOUL.md", "USER.md"],
      indexingScope: "shared-workspace",
      gatewayEnabled: false,
      error: null,
    });

    const snapshot = await useOpenClawWorkspaceStore.getState().refreshWorkspace("/tmp/openclaw");

    expect(snapshot?.status).toBe("detected");
    expect(useOpenClawWorkspaceStore.getState().activeWorkspacePath).toBe("/tmp/openclaw");
    expect(useOpenClawWorkspaceStore.getState().getSnapshot("/tmp/openclaw")?.memoryDirectoryPath).toBe(
      "/tmp/openclaw/memory",
    );
  });

  it("clears the active workspace when refresh is called without a path", async () => {
    useOpenClawWorkspaceStore.setState({
      activeWorkspacePath: "/tmp/openclaw",
      snapshotsByPath: {
        "/tmp/openclaw": {
          workspacePath: "/tmp/openclaw",
          status: "detected",
          checkedAt: 1,
          matchedRequiredFiles: ["AGENTS.md", "SOUL.md", "USER.md"],
          matchedOptionalFiles: [],
          matchedDirectories: ["memory"],
          missingRequiredFiles: [],
          memoryDirectoryPath: "/tmp/openclaw/memory",
          todayMemoryPath: "/tmp/openclaw/memory/2026-03-11.md",
          artifactDirectoryPaths: [],
          recentMemoryPaths: [],
          artifactFilePaths: [],
          artifactFileCount: 0,
          editablePriorityFiles: ["AGENTS.md", "SOUL.md", "USER.md"],
          indexingScope: "shared-workspace",
          gatewayEnabled: false,
          error: null,
        },
      },
    });

    await useOpenClawWorkspaceStore.getState().refreshWorkspace(null);

    expect(useOpenClawWorkspaceStore.getState().activeWorkspacePath).toBeNull();
  });
});
