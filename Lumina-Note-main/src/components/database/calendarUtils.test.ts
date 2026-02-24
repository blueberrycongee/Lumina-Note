import { describe, expect, it } from "vitest";
import type { DatabaseColumn, DatabaseRow } from "@/types/database";
import { buildMonthGrid, extractDateKey, resolveCalendarDateColumnId, splitRowsByCalendarDate } from "./calendarUtils";

describe("calendarUtils", () => {
  it("resolves date-column mapping with fallback", () => {
    const columns: DatabaseColumn[] = [
      { id: "title", name: "Title", type: "text" },
      { id: "due", name: "Due", type: "date" },
      { id: "end", name: "End", type: "date" },
    ];

    expect(resolveCalendarDateColumnId(columns, "end")).toBe("end");
    expect(resolveCalendarDateColumnId(columns, "missing")).toBe("due");
    expect(resolveCalendarDateColumnId(columns)).toBe("due");
  });

  it("builds month grid with 42 cells", () => {
    const grid = buildMonthGrid(new Date("2026-02-11T00:00:00"));
    expect(grid).toHaveLength(42);
    expect(grid.some((cell) => cell.key === "2026-02-01")).toBe(true);
    expect(grid.some((cell) => cell.key === "2026-02-28")).toBe(true);
  });

  it("splits rows into dated and undated buckets", () => {
    const rows: DatabaseRow[] = [
      {
        id: "1",
        notePath: "a.md",
        noteTitle: "A",
        cells: { due: { start: "2026-02-08" } },
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "2",
        notePath: "b.md",
        noteTitle: "B",
        cells: { due: null },
        createdAt: "",
        updatedAt: "",
      },
    ];

    const { grouped, undated } = splitRowsByCalendarDate(rows, "due");
    expect(grouped["2026-02-08"]).toHaveLength(1);
    expect(undated).toHaveLength(1);
  });

  it("extracts stable date keys from date-like values", () => {
    expect(extractDateKey({ start: "2026-02-18T08:45:00.000Z" })).toBe("2026-02-18");
    expect(extractDateKey("2026-02-19")).toBe("2026-02-19");
    expect(extractDateKey("invalid-date")).toBeNull();
  });
});
