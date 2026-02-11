import { describe, expect, it } from "vitest";
import type { DatabaseColumn, DatabaseRow, FilterGroup } from "@/types/database";
import { applyFilters } from "./databaseFilter";

const columns: DatabaseColumn[] = [
  { id: "title", name: "Title", type: "text" },
  { id: "score", name: "Score", type: "number" },
  { id: "due", name: "Due", type: "date" },
];

const rows: DatabaseRow[] = [
  {
    id: "1",
    notePath: "a.md",
    noteTitle: "Alpha",
    cells: { title: "Alpha Task", score: 8, due: { start: "2026-02-10" } },
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
  },
  {
    id: "2",
    notePath: "b.md",
    noteTitle: "Beta",
    cells: { title: "Beta Plan", score: 5, due: { start: "2026-02-14" } },
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
  },
];

function group(operator: string, value: unknown): FilterGroup {
  return {
    type: "and",
    rules: [
      {
        id: "r1",
        columnId: operator.startsWith("date_") ? "due" : operator.includes("equal") || operator.includes("greater") || operator.includes("less") ? "score" : "title",
        operator: operator as any,
        value: value as any,
      },
    ],
  };
}

describe("databaseFilter high-frequency operators", () => {
  it("supports starts_with / ends_with", () => {
    expect(applyFilters(rows, group("starts_with", "alpha"), columns)).toHaveLength(1);
    expect(applyFilters(rows, group("ends_with", "plan"), columns)).toHaveLength(1);
  });

  it("supports greater_equal / less_equal", () => {
    expect(applyFilters(rows, group("greater_equal", 8), columns)).toHaveLength(1);
    expect(applyFilters(rows, group("less_equal", 5), columns)).toHaveLength(1);
  });

  it("supports date_before / date_after", () => {
    expect(applyFilters(rows, group("date_before", "2026-02-12"), columns)).toHaveLength(1);
    expect(applyFilters(rows, group("date_after", "2026-02-12"), columns)).toHaveLength(1);
  });
});
