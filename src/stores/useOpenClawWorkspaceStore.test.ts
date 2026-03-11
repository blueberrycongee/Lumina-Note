import { beforeEach, describe, expect, it } from "vitest";
import { useOpenClawWorkspaceStore, getDetectedOpenClawEntries } from "@/stores/useOpenClawWorkspaceStore";

describe("useOpenClawWorkspaceStore", () => {
  const workspacePath = "/tmp/openclaw-workspace";

  beforeEach(() => {
    localStorage.clear();
    useOpenClawWorkspaceStore.setState({ attachmentsByPath: {} });
  });

  it("detects OpenClaw root memory files and folders from the current tree", () => {
    const detected = getDetectedOpenClawEntries([
      { name: "AGENTS.md", path: `${workspacePath}/AGENTS.md`, is_dir: false, children: null },
      { name: "SOUL.md", path: `${workspacePath}/SOUL.md`, is_dir: false, children: null },
      { name: "memory", path: `${workspacePath}/memory`, is_dir: true, children: [] },
      { name: "notes", path: `${workspacePath}/notes`, is_dir: true, children: [] },
    ]);

    expect(detected).toEqual({
      detectedFiles: ["AGENTS.md", "SOUL.md"],
      detectedFolders: ["memory"],
    });
  });

  it("attaches, refreshes, and marks an OpenClaw workspace unavailable", () => {
    const attached = useOpenClawWorkspaceStore.getState().attachWorkspace({
      workspacePath,
      detectedFiles: ["AGENTS.md"],
    });

    expect(attached.workspacePath).toBe(workspacePath);
    expect(attached.status).toBe("attached");
    expect(useOpenClawWorkspaceStore.getState().isAttached(workspacePath)).toBe(true);

    useOpenClawWorkspaceStore.getState().refreshAttachmentScan(workspacePath, [
      { name: "AGENTS.md", path: `${workspacePath}/AGENTS.md`, is_dir: false, children: null },
      { name: "USER.md", path: `${workspacePath}/USER.md`, is_dir: false, children: null },
      { name: "output", path: `${workspacePath}/output`, is_dir: true, children: [] },
    ]);

    expect(useOpenClawWorkspaceStore.getState().getAttachment(workspacePath)).toMatchObject({
      detectedFiles: ["AGENTS.md", "USER.md"],
      detectedFolders: ["output"],
      status: "attached",
    });

    useOpenClawWorkspaceStore.getState().markUnavailable(workspacePath);
    expect(useOpenClawWorkspaceStore.getState().getAttachment(workspacePath)?.status).toBe("unavailable");

    useOpenClawWorkspaceStore.getState().detachWorkspace(workspacePath);
    expect(useOpenClawWorkspaceStore.getState().getAttachment(workspacePath)).toBeNull();
  });
});
