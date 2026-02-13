import type { Database, DatabaseColumn, SelectColor, SelectOption } from "@/types/database";
import { SELECT_COLORS } from "@/types/database";

const DEFAULT_SELECT_COLOR: SelectColor = "gray";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isSelectColor(value: unknown): value is SelectColor {
  return typeof value === "string" && value in SELECT_COLORS;
}

function createFallbackOptionId(name: string, index: number): string {
  const trimmedName = name.trim();
  if (trimmedName) {
    return trimmedName;
  }
  return `option-${index + 1}`;
}

function ensureUniqueOptionId(baseId: string, usedIds: Set<string>): string {
  if (!usedIds.has(baseId)) {
    usedIds.add(baseId);
    return baseId;
  }

  let suffix = 2;
  let candidate = `${baseId}-${suffix}`;
  while (usedIds.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}-${suffix}`;
  }
  usedIds.add(candidate);
  return candidate;
}

function normalizeSingleSelectOption(option: unknown, index: number, usedIds: Set<string>): SelectOption | null {
  if (typeof option === "string") {
    const name = option.trim();
    if (!name) return null;
    const id = ensureUniqueOptionId(createFallbackOptionId(name, index), usedIds);
    return { id, name, color: DEFAULT_SELECT_COLOR };
  }

  if (!isObjectRecord(option)) return null;

  const rawId = normalizeText(option.id);
  const rawName = normalizeText(option.name);
  const name = rawName || rawId || `Option ${index + 1}`;
  const color = isSelectColor(option.color) ? option.color : DEFAULT_SELECT_COLOR;
  const id = ensureUniqueOptionId(rawId || createFallbackOptionId(name, index), usedIds);

  return { id, name, color };
}

export function normalizeSelectOptions(options: unknown): SelectOption[] {
  if (!Array.isArray(options)) return [];

  const usedIds = new Set<string>();
  const normalized: SelectOption[] = [];

  options.forEach((option, index) => {
    const parsed = normalizeSingleSelectOption(option, index, usedIds);
    if (parsed) {
      normalized.push(parsed);
    }
  });

  return normalized;
}

export function getSelectColorClasses(color: unknown) {
  if (isSelectColor(color)) {
    return SELECT_COLORS[color];
  }
  return SELECT_COLORS[DEFAULT_SELECT_COLOR];
}

export function normalizeDatabaseColumns(columns: DatabaseColumn[]): DatabaseColumn[] {
  return columns.map((column) => {
    if (column.type !== "select" && column.type !== "multi-select") {
      return column;
    }
    return {
      ...column,
      options: normalizeSelectOptions(column.options),
    };
  });
}

export function normalizeDatabaseDefinition(database: Database): Database {
  return {
    ...database,
    columns: normalizeDatabaseColumns(database.columns || []),
  };
}
