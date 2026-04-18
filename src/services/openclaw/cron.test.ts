import { beforeEach, describe, expect, it, vi } from "vitest";

const existsMock = vi.hoisted(() => vi.fn<(path: string) => Promise<boolean>>());
const readFileMock = vi.hoisted(() => vi.fn<(path: string) => Promise<string>>());
const saveFileMock = vi.hoisted(() => vi.fn<(path: string, content: string) => Promise<void>>());
const createDirMock = vi.hoisted(() =>
  vi.fn<(path: string, options?: { recursive?: boolean }) => Promise<void>>(),
);
const invokeMock = vi.hoisted(() =>
  vi.fn<(cmd: string, args?: Record<string, unknown>) => Promise<unknown>>(),
);
const registerWorkspaceMock = vi.hoisted(() => vi.fn<(path: string) => void>());

vi.mock("@/lib/host", () => ({
  exists: existsMock,
  readFile: readFileMock,
  saveFile: saveFileMock,
  createDir: createDirMock,
  invoke: invokeMock,
}));

vi.mock("@/stores/useWorkspaceStore", () => ({
  useWorkspaceStore: {
    getState: () => ({
      registerWorkspace: registerWorkspaceMock,
      workspaces: [{ path: "/Users/test/.openclaw/cron" }],
    }),
  },
}));

import {
  createCronJob,
  deleteCronJob,
  readOpenClawCronJobs,
  resolveOpenClawCronPath,
  updateCronJob,
  writeOpenClawCronJobs,
  type OpenClawCronJob,
} from "./cron";

const makeSampleJob = (overrides: Partial<OpenClawCronJob> = {}): OpenClawCronJob => ({
  jobId: "job_1",
  name: "Morning check",
  enabled: true,
  schedule: { kind: "cron", expr: "0 7 * * *" },
  payload: { kind: "agentTurn", message: "Good morning" },
  ...overrides,
});

describe("openclaw cron helpers", () => {
  beforeEach(() => {
    existsMock.mockReset();
    readFileMock.mockReset();
    saveFileMock.mockReset();
    createDirMock.mockReset();
    invokeMock.mockReset();
    registerWorkspaceMock.mockReset();
    createDirMock.mockResolvedValue(undefined);
    saveFileMock.mockResolvedValue(undefined);
    invokeMock.mockResolvedValue(undefined);
  });

  describe("resolveOpenClawCronPath", () => {
    it("derives cron path from workspace path", () => {
      expect(resolveOpenClawCronPath("/Users/test/.openclaw/workspace")).toBe(
        "/Users/test/.openclaw/cron/jobs.json",
      );
    });

    it("handles trailing slashes", () => {
      expect(resolveOpenClawCronPath("/Users/test/.openclaw/workspace/")).toBe(
        "/Users/test/.openclaw/cron/jobs.json",
      );
    });

    it("handles windows-style backslashes", () => {
      expect(resolveOpenClawCronPath("C:\\Users\\test\\.openclaw\\workspace")).toBe(
        "C:/Users/test/.openclaw/cron/jobs.json",
      );
    });
  });

  describe("readOpenClawCronJobs", () => {
    it("returns empty array when jobs.json does not exist", async () => {
      existsMock.mockResolvedValue(false);

      const result = await readOpenClawCronJobs("/Users/test/.openclaw/workspace");

      expect(result).toEqual([]);
      expect(registerWorkspaceMock).toHaveBeenCalledWith("/Users/test/.openclaw/cron");
      expect(invokeMock).toHaveBeenCalledWith("fs_set_allowed_roots", {
        roots: ["/Users/test/.openclaw/cron"],
      });
    });

    it("reads and parses existing jobs.json", async () => {
      const jobs = [makeSampleJob()];
      existsMock.mockResolvedValue(true);
      readFileMock.mockResolvedValue(JSON.stringify(jobs));

      const result = await readOpenClawCronJobs("/Users/test/.openclaw/workspace");

      expect(result).toEqual(jobs);
      expect(readFileMock).toHaveBeenCalledWith("/Users/test/.openclaw/cron/jobs.json");
    });
  });

  describe("writeOpenClawCronJobs", () => {
    it("creates cron directory and writes jobs.json", async () => {
      const jobs = [makeSampleJob()];

      await writeOpenClawCronJobs("/Users/test/.openclaw/workspace", jobs);

      expect(createDirMock).toHaveBeenCalledWith("/Users/test/.openclaw/cron", { recursive: true });
      expect(saveFileMock).toHaveBeenCalledWith(
        "/Users/test/.openclaw/cron/jobs.json",
        JSON.stringify(jobs, null, 2),
      );
    });
  });

  describe("createCronJob", () => {
    it("appends a new job with a generated jobId", () => {
      const existing = [makeSampleJob()];
      const input = {
        name: "Evening report",
        enabled: true,
        schedule: { kind: "cron" as const, expr: "0 18 * * *" },
        payload: { kind: "agentTurn" as const, message: "Evening report" },
      };

      const result = createCronJob(existing, input);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(existing[0]);
      expect(result[1].name).toBe("Evening report");
      expect(result[1].jobId).toBeTruthy();
      expect(result[1].jobId).not.toBe(existing[0].jobId);
    });
  });

  describe("updateCronJob", () => {
    it("updates the target job while preserving the jobId", () => {
      const jobs = [makeSampleJob(), makeSampleJob({ jobId: "job_2", name: "Second" })];

      const result = updateCronJob(jobs, "job_1", { name: "Updated", enabled: false });

      expect(result[0].name).toBe("Updated");
      expect(result[0].enabled).toBe(false);
      expect(result[0].jobId).toBe("job_1");
      expect(result[1]).toEqual(jobs[1]);
    });

    it("returns unchanged array when jobId not found", () => {
      const jobs = [makeSampleJob()];

      const result = updateCronJob(jobs, "nonexistent", { name: "Nope" });

      expect(result).toEqual(jobs);
    });
  });

  describe("deleteCronJob", () => {
    it("removes the job with the given jobId", () => {
      const jobs = [makeSampleJob(), makeSampleJob({ jobId: "job_2", name: "Second" })];

      const result = deleteCronJob(jobs, "job_1");

      expect(result).toHaveLength(1);
      expect(result[0].jobId).toBe("job_2");
    });

    it("returns unchanged array when jobId not found", () => {
      const jobs = [makeSampleJob()];

      const result = deleteCronJob(jobs, "nonexistent");

      expect(result).toEqual(jobs);
    });
  });
});
