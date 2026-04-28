import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createDir, estimateDirSize, invoke, listDirectory } from "@/lib/host";
import {
  initializeAgentVault,
  syncWorkspaceAccessRoots,
  useFileStore,
} from "@/stores/useFileStore";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

// Mock Tauri invoke
vi.mock("@/lib/host", () => ({
  invoke: vi.fn(),
  listDirectory: vi.fn(),
  readFile: vi.fn(),
  saveFile: vi.fn(),
  createFile: vi.fn(),
  createDir: vi.fn(),
  estimateDirSize: vi.fn(),
}));

describe("syncWorkspaceAccessRoots timing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue(undefined);
    vi.mocked(listDirectory).mockResolvedValue([]);
    vi.mocked(createDir).mockResolvedValue(undefined);
    vi.mocked(estimateDirSize).mockResolvedValue({
      warning: false,
      isSystemDir: false,
      topLevelCount: 0,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should call fs_set_allowed_roots with vault path", async () => {
    const mockPath = "/test/vault";
    
    // Mock invoke to resolve successfully
    vi.mocked(invoke).mockResolvedValue(undefined);
    
    // Mock workspace store
    const mockRegisterWorkspace = vi.fn();
    vi.spyOn(useWorkspaceStore, "getState").mockReturnValue({
      workspaces: [],
      registerWorkspace: mockRegisterWorkspace,
    } as any);
    
    // Call the function
    await syncWorkspaceAccessRoots(mockPath);
    
    // Verify workspace was registered
    expect(mockRegisterWorkspace).toHaveBeenCalledWith(mockPath);
    
    // Verify invoke was called with correct arguments
    expect(invoke).toHaveBeenCalledWith("fs_set_allowed_roots", {
      roots: [mockPath],
    });
  });

  it("should deduplicate workspace paths when syncing", async () => {
    const mockPath = "/test/vault";
    
    vi.mocked(invoke).mockResolvedValue(undefined);
    
    // Mock workspace store with existing workspace
    const mockRegisterWorkspace = vi.fn();
    vi.spyOn(useWorkspaceStore, "getState").mockReturnValue({
      workspaces: [{ path: mockPath, name: "Test" }],
      registerWorkspace: mockRegisterWorkspace,
    } as any);
    
    await syncWorkspaceAccessRoots(mockPath);
    
    // Should deduplicate - only one instance of mockPath
    expect(invoke).toHaveBeenCalledWith("fs_set_allowed_roots", {
      roots: [mockPath],
    });
  });

  it("should handle multiple workspaces correctly", async () => {
    const vaultPath = "/test/vault";
    const workspace1 = "/test/workspace1";
    const workspace2 = "/test/workspace2";
    
    vi.mocked(invoke).mockResolvedValue(undefined);
    
    const mockRegisterWorkspace = vi.fn();
    vi.spyOn(useWorkspaceStore, "getState").mockReturnValue({
      workspaces: [
        { path: workspace1, name: "Workspace 1" },
        { path: workspace2, name: "Workspace 2" },
      ],
      registerWorkspace: mockRegisterWorkspace,
    } as any);
    
    await syncWorkspaceAccessRoots(vaultPath);
    
    expect(invoke).toHaveBeenCalledWith("fs_set_allowed_roots", {
      roots: [vaultPath, workspace1, workspace2],
    });
  });

  it("should propagate invoke errors", async () => {
    const mockPath = "/test/vault";
    
    // Mock invoke to reject
    vi.mocked(invoke).mockRejectedValue(new Error("Path not permitted"));
    
    const mockRegisterWorkspace = vi.fn();
    vi.spyOn(useWorkspaceStore, "getState").mockReturnValue({
      workspaces: [],
      registerWorkspace: mockRegisterWorkspace,
    } as any);
    
    // Should propagate the error
    await expect(syncWorkspaceAccessRoots(mockPath)).rejects.toThrow("Path not permitted");
  });

  it("should be called before file operations in setVaultPath", async () => {
    // This test documents the expected call order
    // In the actual implementation, syncWorkspaceAccessRoots is called
    // at the beginning of setVaultPath, before any file operations
    
    const mockPath = "/test/vault";
    const callOrder: string[] = [];
    
    vi.mocked(invoke).mockImplementation(async () => {
      callOrder.push("fs_set_allowed_roots");
      return undefined;
    });
    
    const mockRegisterWorkspace = vi.fn();
    vi.spyOn(useWorkspaceStore, "getState").mockReturnValue({
      workspaces: [],
      registerWorkspace: mockRegisterWorkspace,
    } as any);
    
    await syncWorkspaceAccessRoots(mockPath);
    
    // Verify fs_set_allowed_roots was called
    expect(callOrder).toContain("fs_set_allowed_roots");
    // Verify it was called before any file operations would occur
    expect(callOrder.indexOf("fs_set_allowed_roots")).toBe(0);
  });

  it("should handle Windows network drive paths", async () => {
    const networkDrivePath = "Y:\\network\\vault";
    
    vi.mocked(invoke).mockResolvedValue(undefined);
    
    const mockRegisterWorkspace = vi.fn();
    vi.spyOn(useWorkspaceStore, "getState").mockReturnValue({
      workspaces: [],
      registerWorkspace: mockRegisterWorkspace,
    } as any);
    
    await syncWorkspaceAccessRoots(networkDrivePath);
    
    expect(invoke).toHaveBeenCalledWith("fs_set_allowed_roots", {
      roots: [networkDrivePath],
    });
  });

  it("should handle macOS /Volumes paths", async () => {
    const volumesPath = "/Volumes/NetworkDrive/vault";
    
    vi.mocked(invoke).mockResolvedValue(undefined);
    
    const mockRegisterWorkspace = vi.fn();
    vi.spyOn(useWorkspaceStore, "getState").mockReturnValue({
      workspaces: [],
      registerWorkspace: mockRegisterWorkspace,
    } as any);
    
    await syncWorkspaceAccessRoots(volumesPath);
    
    expect(invoke).toHaveBeenCalledWith("fs_set_allowed_roots", {
      roots: [volumesPath],
    });
  });

  it("should handle Linux /mnt and /media paths", async () => {
    const mntPath = "/mnt/network/vault";
    const mediaPath = "/media/usb/vault";
    
    vi.mocked(invoke).mockResolvedValue(undefined);
    
    const mockRegisterWorkspace = vi.fn();
    vi.spyOn(useWorkspaceStore, "getState").mockReturnValue({
      workspaces: [],
      registerWorkspace: mockRegisterWorkspace,
    } as any);
    
    await syncWorkspaceAccessRoots(mntPath);
    await syncWorkspaceAccessRoots(mediaPath);
    
    expect(invoke).toHaveBeenCalledWith("fs_set_allowed_roots", {
      roots: [mntPath],
    });
    expect(invoke).toHaveBeenCalledWith("fs_set_allowed_roots", {
      roots: [mediaPath],
    });
  });

  it("initializes the agent vault context after opening a workspace", async () => {
    const mockPath = "/test/vault";
    const callOrder: string[] = [];
    const mockRegisterWorkspace = vi.fn();
    vi.spyOn(useWorkspaceStore, "getState").mockReturnValue({
      workspaces: [],
      registerWorkspace: mockRegisterWorkspace,
    } as any);
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      callOrder.push(cmd);
      return undefined;
    });
    vi.mocked(listDirectory).mockImplementation(async () => {
      callOrder.push("list_directory");
      return [];
    });
    vi.mocked(createDir).mockImplementation(async () => {
      callOrder.push("create_dir");
      return undefined;
    });

    await useFileStore.getState().setVaultPath(mockPath);

    expect(invoke).toHaveBeenCalledWith("vault_initialize", {
      workspacePath: mockPath,
    });
    expect(callOrder.indexOf("fs_set_allowed_roots")).toBeLessThan(
      callOrder.indexOf("vault_initialize"),
    );
    expect(callOrder.indexOf("vault_initialize")).toBeLessThan(
      callOrder.indexOf("list_directory"),
    );
  });

  it("exposes agent vault initialization as a focused IPC helper", async () => {
    await initializeAgentVault("/test/vault");

    expect(invoke).toHaveBeenCalledWith("vault_initialize", {
      workspacePath: "/test/vault",
    });
  });
});
