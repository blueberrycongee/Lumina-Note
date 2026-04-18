import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

const inspectMock = vi.hoisted(() => vi.fn());
const inspectTreeMock = vi.hoisted(() => vi.fn());
const listDirectoryMock = vi.hoisted(() => vi.fn());
const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/openclaw/workspace", () => ({
  inspectOpenClawWorkspace: inspectMock,
  inspectOpenClawWorkspaceTree: inspectTreeMock,
}));

vi.mock("@/lib/host", () => ({
  listDirectory: listDirectoryMock,
  invoke: invokeMock,
}));

import { useOpenClawWorkspaceStore } from "./useOpenClawWorkspaceStore";

const hostWorkspacePath = "/tmp/lumina";
const mountedWorkspacePath = "/tmp/openclaw";

describe("useOpenClawWorkspaceStore", () => {
  beforeEach(() => {
    localStorage.clear();
    inspectMock.mockReset();
    inspectTreeMock.mockReset();
    listDirectoryMock.mockReset();
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
    listDirectoryMock.mockResolvedValue([]);
    useWorkspaceStore.setState({
      workspaces: [],
      currentWorkspaceId: null,
    });
    useOpenClawWorkspaceStore.setState({
      integrationEnabled: true,
      snapshotsByHostPath: {},
      mountedFileTreesByHostPath: {},
      attachmentsByHostPath: {},
      conflictsByHostPath: {},
      activeHostWorkspacePath: null,
      isRefreshing: false,
      lastError: null,
    });
  });

  it("stores the refreshed snapshot for the active host workspace", async () => {
    inspectMock.mockResolvedValue({
      workspacePath: mountedWorkspacePath,
      status: "detected",
      checkedAt: 1,
      matchedRequiredFiles: ["AGENTS.md", "SOUL.md", "USER.md"],
      matchedOptionalFiles: [],
      matchedDirectories: ["memory"],
      missingRequiredFiles: [],
      memoryDirectoryPath: `${mountedWorkspacePath}/memory`,
      todayMemoryPath: `${mountedWorkspacePath}/memory/2026-03-11.md`,
      artifactDirectoryPaths: [],
      planDirectoryPaths: [],
      recentMemoryPaths: [],
      planFilePaths: [],
      artifactFilePaths: [],
      artifactFileCount: 0,
      bridgeNotePaths: [],
      editablePriorityFiles: ["AGENTS.md", "SOUL.md", "USER.md"],
      indexingScope: "shared-workspace",
      gatewayEnabled: false,
      error: null,
    });

    const snapshot = await useOpenClawWorkspaceStore.getState().refreshWorkspace(hostWorkspacePath, {
      workspacePath: mountedWorkspacePath,
    });

    expect(snapshot?.status).toBe("detected");
    expect(useOpenClawWorkspaceStore.getState().activeHostWorkspacePath).toBe(hostWorkspacePath);
    expect(
      useOpenClawWorkspaceStore.getState().getSnapshot(hostWorkspacePath)?.memoryDirectoryPath,
    ).toBe(`${mountedWorkspacePath}/memory`);
  });

  it("clears the active host workspace when refresh is called without a path", async () => {
    useOpenClawWorkspaceStore.setState({
      activeHostWorkspacePath: hostWorkspacePath,
      snapshotsByHostPath: {
        [hostWorkspacePath]: {
          workspacePath: mountedWorkspacePath,
          status: "detected",
          checkedAt: 1,
          matchedRequiredFiles: ["AGENTS.md", "SOUL.md", "USER.md"],
          matchedOptionalFiles: [],
          matchedDirectories: ["memory"],
          missingRequiredFiles: [],
          memoryDirectoryPath: `${mountedWorkspacePath}/memory`,
          todayMemoryPath: `${mountedWorkspacePath}/memory/2026-03-11.md`,
          artifactDirectoryPaths: [],
          planDirectoryPaths: [],
          recentMemoryPaths: [],
          planFilePaths: [],
          artifactFilePaths: [],
          artifactFileCount: 0,
          bridgeNotePaths: [],
          editablePriorityFiles: ["AGENTS.md", "SOUL.md", "USER.md"],
          indexingScope: "shared-workspace",
          gatewayEnabled: false,
          error: null,
        },
      },
    });

    await useOpenClawWorkspaceStore.getState().refreshWorkspace(null);

    expect(useOpenClawWorkspaceStore.getState().activeHostWorkspacePath).toBeNull();
  });

  it("attaches an external workspace onto the current host workspace", async () => {
    inspectMock.mockResolvedValue({
      workspacePath: mountedWorkspacePath,
      status: "detected",
      checkedAt: 1,
      matchedRequiredFiles: ["AGENTS.md", "SOUL.md", "USER.md"],
      matchedOptionalFiles: [],
      matchedDirectories: ["memory"],
      missingRequiredFiles: [],
      memoryDirectoryPath: `${mountedWorkspacePath}/memory`,
      todayMemoryPath: `${mountedWorkspacePath}/memory/2026-03-11.md`,
      artifactDirectoryPaths: [],
      planDirectoryPaths: [],
      recentMemoryPaths: [],
      planFilePaths: [],
      artifactFilePaths: [],
      artifactFileCount: 0,
      bridgeNotePaths: [],
      editablePriorityFiles: ["AGENTS.md", "SOUL.md", "USER.md"],
      indexingScope: "shared-workspace",
      gatewayEnabled: true,
      error: null,
    });
    inspectTreeMock.mockReturnValue({
      workspacePath: mountedWorkspacePath,
      status: "detected",
      checkedAt: 2,
      matchedRequiredFiles: ["AGENTS.md", "SOUL.md", "USER.md"],
      matchedOptionalFiles: ["HEARTBEAT.md"],
      matchedDirectories: ["memory", "output"],
      missingRequiredFiles: [],
      memoryDirectoryPath: `${mountedWorkspacePath}/memory`,
      todayMemoryPath: `${mountedWorkspacePath}/memory/2026-03-11.md`,
      artifactDirectoryPaths: [`${mountedWorkspacePath}/output`],
      planDirectoryPaths: [`${mountedWorkspacePath}/output/plans`],
      recentMemoryPaths: [`${mountedWorkspacePath}/memory/2026-03-11.md`],
      planFilePaths: [`${mountedWorkspacePath}/output/plans/launch-plan.md`],
      artifactFilePaths: [`${mountedWorkspacePath}/output/report.md`],
      artifactFileCount: 1,
      bridgeNotePaths: [`${mountedWorkspacePath}/.lumina/openclaw-bridge-note-2026-03-11.md`],
      editablePriorityFiles: ["AGENTS.md", "SOUL.md", "USER.md", "HEARTBEAT.md"],
      indexingScope: "shared-workspace",
      gatewayEnabled: true,
      error: null,
    });
    listDirectoryMock.mockResolvedValue([
      {
        name: "AGENTS.md",
        path: `${mountedWorkspacePath}/AGENTS.md`,
        is_dir: false,
        children: null,
      },
    ]);

    const attached = await useOpenClawWorkspaceStore.getState().attachWorkspace({
      hostWorkspacePath,
      workspacePath: mountedWorkspacePath,
      gateway: { enabled: true, endpoint: "ws://127.0.0.1:8042" },
    });

    expect(attached.status).toBe("attached");
    expect(attached.hostWorkspacePath).toBe(hostWorkspacePath);
    expect(attached.workspacePath).toBe(mountedWorkspacePath);
    expect(attached.detectedFiles).toEqual(["AGENTS.md", "SOUL.md", "USER.md", "HEARTBEAT.md"]);
    expect(attached.detectedFolders).toEqual(["memory", "output"]);
    expect(attached.gateway.endpoint).toBe("ws://127.0.0.1:8042");
    expect(useOpenClawWorkspaceStore.getState().getSnapshot(hostWorkspacePath)?.artifactFileCount).toBe(1);
    expect(useOpenClawWorkspaceStore.getState().getMountedWorkspacePath(hostWorkspacePath)).toBe(
      mountedWorkspacePath,
    );
    expect(useOpenClawWorkspaceStore.getState().getMountedFileTree(hostWorkspacePath)).toHaveLength(1);
    expect(invokeMock).toHaveBeenCalledWith("fs_set_allowed_roots", {
      roots: expect.arrayContaining([hostWorkspacePath, mountedWorkspacePath]),
    });
  });

  it("returns stable references for mounted trees and attachments", async () => {
    const emptyTreeA = useOpenClawWorkspaceStore.getState().getMountedFileTree(null);
    const emptyTreeB = useOpenClawWorkspaceStore.getState().getMountedFileTree(null);
    expect(emptyTreeA).toBe(emptyTreeB);

    inspectMock.mockResolvedValue({
      workspacePath: mountedWorkspacePath,
      status: "detected",
      checkedAt: 1,
      matchedRequiredFiles: ["AGENTS.md", "SOUL.md", "USER.md"],
      matchedOptionalFiles: [],
      matchedDirectories: ["memory"],
      missingRequiredFiles: [],
      memoryDirectoryPath: `${mountedWorkspacePath}/memory`,
      todayMemoryPath: `${mountedWorkspacePath}/memory/2026-03-11.md`,
      artifactDirectoryPaths: [],
      planDirectoryPaths: [],
      recentMemoryPaths: [],
      planFilePaths: [],
      artifactFilePaths: [],
      artifactFileCount: 0,
      bridgeNotePaths: [],
      editablePriorityFiles: ["AGENTS.md", "SOUL.md", "USER.md"],
      indexingScope: "shared-workspace",
      gatewayEnabled: false,
      error: null,
    });

    await useOpenClawWorkspaceStore.getState().attachWorkspace({
      hostWorkspacePath,
      workspacePath: mountedWorkspacePath,
    });

    const attachmentA = useOpenClawWorkspaceStore.getState().getAttachment(hostWorkspacePath);
    const attachmentB = useOpenClawWorkspaceStore.getState().getAttachment(hostWorkspacePath);
    expect(attachmentA).toBe(attachmentB);
  });

  it("marks an attached workspace unavailable when the path stops refreshing", async () => {
    inspectMock.mockResolvedValue({
      workspacePath: mountedWorkspacePath,
      status: "detected",
      checkedAt: 1,
      matchedRequiredFiles: ["AGENTS.md", "SOUL.md", "USER.md"],
      matchedOptionalFiles: [],
      matchedDirectories: ["memory"],
      missingRequiredFiles: [],
      memoryDirectoryPath: `${mountedWorkspacePath}/memory`,
      todayMemoryPath: `${mountedWorkspacePath}/memory/2026-03-11.md`,
      artifactDirectoryPaths: [],
      planDirectoryPaths: [],
      recentMemoryPaths: [],
      planFilePaths: [],
      artifactFilePaths: [],
      artifactFileCount: 0,
      bridgeNotePaths: [],
      editablePriorityFiles: ["AGENTS.md", "SOUL.md", "USER.md"],
      indexingScope: "shared-workspace",
      gatewayEnabled: false,
      error: null,
    });

    await useOpenClawWorkspaceStore.getState().attachWorkspace({
      hostWorkspacePath,
      workspacePath: mountedWorkspacePath,
    });

    useOpenClawWorkspaceStore.getState().markUnavailable(hostWorkspacePath);

    expect(useOpenClawWorkspaceStore.getState().getAttachment(hostWorkspacePath)?.status).toBe(
      "unavailable",
    );
  });

  it("stores gateway metadata updates for an attached workspace", async () => {
    inspectMock.mockResolvedValue({
      workspacePath: mountedWorkspacePath,
      status: "detected",
      checkedAt: 1,
      matchedRequiredFiles: ["AGENTS.md", "SOUL.md", "USER.md"],
      matchedOptionalFiles: [],
      matchedDirectories: ["memory"],
      missingRequiredFiles: [],
      memoryDirectoryPath: `${mountedWorkspacePath}/memory`,
      todayMemoryPath: `${mountedWorkspacePath}/memory/2026-03-11.md`,
      artifactDirectoryPaths: [],
      planDirectoryPaths: [],
      recentMemoryPaths: [],
      planFilePaths: [],
      artifactFilePaths: [],
      artifactFileCount: 0,
      bridgeNotePaths: [],
      editablePriorityFiles: ["AGENTS.md", "SOUL.md", "USER.md"],
      indexingScope: "shared-workspace",
      gatewayEnabled: false,
      error: null,
    });

    await useOpenClawWorkspaceStore.getState().attachWorkspace({
      hostWorkspacePath,
      workspacePath: mountedWorkspacePath,
    });

    const updated = useOpenClawWorkspaceStore.getState().updateGateway(hostWorkspacePath, {
      enabled: true,
      endpoint: "ws://127.0.0.1:8042",
    });

    expect(updated?.gateway.enabled).toBe(true);
    expect(updated?.gateway.endpoint).toBe("ws://127.0.0.1:8042");
  });

  it("records a warning when external OpenClaw changes hit dirty Lumina files", async () => {
    inspectMock.mockResolvedValue({
      workspacePath: mountedWorkspacePath,
      status: "detected",
      checkedAt: 1,
      matchedRequiredFiles: ["AGENTS.md", "SOUL.md", "USER.md"],
      matchedOptionalFiles: [],
      matchedDirectories: ["memory"],
      missingRequiredFiles: [],
      memoryDirectoryPath: `${mountedWorkspacePath}/memory`,
      todayMemoryPath: `${mountedWorkspacePath}/memory/2026-03-11.md`,
      artifactDirectoryPaths: [],
      planDirectoryPaths: [],
      recentMemoryPaths: [],
      planFilePaths: [],
      artifactFilePaths: [],
      artifactFileCount: 0,
      bridgeNotePaths: [],
      editablePriorityFiles: ["AGENTS.md", "SOUL.md", "USER.md"],
      indexingScope: "shared-workspace",
      gatewayEnabled: false,
      error: null,
    });

    await useOpenClawWorkspaceStore.getState().attachWorkspace({
      hostWorkspacePath,
      workspacePath: mountedWorkspacePath,
    });

    useOpenClawWorkspaceStore.getState().recordExternalChange(
      hostWorkspacePath,
      [`${mountedWorkspacePath}/AGENTS.md`, `${mountedWorkspacePath}/output/report.md`],
      [`${mountedWorkspacePath}/AGENTS.md`],
    );

    expect(useOpenClawWorkspaceStore.getState().getConflictState(hostWorkspacePath)).toMatchObject({
      workspacePath: mountedWorkspacePath,
      status: "warning",
      files: [`${mountedWorkspacePath}/AGENTS.md`],
    });
  });

  it("disables attachment access when integration is turned off", async () => {
    inspectMock.mockResolvedValue({
      workspacePath: mountedWorkspacePath,
      status: "detected",
      checkedAt: 1,
      matchedRequiredFiles: ["AGENTS.md", "SOUL.md", "USER.md"],
      matchedOptionalFiles: [],
      matchedDirectories: ["memory"],
      missingRequiredFiles: [],
      memoryDirectoryPath: `${mountedWorkspacePath}/memory`,
      todayMemoryPath: `${mountedWorkspacePath}/memory/2026-03-11.md`,
      artifactDirectoryPaths: [],
      planDirectoryPaths: [],
      recentMemoryPaths: [],
      planFilePaths: [],
      artifactFilePaths: [],
      artifactFileCount: 0,
      bridgeNotePaths: [],
      editablePriorityFiles: ["AGENTS.md", "SOUL.md", "USER.md"],
      indexingScope: "shared-workspace",
      gatewayEnabled: false,
      error: null,
    });

    await useOpenClawWorkspaceStore.getState().attachWorkspace({
      hostWorkspacePath,
      workspacePath: mountedWorkspacePath,
    });

    useOpenClawWorkspaceStore.getState().setIntegrationEnabled(false);

    expect(useOpenClawWorkspaceStore.getState().getAttachment(hostWorkspacePath)).toBeNull();
    expect(useOpenClawWorkspaceStore.getState().getSnapshot(hostWorkspacePath)).toBeNull();
    await expect(
      useOpenClawWorkspaceStore.getState().attachWorkspace({
        hostWorkspacePath,
        workspacePath: mountedWorkspacePath,
      }),
    ).rejects.toThrow("OpenClaw integration is disabled.");
  });
});
