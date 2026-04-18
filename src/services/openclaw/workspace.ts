import { homeDir } from "@/lib/host";
import { join } from "@/lib/path";
import { createDir, exists, saveFile } from "@/lib/host";
import type { FileEntry } from "@/lib/host";

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
export const OPENCLAW_ARTIFACT_PATH_PREFIXES = ["output/", "canvas/", "tmp/", "artifacts/"] as const;
export const OPENCLAW_CONVENTIONAL_PLAN_DIRECTORIES = [
  "plans",
  "docs/plans",
  ".openclaw/plans",
  "output/plans",
] as const;

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
  planDirectoryPaths: string[];
  recentMemoryPaths: string[];
  planFilePaths: string[];
  artifactFilePaths: string[];
  artifactFileCount: number;
  bridgeNotePaths: string[];
  editablePriorityFiles: string[];
  indexingScope: "shared-workspace";
  gatewayEnabled: boolean;
  error: string | null;
}

/**
 * Check the system-standard OpenClaw install path (~/.openclaw/workspace)
 * for the AGENTS.md probe file. Returns the workspace path if found, null otherwise.
 */
export async function discoverSystemOpenClawPath(): Promise<string | null> {
  try {
    const home = await homeDir();
    const workspacePath = join(home, ".openclaw", "workspace");
    const probe = join(workspacePath, "AGENTS.md");
    if (await exists(probe)) {
      return workspacePath;
    }
  } catch {
    // homeDir() can throw in non-Tauri environments; ignore.
  }
  return null;
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

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function toRelativeWorkspacePath(workspacePath: string, path: string): string {
  const normalizedWorkspace = normalizePath(workspacePath).replace(/\/+$/, "");
  const normalizedPath = normalizePath(path);
  if (!normalizedWorkspace) {
    return normalizedPath.replace(/^\/+/, "");
  }
  if (normalizedPath === normalizedWorkspace) {
    return "";
  }
  if (normalizedPath.startsWith(`${normalizedWorkspace}/`)) {
    return normalizedPath.slice(normalizedWorkspace.length + 1);
  }
  return normalizedPath.replace(/^\/+/, "");
}

function isArtifactRelativePath(relativePath: string): boolean {
  if (isPlanRelativePath(relativePath)) {
    return false;
  }
  return OPENCLAW_ARTIFACT_PATH_PREFIXES.some((prefix) => relativePath.startsWith(prefix));
}

function getArtifactDirectoryForRelativePath(workspacePath: string, relativePath: string): string | null {
  if (relativePath.startsWith("tmp/docs/")) {
    return join(workspacePath, "tmp", "docs");
  }
  const topLevelSegment = relativePath.split("/")[0];
  if (!topLevelSegment || !["output", "canvas", "tmp", "artifacts"].includes(topLevelSegment)) {
    return null;
  }
  return join(workspacePath, topLevelSegment);
}

function isPlanRelativePath(relativePath: string): boolean {
  if (!relativePath) return false;
  return relativePath.split("/").includes("plans");
}

function isBridgeRelativePath(relativePath: string): boolean {
  return (
    relativePath.startsWith(".lumina/openclaw-bridge-") &&
    relativePath.toLowerCase().endsWith(".md")
  );
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
    const planChecks = await Promise.all(
      OPENCLAW_CONVENTIONAL_PLAN_DIRECTORIES.map(async (relativePath) => ({
        relativePath,
        exists: await exists(join(workspacePath, relativePath)),
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
    const artifactDirectoryPaths = Array.from(
      new Set([
        ...matchedDirectories
          .filter((name) => name !== "memory" && name !== "skills")
          .map((name) => join(workspacePath, name)),
        ...(await Promise.all(
          ["tmp", "artifacts"].map(async (name) =>
            (await exists(join(workspacePath, name))) ? join(workspacePath, name) : null,
          ),
        )).filter((path): path is string => Boolean(path)),
      ]),
    );
    const planDirectoryPaths = planChecks
      .filter((entry) => entry.exists)
      .map((entry) => join(workspacePath, entry.relativePath));

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
      planDirectoryPaths,
      recentMemoryPaths: [],
      planFilePaths: [],
      artifactFilePaths: [],
      artifactFileCount: 0,
      bridgeNotePaths: [],
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
      planDirectoryPaths: [],
      recentMemoryPaths: [],
      planFilePaths: [],
      artifactFilePaths: [],
      artifactFileCount: 0,
      bridgeNotePaths: [],
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
  const allDirectoryPaths: string[] = [];
  const collectFilePaths = (entries: FileEntry[]) => {
    for (const entry of entries) {
      if (entry.is_dir) {
        allDirectoryPaths.push(entry.path);
        if (Array.isArray(entry.children)) {
          collectFilePaths(entry.children);
        }
        continue;
      }
      allFilePaths.push(entry.path);
    }
  };
  collectFilePaths(fileTree);

  const relativeFilePaths = allFilePaths.map((path) => ({
    absolutePath: path,
    relativePath: toRelativeWorkspacePath(workspacePath, path),
  }));
  const relativeDirectoryPaths = allDirectoryPaths.map((path) => ({
    absolutePath: path,
    relativePath: toRelativeWorkspacePath(workspacePath, path),
  }));

  const recentMemoryPaths = allFilePaths
    .filter((path) => path.startsWith(join(workspacePath, "memory")) && path.toLowerCase().endsWith(".md"))
    .sort((left, right) => right.localeCompare(left))
    .slice(0, 8);
  const artifactFilePaths = relativeFilePaths
    .filter(({ relativePath }) => isArtifactRelativePath(relativePath))
    .map(({ absolutePath }) => absolutePath)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 12);
  const artifactDirectoryPaths = Array.from(
    new Set(
      relativeFilePaths
        .map(({ relativePath }) => getArtifactDirectoryForRelativePath(workspacePath, relativePath))
        .filter((path): path is string => Boolean(path)),
    ),
  );
  const planDirectoryPaths = Array.from(
    new Set(
      relativeDirectoryPaths
        .filter(({ relativePath }) => isPlanRelativePath(relativePath))
        .map(({ absolutePath }) => absolutePath),
    ),
  ).sort((left, right) => left.localeCompare(right));
  const planFilePaths = relativeFilePaths
    .filter(({ relativePath }) => isPlanRelativePath(relativePath))
    .map(({ absolutePath }) => absolutePath)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 8);
  const bridgeNotePaths = relativeFilePaths
    .filter(({ relativePath }) => isBridgeRelativePath(relativePath))
    .map(({ absolutePath }) => absolutePath)
    .sort((left, right) => right.localeCompare(left))
    .slice(0, 8);

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
    artifactDirectoryPaths,
    planDirectoryPaths,
    recentMemoryPaths,
    planFilePaths,
    artifactFilePaths,
    artifactFileCount: relativeFilePaths.filter(({ relativePath }) => isArtifactRelativePath(relativePath))
      .length,
    bridgeNotePaths,
    editablePriorityFiles: [...matchedRequiredFiles, ...matchedOptionalFiles],
    indexingScope: "shared-workspace",
    gatewayEnabled: false,
    error: null,
  };
}
