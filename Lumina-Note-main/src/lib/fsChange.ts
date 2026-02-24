export type FsChangePayload =
  | { type: "Created" | "Modified" | "Deleted"; path?: string }
  | { type: "Renamed"; old_path?: string; new_path?: string }
  | { type: string; [key: string]: unknown };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function getFsChangePath(payload: FsChangePayload | null | undefined): string | null {
  if (!payload || typeof payload !== "object") return null;

  switch (payload.type) {
    case "Created":
    case "Modified":
      return isNonEmptyString(payload.path) ? payload.path : null;
    case "Renamed":
      return isNonEmptyString(payload.new_path) ? payload.new_path : null;
    default:
      return null;
  }
}

export function handleFsChangeEvent(
  payload: FsChangePayload | null | undefined,
  onReloadPath: (path: string) => void,
): void {
  const path = getFsChangePath(payload);
  if (!path) return;
  onReloadPath(path);
}

