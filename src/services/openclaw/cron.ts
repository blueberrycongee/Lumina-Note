import { join } from "@/lib/path";
import { createDir, exists, readFile, saveFile } from "@/lib/host";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";
import { invoke } from "@/lib/host";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenClawCronSchedule {
  kind: "cron" | "every" | "at";
  expr?: string;
  tz?: string;
  everyMs?: number;
  at?: string;
}

export interface OpenClawCronPayload {
  kind: "agentTurn" | "systemEvent";
  message?: string;
  text?: string;
}

export interface OpenClawCronJob {
  jobId: string;
  name: string;
  enabled: boolean;
  schedule: OpenClawCronSchedule;
  payload: OpenClawCronPayload;
  sessionTarget?: string;
  agentId?: string | null;
  description?: string;
  deleteAfterRun?: boolean;
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/**
 * Derive the cron jobs.json path from the OpenClaw workspace path.
 * ~/.openclaw/workspace → ~/.openclaw/cron/jobs.json
 */
export function resolveOpenClawCronPath(workspacePath: string): string {
  const normalized = workspacePath.replace(/\\/g, "/").replace(/\/+$/, "");
  // Strip the last segment (e.g. "workspace") to get ~/.openclaw root
  const openClawRoot = normalized.replace(/\/[^/]+$/, "");
  return join(openClawRoot, "cron", "jobs.json");
}

// ---------------------------------------------------------------------------
// Access root registration
// ---------------------------------------------------------------------------

async function ensureCronAccessRoot(workspacePath: string): Promise<void> {
  const cronPath = resolveOpenClawCronPath(workspacePath);
  const cronDir = cronPath.replace(/\/[^/]+$/, "");
  useWorkspaceStore.getState().registerWorkspace(cronDir);
  const roots = Array.from(
    new Set(useWorkspaceStore.getState().workspaces.map((w) => w.path)),
  );
  if (roots.length > 0) {
    await invoke("fs_set_allowed_roots", { roots });
  }
}

// ---------------------------------------------------------------------------
// Read / Write
// ---------------------------------------------------------------------------

export async function readOpenClawCronJobs(workspacePath: string): Promise<OpenClawCronJob[]> {
  await ensureCronAccessRoot(workspacePath);
  const cronPath = resolveOpenClawCronPath(workspacePath);
  if (!(await exists(cronPath))) {
    return [];
  }
  const raw = await readFile(cronPath);
  return JSON.parse(raw) as OpenClawCronJob[];
}

export async function writeOpenClawCronJobs(
  workspacePath: string,
  jobs: OpenClawCronJob[],
): Promise<void> {
  await ensureCronAccessRoot(workspacePath);
  const cronPath = resolveOpenClawCronPath(workspacePath);
  const cronDir = cronPath.replace(/\/[^/]+$/, "");
  await createDir(cronDir, { recursive: true });
  await saveFile(cronPath, JSON.stringify(jobs, null, 2));
}

// ---------------------------------------------------------------------------
// Pure CRUD helpers (operate on in-memory arrays)
// ---------------------------------------------------------------------------

function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createCronJob(
  jobs: OpenClawCronJob[],
  input: Omit<OpenClawCronJob, "jobId">,
): OpenClawCronJob[] {
  const newJob: OpenClawCronJob = { ...input, jobId: generateJobId() };
  return [...jobs, newJob];
}

export function updateCronJob(
  jobs: OpenClawCronJob[],
  jobId: string,
  updates: Partial<OpenClawCronJob>,
): OpenClawCronJob[] {
  return jobs.map((job) => (job.jobId === jobId ? { ...job, ...updates, jobId } : job));
}

export function deleteCronJob(jobs: OpenClawCronJob[], jobId: string): OpenClawCronJob[] {
  return jobs.filter((job) => job.jobId !== jobId);
}
