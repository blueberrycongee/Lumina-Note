import { describe, expect, it } from "vitest";
import type { DatabaseColumn, DatabaseRow } from "@/types/database";
import { applyFormulaColumns, evaluateFormulaExpression } from "./databaseFormula";

const baseColumns: DatabaseColumn[] = [
  { id: "title", name: "Title", type: "text" },
  { id: "estimate", name: "Estimate", type: "number" },
  { id: "rate", name: "Rate", type: "number" },
];

const baseRow: DatabaseRow = {
  id: "row-1",
  notePath: "task.md",
  noteTitle: "Task A",
  cells: { title: "Task A", estimate: 3, rate: 40 },
  createdAt: "2026-02-11T00:00:00.000Z",
  updatedAt: "2026-02-11T00:00:00.000Z",
};

describe("databaseFormula", () => {
  it("evaluates arithmetic expression with prop and brace references", () => {
    const result = evaluateFormulaExpression(
      '=prop("Estimate") * {rate}',
      baseRow,
      baseColumns,
    );
    expect(result).toBe(120);
  });

  it("supports string functions and logical branches", () => {
    const result = evaluateFormulaExpression(
      'if({estimate} >= 3, concat(upper({title}), " ✅"), "skip")',
      baseRow,
      baseColumns,
    );
    expect(result).toBe("TASK A ✅");
  });

  it("computes dependent formula columns in a bounded pass", () => {
    const columns: DatabaseColumn[] = [
      ...baseColumns,
      { id: "double", name: "Double", type: "formula", formula: "{estimate} * 2" },
      { id: "label", name: "Label", type: "formula", formula: 'concat("E=", {double})' },
    ];
    const [row] = applyFormulaColumns([baseRow], columns);
    expect(row.cells.double).toBe(6);
    expect(row.cells.label).toBe("E=6");
  });

  it("returns null for invalid or unsafe expressions", () => {
    expect(evaluateFormulaExpression("window.alert(1)", baseRow, baseColumns)).toBeNull();
    expect(evaluateFormulaExpression("`bad`", baseRow, baseColumns)).toBeNull();
  });
});
