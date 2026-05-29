export type FsChangePayload =
  | {
      kind?: "created" | "modified" | "deleted" | "renamed";
      type?: string;
      path?: string;
      oldPath?: string;
      old_path?: string;
      newPath?: string;
      new_path?: string;
      isDirectory?: boolean;
      is_dir?: boolean;
    }
  | { type: "Created" | "Modified" | "Deleted"; path?: string }
  | { type: "Renamed"; old_path?: string; new_path?: string }
  | { type: string; [key: string]: unknown };

export type NormalizedFsChangeKind =
  | "created"
  | "modified"
  | "deleted"
  | "renamed";

export interface NormalizedFsChange {
  kind: NormalizedFsChangeKind;
  path: string;
  oldPath?: string;
  isDirectory: boolean;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function getFsChangePath(payload: FsChangePayload | null | undefined): string | null {
  return normalizeFsChange(payload)?.path ?? null;
}

function normalizeKind(value: unknown): NormalizedFsChangeKind | null {
  if (typeof value !== "string") return null;
  switch (value) {
    case "created":
    case "create":
    case "add":
    case "addDir":
    case "Created":
      return "created";
    case "modified":
    case "modify":
    case "change":
    case "Changed":
    case "Modified":
      return "modified";
    case "deleted":
    case "delete":
    case "remove":
    case "unlink":
    case "unlinkDir":
    case "Deleted":
      return "deleted";
    case "renamed":
    case "rename":
    case "Renamed":
      return "renamed";
    default:
      return null;
  }
}

export function normalizeFsChange(
  payload: FsChangePayload | null | undefined,
): NormalizedFsChange | null {
  if (!payload || typeof payload !== "object") return null;

  const kind = normalizeKind(
    "kind" in payload ? payload.kind : undefined,
  ) ?? normalizeKind("type" in payload ? payload.type : undefined);
  if (!kind) return null;

  const newPath =
    "newPath" in payload && isNonEmptyString(payload.newPath)
      ? payload.newPath
      : "new_path" in payload && isNonEmptyString(payload.new_path)
        ? payload.new_path
        : "path" in payload && isNonEmptyString(payload.path)
          ? payload.path
          : null;
  if (!newPath) return null;

  const oldPath =
    "oldPath" in payload && isNonEmptyString(payload.oldPath)
      ? payload.oldPath
      : "old_path" in payload && isNonEmptyString(payload.old_path)
        ? payload.old_path
        : undefined;
  if (kind === "renamed" && !oldPath) return null;

  const isDirectory =
    ("isDirectory" in payload && payload.isDirectory === true) ||
    ("is_dir" in payload && payload.is_dir === true) ||
    payload.type === "addDir" ||
    payload.type === "unlinkDir";

  return {
    kind,
    path: newPath,
    oldPath,
    isDirectory,
  };
}

export function handleNormalizedFsChangeEvent(
  payload: FsChangePayload | null | undefined,
  onChange: (change: NormalizedFsChange) => void,
): void {
  const change = normalizeFsChange(payload);
  if (!change) return;
  onChange(change);
}

export function handleFsChangeEvent(
  payload: FsChangePayload | null | undefined,
  onReloadPath: (path: string) => void,
): void {
  const change = normalizeFsChange(payload);
  if (!change) return;
  onReloadPath(change.path);
}

export function isFsChangeInsideRoot(change: NormalizedFsChange, root: string): boolean {
  const normalize = (path: string) => path.replace(/\\/g, "/");
  const normalizedRoot = normalize(root).replace(/\/+$/, "");
  const isInside = (path: string) => {
    const normalizedPath = normalize(path);
    return (
      normalizedPath === normalizedRoot ||
      normalizedPath.startsWith(`${normalizedRoot}/`)
    );
  };

  if (isInside(change.path)) return true;
  return Boolean(change.oldPath && isInside(change.oldPath));
}

export function getFsChangeAffectedPaths(change: NormalizedFsChange): string[] {
  if (change.kind === "renamed" && change.oldPath) {
    return [change.oldPath, change.path];
  }
  return [change.path];
}

function getParentPath(path: string): string | null {
  const trimmed = path.replace(/[\\/]+$/, "");
  const slashIndex = Math.max(
    trimmed.lastIndexOf("/"),
    trimmed.lastIndexOf("\\"),
  );
  if (slashIndex <= 0) return null;
  return trimmed.slice(0, slashIndex);
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function getFsChangeAffectedDirectoryPaths(
  change: NormalizedFsChange,
  root: string,
): string[] {
  const rootNormalized = normalizePath(root);
  const directories = new Map<string, string>();
  const addParent = (path: string) => {
    const normalizedPath = normalizePath(path);
    const parent =
      normalizedPath === rootNormalized ? root : getParentPath(path);
    if (!parent) return;
    const normalizedParent = normalizePath(parent);
    if (
      normalizedParent !== rootNormalized &&
      !normalizedParent.startsWith(`${rootNormalized}/`)
    ) {
      return;
    }
    directories.set(normalizedParent, parent);
  };

  addParent(change.path);
  if (change.kind === "renamed" && change.oldPath) {
    addParent(change.oldPath);
  }

  return [...directories.values()];
}
