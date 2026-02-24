import type { DatabaseColumn } from "@/types/database";

export function resolveKanbanGroupColumnId(columns: DatabaseColumn[], current?: string): string | null {
  const groupColumns = columns.filter((column) => column.type === "select" || column.type === "multi-select");
  if (groupColumns.length === 0) return null;
  if (current && groupColumns.some((column) => column.id === current)) return current;
  return groupColumns[0].id;
}
