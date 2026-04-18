import { beforeEach, describe, expect, it, vi } from "vitest";

const existsMock = vi.hoisted(() => vi.fn<(path: string) => Promise<boolean>>());
const createDirMock = vi.hoisted(() =>
  vi.fn<(path: string, options?: { recursive?: boolean }) => Promise<void>>(),
);
const saveFileMock = vi.hoisted(() => vi.fn<(path: string, content: string) => Promise<void>>());
const homeDirMock = vi.hoisted(() => vi.fn<() => Promise<string>>());

vi.mock("@/lib/host", () => ({
  exists: existsMock,
  createDir: createDirMock,
  saveFile: saveFileMock,
  homeDir: homeDirMock,
}));

import {
  buildOpenClawTodayMemoryPath,
  discoverSystemOpenClawPath,
  ensureOpenClawTodayMemoryNote,
  inspectOpenClawWorkspace,
  inspectOpenClawWorkspaceTree,
} from "./workspace";

describe("openclaw workspace helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-11T10:00:00Z"));
    existsMock.mockReset();
    createDirMock.mockReset();
    saveFileMock.mockReset();
    homeDirMock.mockReset();
    createDirMock.mockResolvedValue(undefined);
    saveFileMock.mockResolvedValue(undefined);
    homeDirMock.mockResolvedValue("/Users/test");
  });

  it("detects a workspace when required markers exist", async () => {
    const existingPaths = new Set([
      "/tmp/openclaw/AGENTS.md",
      "/tmp/openclaw/SOUL.md",
      "/tmp/openclaw/USER.md",
      "/tmp/openclaw/memory",
      "/tmp/openclaw/canvas",
    ]);
    existsMock.mockImplementation(async (path: string) => existingPaths.has(path));

    const snapshot = await inspectOpenClawWorkspace("/tmp/openclaw");

    expect(snapshot.status).toBe("detected");
    expect(snapshot.matchedRequiredFiles).toEqual(["AGENTS.md", "SOUL.md", "USER.md"]);
    expect(snapshot.matchedDirectories).toEqual(expect.arrayContaining(["memory", "canvas"]));
    expect(snapshot.artifactDirectoryPaths).toEqual(["/tmp/openclaw/canvas"]);
    expect(snapshot.planDirectoryPaths).toEqual([]);
  });

  it("marks workspace as not detected when required markers are missing", async () => {
    existsMock.mockResolvedValue(false);

    const snapshot = await inspectOpenClawWorkspace("/tmp/not-openclaw");

    expect(snapshot.status).toBe("not-detected");
    expect(snapshot.missingRequiredFiles).toEqual(["AGENTS.md", "SOUL.md", "USER.md"]);
  });

  it("creates today's memory note when the daily file is missing", async () => {
    const expectedPath = buildOpenClawTodayMemoryPath("/tmp/openclaw", new Date("2026-03-11T10:00:00Z"));
    existsMock.mockImplementation(async (path: string) => path !== expectedPath);

    const notePath = await ensureOpenClawTodayMemoryNote(
      "/tmp/openclaw",
      new Date("2026-03-11T10:00:00Z"),
    );

    expect(notePath).toBe(expectedPath);
    expect(createDirMock).toHaveBeenCalledWith("/tmp/openclaw/memory", { recursive: true });
    expect(saveFileMock).toHaveBeenCalledWith(expectedPath, "# 2026-03-11\n\n");
  });

  it("derives recent memory and artifact stats from the loaded file tree", () => {
    const snapshot = inspectOpenClawWorkspaceTree("/tmp/openclaw", [
      {
        name: "AGENTS.md",
        path: "/tmp/openclaw/AGENTS.md",
        is_dir: false,
        children: null,
      },
      {
        name: "SOUL.md",
        path: "/tmp/openclaw/SOUL.md",
        is_dir: false,
        children: null,
      },
      {
        name: "USER.md",
        path: "/tmp/openclaw/USER.md",
        is_dir: false,
        children: null,
      },
      {
        name: "memory",
        path: "/tmp/openclaw/memory",
        is_dir: true,
        children: [
          {
            name: "2026-03-11.md",
            path: "/tmp/openclaw/memory/2026-03-11.md",
            is_dir: false,
            children: null,
          },
          {
            name: "2026-03-10.md",
            path: "/tmp/openclaw/memory/2026-03-10.md",
            is_dir: false,
            children: null,
          },
        ],
      },
      {
        name: "output",
        path: "/tmp/openclaw/output",
        is_dir: true,
        children: [
          {
            name: "report.md",
            path: "/tmp/openclaw/output/report.md",
            is_dir: false,
            children: null,
          },
          {
            name: "plans",
            path: "/tmp/openclaw/output/plans",
            is_dir: true,
            children: [
              {
                name: "launch-plan.md",
                path: "/tmp/openclaw/output/plans/launch-plan.md",
                is_dir: false,
                children: null,
              },
            ],
          },
        ],
      },
      {
        name: ".lumina",
        path: "/tmp/openclaw/.lumina",
        is_dir: true,
        children: [
          {
            name: "openclaw-bridge-note-2026-03-11.md",
            path: "/tmp/openclaw/.lumina/openclaw-bridge-note-2026-03-11.md",
            is_dir: false,
            children: null,
          },
        ],
      },
    ]);

    expect(snapshot.status).toBe("detected");
    expect(snapshot.recentMemoryPaths).toEqual([
      "/tmp/openclaw/memory/2026-03-11.md",
      "/tmp/openclaw/memory/2026-03-10.md",
    ]);
    expect(snapshot.artifactFilePaths).toEqual(["/tmp/openclaw/output/report.md"]);
    expect(snapshot.artifactFileCount).toBe(1);
    expect(snapshot.planDirectoryPaths).toEqual(["/tmp/openclaw/output/plans"]);
    expect(snapshot.planFilePaths).toEqual(["/tmp/openclaw/output/plans/launch-plan.md"]);
    expect(snapshot.bridgeNotePaths).toEqual([
      "/tmp/openclaw/.lumina/openclaw-bridge-note-2026-03-11.md",
    ]);
  });

  describe("discoverSystemOpenClawPath", () => {
    it("returns workspace path when AGENTS.md probe exists", async () => {
      existsMock.mockImplementation(async (path: string) =>
        path === "/Users/test/.openclaw/workspace/AGENTS.md",
      );

      const result = await discoverSystemOpenClawPath();

      expect(result).toBe("/Users/test/.openclaw/workspace");
      expect(existsMock).toHaveBeenCalledWith("/Users/test/.openclaw/workspace/AGENTS.md");
    });

    it("returns null when AGENTS.md probe does not exist", async () => {
      existsMock.mockResolvedValue(false);

      const result = await discoverSystemOpenClawPath();

      expect(result).toBeNull();
    });

    it("returns null when homeDir throws", async () => {
      homeDirMock.mockRejectedValue(new Error("not available"));

      const result = await discoverSystemOpenClawPath();

      expect(result).toBeNull();
    });
  });
});
