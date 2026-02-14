import type { Translations } from "@/i18n";

function normalizePathForDisplay(path: string): string {
  return path.replace(/\\/g, "/");
}

function extractForbiddenPath(detail: string): string | null {
  const pluginFsMatch = detail.match(/forbidden path:\s*(.+)$/i);
  if (pluginFsMatch?.[1]) return pluginFsMatch[1].trim();
  const rustFsMatch = detail.match(/Path not permitted:\s*(.+)$/i);
  if (rustFsMatch?.[1]) return rustFsMatch[1].trim();
  return null;
}

function toErrorDetail(error: unknown): string {
  if (error instanceof Error) return error.message || "";
  if (typeof error === "string") return error;
  if (error === null || error === undefined) return "";
  return String(error);
}

export function formatDatabaseActionError(
  t: Translations,
  actionLabel: string,
  error: unknown,
): string {
  const detail = toErrorDetail(error).trim();

  if (/No vault path/i.test(detail)) {
    return t.common.openWorkspaceFirst;
  }

  const prefix = `${t.common.error} (${actionLabel})`;
  if (!detail) {
    return `${prefix}: ${t.common.unknownError}`;
  }

  const forbiddenPath = extractForbiddenPath(detail);
  if (forbiddenPath) {
    return `${prefix}: ${detail}\n${normalizePathForDisplay(forbiddenPath)}`;
  }

  return `${prefix}: ${detail}`;
}
