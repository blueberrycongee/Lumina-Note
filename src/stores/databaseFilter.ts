import type { CellValue, DatabaseColumn, DatabaseRow, FilterGroup, FilterRule } from "@/types/database";

export function applyFilters(rows: DatabaseRow[], filterGroup: FilterGroup, columns: DatabaseColumn[]): DatabaseRow[] {
  return rows.filter((row) => evaluateFilterGroup(row, filterGroup, columns));
}

export function evaluateFilterGroup(row: DatabaseRow, group: FilterGroup, columns: DatabaseColumn[]): boolean {
  if (group.rules.length === 0) return true;

  const results = group.rules.map((rule) => {
    if ("type" in rule) {
      return evaluateFilterGroup(row, rule as FilterGroup, columns);
    }
    return evaluateFilterRule(row, rule as FilterRule, columns);
  });

  return group.type === "and" ? results.every(Boolean) : results.some(Boolean);
}

export function evaluateFilterRule(
  row: DatabaseRow,
  rule: Pick<FilterRule, "columnId" | "operator" | "value">,
  columns: DatabaseColumn[],
): boolean {
  const cellValue = row.cells[rule.columnId];
  const column = columns.find((c) => c.id === rule.columnId);
  if (!column) return true;

  switch (rule.operator) {
    case "is_empty":
      return isEmptyCellValue(cellValue);
    case "is_not_empty":
      return !isEmptyCellValue(cellValue);
    case "equals":
      return equalsValue(cellValue, rule.value);
    case "not_equals":
      return !equalsValue(cellValue, rule.value);
    case "contains":
      return containsValue(cellValue, rule.value);
    case "not_contains":
      return !containsValue(cellValue, rule.value);
    case "starts_with":
      return startsWithValue(cellValue, rule.value);
    case "ends_with":
      return endsWithValue(cellValue, rule.value);
    case "is_checked":
      return cellValue === true;
    case "is_not_checked":
      return cellValue !== true;
    case "greater_than":
      return compareOrdering(cellValue, rule.value) > 0;
    case "less_than":
      return compareOrdering(cellValue, rule.value) < 0;
    case "greater_equal":
      return compareOrdering(cellValue, rule.value) >= 0;
    case "less_equal":
      return compareOrdering(cellValue, rule.value) <= 0;
    case "date_is":
      return getDateOnly(cellValue) !== null && getDateOnly(cellValue) === getDateOnly(rule.value);
    case "date_before":
      return compareDate(cellValue, rule.value) < 0;
    case "date_after":
      return compareDate(cellValue, rule.value) > 0;
    default:
      return true;
  }
}

function isEmptyCellValue(value: CellValue | undefined): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (isDateLike(value)) return !value.start;
  return false;
}

function equalsValue(left: CellValue | undefined, right: CellValue): boolean {
  if (Array.isArray(left) && typeof right === "string") {
    return left.includes(right);
  }
  if (isDateLike(left) || isDateLike(right)) {
    return getDateOnly(left) !== null && getDateOnly(left) === getDateOnly(right);
  }
  return left === right;
}

function containsValue(left: CellValue | undefined, right: CellValue): boolean {
  if (Array.isArray(left) && typeof right === "string") {
    return left.includes(right);
  }
  if (typeof left === "string") {
    return left.toLocaleLowerCase().includes(String(right ?? "").toLocaleLowerCase());
  }
  return false;
}

function startsWithValue(left: CellValue | undefined, right: CellValue): boolean {
  if (typeof left !== "string") return false;
  return left.toLocaleLowerCase().startsWith(String(right ?? "").toLocaleLowerCase());
}

function endsWithValue(left: CellValue | undefined, right: CellValue): boolean {
  if (typeof left !== "string") return false;
  return left.toLocaleLowerCase().endsWith(String(right ?? "").toLocaleLowerCase());
}

function compareOrdering(left: CellValue | undefined, right: CellValue): number {
  const leftNumber = toNumber(left);
  const rightNumber = toNumber(right);
  if (leftNumber !== null && rightNumber !== null) {
    return leftNumber - rightNumber;
  }

  const leftDate = toDateTimestamp(left);
  const rightDate = toDateTimestamp(right);
  if (leftDate !== null && rightDate !== null) {
    return leftDate - rightDate;
  }

  return Number.NaN;
}

function compareDate(left: CellValue | undefined, right: CellValue): number {
  const leftDate = toDateTimestamp(left);
  const rightDate = toDateTimestamp(right);
  if (leftDate === null || rightDate === null) return Number.NaN;
  return leftDate - rightDate;
}

function toNumber(value: CellValue | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getDateOnly(value: CellValue | undefined): string | null {
  if (isDateLike(value)) {
    return getDateOnlyString(value.start);
  }
  if (typeof value === "string") {
    return getDateOnlyString(value);
  }
  return null;
}

function getDateOnlyString(value: string): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10);
}

function toDateTimestamp(value: CellValue | undefined): number | null {
  if (isDateLike(value)) {
    const parsed = Date.parse(value.start);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function isDateLike(value: unknown): value is { start: string; end?: string } {
  return Boolean(value && typeof value === "object" && "start" in (value as Record<string, unknown>));
}
