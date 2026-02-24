import type { CellValue, DatabaseColumn, DatabaseRow, DateValue } from "@/types/database";

export interface CalendarDayCell {
  date: Date;
  key: string;
  inCurrentMonth: boolean;
}

export function resolveCalendarDateColumnId(columns: DatabaseColumn[], current?: string): string | null {
  const dateColumns = columns.filter((column) => column.type === "date");
  if (dateColumns.length === 0) return null;
  if (current && dateColumns.some((column) => column.id === current)) return current;
  return dateColumns[0].id;
}

export function buildMonthGrid(monthDate: Date): CalendarDayCell[] {
  const monthStart = startOfMonth(monthDate);
  const firstWeekday = monthStart.getDay();
  const gridStart = addDays(monthStart, -firstWeekday);

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    return {
      date,
      key: toDateKey(date),
      inCurrentMonth: date.getMonth() === monthStart.getMonth() && date.getFullYear() === monthStart.getFullYear(),
    };
  });
}

export function splitRowsByCalendarDate(rows: DatabaseRow[], dateColumnId: string): {
  grouped: Record<string, DatabaseRow[]>;
  undated: DatabaseRow[];
} {
  const grouped: Record<string, DatabaseRow[]> = {};
  const undated: DatabaseRow[] = [];

  for (const row of rows) {
    const cellValue = row.cells[dateColumnId];
    const dateKey = extractDateKey(cellValue);
    if (!dateKey) {
      undated.push(row);
      continue;
    }
    grouped[dateKey] ??= [];
    grouped[dateKey].push(row);
  }

  return { grouped, undated };
}

export function extractDateKey(value: CellValue | undefined): string | null {
  if (isDateValue(value)) return parseDateKey(value.start);
  if (typeof value === "string") return parseDateKey(value);
  return null;
}

export function parseDateKey(input: string): string | null {
  if (!input) return null;
  const match = input.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return null;
  return toDateKey(parsed);
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, offset: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

export function addDays(date: Date, offset: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
}

function isDateValue(value: unknown): value is DateValue {
  return Boolean(value && typeof value === "object" && "start" in (value as Record<string, unknown>));
}
