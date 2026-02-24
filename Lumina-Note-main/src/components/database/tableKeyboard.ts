export type CellMoveAction = "next" | "prev" | "up" | "down" | "left" | "right";

export interface CellPosition {
  rowIndex: number;
  columnIndex: number;
}

export function resolveCellMove(
  current: CellPosition,
  action: CellMoveAction,
  rowCount: number,
  columnCount: number,
): CellPosition | null {
  if (rowCount <= 0 || columnCount <= 0) return null;
  if (current.rowIndex < 0 || current.rowIndex >= rowCount) return null;
  if (current.columnIndex < 0 || current.columnIndex >= columnCount) return null;

  const total = rowCount * columnCount;
  const currentLinear = current.rowIndex * columnCount + current.columnIndex;

  const fromLinear = (index: number): CellPosition => ({
    rowIndex: Math.floor(index / columnCount),
    columnIndex: index % columnCount,
  });

  switch (action) {
    case "next": {
      const next = currentLinear + 1;
      return next < total ? fromLinear(next) : null;
    }
    case "prev": {
      const prev = currentLinear - 1;
      return prev >= 0 ? fromLinear(prev) : null;
    }
    case "up":
      return current.rowIndex > 0
        ? { rowIndex: current.rowIndex - 1, columnIndex: current.columnIndex }
        : null;
    case "down":
      return current.rowIndex < rowCount - 1
        ? { rowIndex: current.rowIndex + 1, columnIndex: current.columnIndex }
        : null;
    case "left":
      return current.columnIndex > 0
        ? { rowIndex: current.rowIndex, columnIndex: current.columnIndex - 1 }
        : null;
    case "right":
      return current.columnIndex < columnCount - 1
        ? { rowIndex: current.rowIndex, columnIndex: current.columnIndex + 1 }
        : null;
    default:
      return null;
  }
}
