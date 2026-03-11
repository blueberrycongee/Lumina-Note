import { join } from "@/lib/path";
import { createDir, exists, saveFile } from "@/lib/tauri";
import type { FileEntry } from "@/lib/tauri";

export const OPENCLAW_REQUIRED_ROOT_FILES = ["AGENTS.md", "SOUL.md", "USER.md"] as const;
export const OPENCLAW_OPTIONAL_ROOT_FILES = [
  "IDENTITY.md",
  "TOOLS.md",
  "HEARTBEAT.md",
  "BOOT.md",
  "BOOTSTRAP.md",
  "MEMORY.md",
] as const;
export const OPENCLAW_SPECIAL_DIRECTORIES = ["memory", "skills", "canvas", "output"] as const;

export type OpenClawWorkspaceStatus = "detected" | "not-detected" | "error";

export interface OpenClawWorkspaceSnapshot {
  workspacePath: string;
  status: OpenClawWorkspaceStatus;
  checkedAt: number;
  matchedRequiredFiles: string[];
  matchedOptionalFiles: string[];
  matchedDirectories: string[];
  missingRequiredFiles: string[];
  memoryDirectoryPath: string | null;
  todayMemoryPath: string;
  artifactDirectoryPaths: string[];
  recentMemoryPaths: string[];
  artifactFilePaths: string[];
  artifactFileCount: number;
  editablePriorityFiles: string[];
  indexingScope: "shared-workspace";
  gatewayEnabled: boolean;
  error: string | null;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildOpenClawTodayMemoryPath(workspacePath: string, date: Date = new Date()): string {
  return join(workspacePath, "memory", `${formatLocalDate(date)}.md`);
}

export function buildOpenClawDailyMemoryTemplate(date: Date = new Date()): string {
  const isoDate = formatLocalDate(date);
  return `# ${isoDate}\n\n`;
}

export async function ensureOpenClawTodayMemoryNote(
  workspacePath: string,
  date: Date = new Date(),
): Promise<string> {
  const memoryDir = join(workspacePath, "memory");
  const notePath = buildOpenClawTodayMemoryPath(workspacePath, date);
  await createDir(memoryDir, { recursive: true });
  if (!(await exists(notePath))) {
    await saveFile(notePath, buildOpenClawDailyMemoryTemplate(date));
  }
  return notePath;
}

export async function inspectOpenClawWorkspace(
  workspacePath: string,
): Promise<OpenClawWorkspaceSnapshot> {
  const checkedAt = Date.now();
  const todayMemoryPath = buildOpenClawTodayMemoryPath(workspacePath);
  try {
    const requiredChecks = await Promise.all(
      OPENCLAW_REQUIRED_ROOT_FILES.map(async (name) => ({
        name,
        exists: await exists(join(workspacePath, name)),
      })),
    );
    const optionalChecks = await Promise.all(
      OPENCLAW_OPTIONAL_ROOT_FILES.map(async (name) => ({
        name,
        exists: await exists(join(workspacePath, name)),
      })),
    );
    const directoryChecks = await Promise.all(
      OPENCLAW_SPECIAL_DIRECTORIES.map(async (name) => ({
        name,
        exists: await exists(join(workspacePath, name)),
      })),
    );

    const matchedRequiredFiles = requiredChecks.filter((entry) => entry.exists).map((entry) => entry.name);
    const matchedOptionalFiles = optionalChecks.filter((entry) => entry.exists).map((entry) => entry.name);
    const matchedDirectories = directoryChecks.filter((entry) => entry.exists).map((entry) => entry.name);
    const missingRequiredFiles = requiredChecks
      .filter((entry) => !entry.exists)
      .map((entry) => entry.name);
    const editablePriorityFiles = [...matchedRequiredFiles, ...matchedOptionalFiles];
    const memoryDirectoryPath = matchedDirectories.includes("memory")
      ? join(workspacePath, "memory")
      : null;
    const artifactDirectoryPaths = matchedDirectories
      .filter((name) => name !== "memory" && name !== "skills")
      .map((name) => join(workspacePath, name));

    return {
      workspacePath,
      status: missingRequiredFiles.length === 0 ? "detected" : "not-detected",
      checkedAt,
      matchedRequiredFiles,
      matchedOptionalFiles,
      matchedDirectories,
      missingRequiredFiles,
      memoryDirectoryPath,
      todayMemoryPath,
      artifactDirectoryPaths,
      recentMemoryPaths: [],
      artifactFilePaths: [],
      artifactFileCount: 0,
      editablePriorityFiles,
      indexingScope: "shared-workspace",
      gatewayEnabled: false,
      error: null,
    };
  } catch (error) {
    return {
      workspacePath,
      status: "error",
      checkedAt,
      matchedRequiredFiles: [],
      matchedOptionalFiles: [],
      matchedDirectories: [],
      missingRequiredFiles: [...OPENCLAW_REQUIRED_ROOT_FILES],
      memoryDirectoryPath: null,
      todayMemoryPath,
      artifactDirectoryPaths: [],
      recentMemoryPaths: [],
      artifactFilePaths: [],
      artifactFileCount: 0,
      editablePriorityFiles: [],
      indexingScope: "shared-workspace",
      gatewayEnabled: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function inspectOpenClawWorkspaceTree(
  workspacePath: string,
  fileTree: FileEntry[],
  checkedAt: number = Date.now(),
): OpenClawWorkspaceSnapshot {
  const rootFiles = new Set(
    fileTree.filter((entry) => !entry.is_dir).map((entry) => entry.name),
  );
  const rootDirectories = new Set(
    fileTree.filter((entry) => entry.is_dir).map((entry) => entry.name),
  );

  const matchedRequiredFiles = OPENCLAW_REQUIRED_ROOT_FILES.filter((name) => rootFiles.has(name));
  const matchedOptionalFiles = OPENCLAW_OPTIONAL_ROOT_FILES.filter((name) => rootFiles.has(name));
  const matchedDirectories = OPENCLAW_SPECIAL_DIRECTORIES.filter((name) => rootDirectories.has(name));
  const missingRequiredFiles = OPENCLAW_REQUIRED_ROOT_FILES.filter((name) => !rootFiles.has(name));
  const memoryDirectoryPath = matchedDirectories.includes("memory")
    ? join(workspacePath, "memory")
    : null;
  const allFilePaths: string[] = [];
  const collectFilePaths = (entries: FileEntry[]) => {
    for (const entry of entries) {
      if (entry.is_dir) {
        if (Array.isArray(entry.children)) {
          collectFilePaths(entry.children);
        }
        continue;
      }
      allFilePaths.push(entry.path);
    }
  };
  collectFilePaths(fileTree);

  const recentMemoryPaths = allFilePaths
    .filter((path) => path.startsWith(join(workspacePath, "memory")) && path.toLowerCase().endsWith(".md"))
    .sort((left, right) => right.localeCompare(left))
    .slice(0, 8);
  const artifactFilePaths = allFilePaths
    .filter((path) => {
      const normalized = path.replace(/\\/g, "/");
      const workspaceRoot = workspacePath.replace(/\\/g, "/");
      return (
        normalized.startsWith(`${workspaceRoot}/output/`) ||
        normalized.startsWith(`${workspaceRoot}/canvas/`) ||
        normalized.startsWith(`${workspaceRoot}/tmp/`) ||
        normalized.startsWith(`${workspaceRoot}/artifacts/`)
      );
    })
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 12);

  return {
    workspacePath,
    status: missingRequiredFiles.length === 0 ? "detected" : "not-detected",
    checkedAt,
    matchedRequiredFiles,
    matchedOptionalFiles,
    matchedDirectories,
    missingRequiredFiles,
    memoryDirectoryPath,
    todayMemoryPath: buildOpenClawTodayMemoryPath(workspacePath),
    artifactDirectoryPaths: matchedDirectories
      .filter((name) => name !== "memory" && name !== "skills")
      .map((name) => join(workspacePath, name)),
    recentMemoryPaths,
    artifactFilePaths,
    artifactFileCount: allFilePaths.filter((path) => {
      const normalized = path.replace(/\\/g, "/");
      const workspaceRoot = workspacePath.replace(/\\/g, "/");
      return (
        normalized.startsWith(`${workspaceRoot}/output/`) ||
        normalized.startsWith(`${workspaceRoot}/canvas/`) ||
        normalized.startsWith(`${workspaceRoot}/tmp/`) ||
        normalized.startsWith(`${workspaceRoot}/artifacts/`)
      );
    }).length,
    editablePriorityFiles: [...matchedRequiredFiles, ...matchedOptionalFiles],
    indexingScope: "shared-workspace",
    gatewayEnabled: false,
    error: null,
  };
}
