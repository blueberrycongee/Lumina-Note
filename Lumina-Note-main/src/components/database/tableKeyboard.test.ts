import { describe, expect, it } from "vitest";
import { resolveCellMove } from "./tableKeyboard";

describe("resolveCellMove", () => {
  it("moves to next cell and wraps to next row", () => {
    expect(resolveCellMove({ rowIndex: 0, columnIndex: 0 }, "next", 2, 3)).toEqual({
      rowIndex: 0,
      columnIndex: 1,
    });
    expect(resolveCellMove({ rowIndex: 0, columnIndex: 2 }, "next", 2, 3)).toEqual({
      rowIndex: 1,
      columnIndex: 0,
    });
  });

  it("moves to previous cell and wraps to previous row", () => {
    expect(resolveCellMove({ rowIndex: 1, columnIndex: 0 }, "prev", 2, 3)).toEqual({
      rowIndex: 0,
      columnIndex: 2,
    });
  });

  it("returns null when movement would go out of bounds", () => {
    expect(resolveCellMove({ rowIndex: 0, columnIndex: 0 }, "prev", 2, 3)).toBeNull();
    expect(resolveCellMove({ rowIndex: 0, columnIndex: 0 }, "up", 2, 3)).toBeNull();
    expect(resolveCellMove({ rowIndex: 1, columnIndex: 2 }, "next", 2, 3)).toBeNull();
    expect(resolveCellMove({ rowIndex: 1, columnIndex: 2 }, "down", 2, 3)).toBeNull();
    expect(resolveCellMove({ rowIndex: 1, columnIndex: 2 }, "right", 2, 3)).toBeNull();
  });
});
