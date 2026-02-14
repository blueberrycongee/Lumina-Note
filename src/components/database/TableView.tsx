import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useDatabaseStore } from "@/stores/useDatabaseStore";
import { useUIStore } from "@/stores/useUIStore";
import { useSplitStore } from "@/stores/useSplitStore";
import { DatabaseCell } from "./cells/DatabaseCell";
import { ColumnHeader } from "./ColumnHeader";
import type { CellCommitAction } from "./cells/types";
import { resolveCellMove } from "./tableKeyboard";
import { DatabaseIconButton, DatabaseMenuSurface } from "./primitives";
import { formatDatabaseActionError } from "./actionErrors";
import { Plus, MoreHorizontal, Trash2, Copy, FileText, Loader2, Check, AlertCircle } from "lucide-react";
import { useLocaleStore } from "@/stores/useLocaleStore";

interface TableViewProps {
  dbId: string;
}

export function TableView({ dbId }: TableViewProps) {
  const { t } = useLocaleStore();
  const {
    databases,
    addRow,
    addColumn,
    deleteRow,
    duplicateRow,
    editingCell,
    setEditingCell,
    getFilteredSortedRows,
  } = useDatabaseStore();
  
  const db = databases[dbId];
  const rows = useMemo(() => getFilteredSortedRows(dbId), [dbId, getFilteredSortedRows, db?.rows, db?.views]);
  
  // 分栏视图
  const { splitView, toggleSplitView } = useUIStore();
  const { openSecondaryFile } = useSplitStore();
  
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [rowMenuOpen, setRowMenuOpen] = useState<string | null>(null);
  const [, setDraggedColumn] = useState<string | null>(null);
  const [cellStatus, setCellStatus] = useState<Record<string, "saving" | "saved" | "error">>({});
  
  const tableRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Record<string, HTMLTableCellElement | null>>({});
  const statusTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  
  const handleAddColumn = useCallback(() => {
    addColumn(dbId, { name: t.database.newColumn, type: 'text' });
  }, [dbId, addColumn, t.database.newColumn]);

  const showActionError = useCallback((actionLabel: string, error: unknown) => {
    alert(formatDatabaseActionError(t, actionLabel, error));
  }, [t]);

  const handleAddRow = useCallback(async () => {
    try {
      await addRow(dbId);
    } catch (error) {
      showActionError(t.database.newRow, error);
    }
  }, [addRow, dbId, showActionError, t.database.newRow]);

  const handleDuplicateRow = useCallback(async (rowId: string) => {
    try {
      await duplicateRow(dbId, rowId);
      setRowMenuOpen(null);
    } catch (error) {
      showActionError(t.database.copyRow, error);
    }
  }, [dbId, duplicateRow, showActionError, t.database.copyRow]);

  const handleDeleteRow = useCallback(async (rowId: string) => {
    try {
      await deleteRow(dbId, rowId);
      setRowMenuOpen(null);
    } catch (error) {
      showActionError(t.database.deleteRow, error);
    }
  }, [dbId, deleteRow, showActionError, t.database.deleteRow]);
  
  const handleCellClick = useCallback((rowId: string, columnId: string) => {
    setEditingCell({ rowId, columnId });
  }, [setEditingCell]);

  const getCellKey = useCallback((rowId: string, columnId: string) => `${rowId}::${columnId}`, []);

  const columns = db?.columns || [];

  useEffect(() => {
    return () => {
      Object.values(statusTimersRef.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const handleCellSaveState = useCallback((rowId: string, columnId: string, state: "idle" | "saving" | "saved" | "error") => {
    const cellKey = getCellKey(rowId, columnId);
    const timers = statusTimersRef.current;

    if (timers[cellKey]) {
      clearTimeout(timers[cellKey]);
      delete timers[cellKey];
    }

    if (state === "idle") {
      setCellStatus((prev) => {
        const { [cellKey]: _, ...rest } = prev;
        return rest;
      });
      return;
    }

    setCellStatus((prev) => ({ ...prev, [cellKey]: state }));

    if (state === "saved" || state === "error") {
      timers[cellKey] = setTimeout(() => {
        setCellStatus((prev) => {
          const { [cellKey]: _, ...rest } = prev;
          return rest;
        });
        delete timers[cellKey];
      }, state === "saved" ? 1200 : 2000);
    }
  }, [getCellKey]);

  const focusCell = useCallback((rowIndex: number, columnIndex: number, startEditing = false) => {
    const row = rows[rowIndex];
    const column = columns[columnIndex];
    if (!row || !column) return;

    const key = getCellKey(row.id, column.id);
    const target = cellRefs.current[key];
    target?.focus();

    if (startEditing) {
      setEditingCell({ rowId: row.id, columnId: column.id });
    }
  }, [columns, getCellKey, rows, setEditingCell]);

  const handleCellBlur = useCallback((rowIndex: number, colIndex: number, action?: CellCommitAction) => {
    setEditingCell(null);

    if (!action) return;

    const target = resolveCellMove(
      { rowIndex, columnIndex: colIndex },
      action,
      rows.length,
      columns.length,
    );
    if (!target) return;

    requestAnimationFrame(() => {
      focusCell(target.rowIndex, target.columnIndex, true);
    });
  }, [columns.length, focusCell, rows.length, setEditingCell]);

  const handleCellKeyDown = useCallback((
    e: React.KeyboardEvent<HTMLTableCellElement>,
    rowIndex: number,
    columnIndex: number,
    rowId: string,
    columnId: string,
  ) => {
    const isCellEditing = editingCell?.rowId === rowId && editingCell?.columnId === columnId;
    if (isCellEditing) return;

    if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      setEditingCell({ rowId, columnId });
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const target = resolveCellMove(
        { rowIndex, columnIndex },
        e.shiftKey ? "prev" : "next",
        rows.length,
        columns.length,
      );
      if (target) {
        focusCell(target.rowIndex, target.columnIndex, false);
      }
      return;
    }

    if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const action = e.key === "ArrowUp"
        ? "up"
        : e.key === "ArrowDown"
          ? "down"
          : e.key === "ArrowLeft"
            ? "left"
            : "right";
      const target = resolveCellMove(
        { rowIndex, columnIndex },
        action,
        rows.length,
        columns.length,
      );
      if (target) {
        focusCell(target.rowIndex, target.columnIndex, false);
      }
      return;
    }
  }, [columns.length, editingCell?.columnId, editingCell?.rowId, focusCell, rows.length, setEditingCell]);
  
  // 在分栏中打开笔记
  const handleOpenInSplit = useCallback((notePath: string) => {
    if (!splitView) {
      toggleSplitView();
    }
    openSecondaryFile(notePath);
  }, [splitView, toggleSplitView, openSecondaryFile]);
  
  if (!db) return null;
  
  return (
    <div className="h-full overflow-x-auto overflow-y-auto bg-background" ref={tableRef}>
      <table className="border-collapse min-w-max" role="grid" aria-label={db.name}>
        {/* 表头 */}
        <thead className="sticky top-0 z-10 bg-background">
          <tr>
            {/* 行操作列 */}
            <th className="w-10 p-0 border-b border-r border-border" />
            
            {columns.map((column) => (
              <ColumnHeader
                key={column.id}
                dbId={dbId}
                column={column}
                onDragStart={() => setDraggedColumn(column.id)}
                onDragEnd={() => setDraggedColumn(null)}
              />
            ))}
            
            {/* 新增列按钮 */}
            <th className="w-10 p-0 border-b border-border">
              <DatabaseIconButton
                onClick={handleAddColumn}
                className="w-full h-9 rounded-none"
                aria-label={t.database.newColumn}
                title={t.database.newColumn}
              >
                <Plus className="w-4 h-4" />
              </DatabaseIconButton>
            </th>
          </tr>
        </thead>
        
        {/* 表体 */}
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={row.id}
              className={`group ${hoveredRow === row.id ? 'bg-accent' : ''}`}
              onMouseEnter={() => setHoveredRow(row.id)}
              onMouseLeave={() => setHoveredRow(null)}
            >
              {/* 行操作 */}
              <td className="w-10 p-0 border-b border-r border-border relative">
                <div className="flex items-center justify-center h-9">
                  {hoveredRow === row.id ? (
                    <div className="relative">
                      <DatabaseIconButton
                        onClick={() => setRowMenuOpen(rowMenuOpen === row.id ? null : row.id)}
                        aria-label={t.common.settings}
                        title={t.common.settings}
                      >
                        <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                      </DatabaseIconButton>
                      
                      {rowMenuOpen === row.id && (
                        <DatabaseMenuSurface className="absolute left-0 top-full mt-1 py-1 min-w-[140px] z-50">
                          <button
                            onClick={() => {
                              void handleDuplicateRow(row.id);
                            }}
                            className="db-menu-item"
                          >
                          <Copy className="w-4 h-4" /> {t.database.copyRow}
                          </button>
                          <button
                            onClick={() => {
                              void handleDeleteRow(row.id);
                            }}
                            className="db-menu-item db-menu-item-danger"
                          >
                          <Trash2 className="w-4 h-4" /> {t.database.deleteRow}
                          </button>
                        </DatabaseMenuSurface>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">{rowIndex + 1}</span>
                  )}
                </div>
              </td>
              
              {/* 数据单元格 */}
              {columns.map((column, colIndex) => (
                <td
                  key={column.id}
                  ref={(el) => {
                    cellRefs.current[getCellKey(row.id, column.id)] = el;
                  }}
                  className={`db-focus-ring relative p-0 border-b border-r border-border ${
                    editingCell?.rowId === row.id && editingCell?.columnId === column.id
                      ? 'ring-2 ring-primary ring-inset bg-primary/[0.06]'
                      : cellStatus[getCellKey(row.id, column.id)] === "saving"
                        ? 'ring-1 ring-primary/50 ring-inset bg-primary/[0.07]'
                        : cellStatus[getCellKey(row.id, column.id)] === "saved"
                          ? 'bg-primary/[0.1]'
                          : cellStatus[getCellKey(row.id, column.id)] === "error"
                            ? 'ring-1 ring-red-500/55 ring-inset bg-red-500/[0.08]'
                            : ''
                  }`}
                  style={{ width: column.width || 180, minWidth: 100 }}
                  onClick={() => handleCellClick(row.id, column.id)}
                  onKeyDown={(e) => handleCellKeyDown(e, rowIndex, colIndex, row.id, column.id)}
                  tabIndex={editingCell?.rowId === row.id && editingCell?.columnId === column.id ? -1 : 0}
                  aria-label={`${rowIndex + 1}, ${column.name}`}
                >
                  {cellStatus[getCellKey(row.id, column.id)] === "saving" && (
                    <span className="pointer-events-none absolute right-1 top-1 text-primary" aria-hidden>
                      <Loader2 className="w-3 h-3 animate-spin" />
                    </span>
                  )}
                  {cellStatus[getCellKey(row.id, column.id)] === "saved" && (
                    <span className="pointer-events-none absolute right-1 top-1 text-primary" aria-hidden>
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                  {cellStatus[getCellKey(row.id, column.id)] === "error" && (
                    <span className="pointer-events-none absolute right-1 top-1 text-red-500" aria-hidden>
                      <AlertCircle className="w-3 h-3" />
                    </span>
                  )}
                  <div className="flex items-center">
                    <div className="min-w-0 flex-1">
                      <DatabaseCell
                        dbId={dbId}
                        column={column}
                        rowId={row.id}
                        value={row.cells[column.id]}
                        isEditing={editingCell?.rowId === row.id && editingCell?.columnId === column.id}
                        onBlur={(action) => handleCellBlur(rowIndex, colIndex, action)}
                        onSaveStateChange={(state) => handleCellSaveState(row.id, column.id, state)}
                      />
                    </div>
                    {/* 第一列预留打开笔记按钮位置，避免 hover 时内容宽度跳变 */}
                    {colIndex === 0 && (
                      <div className="mr-1 h-8 w-8 flex-shrink-0">
                        <DatabaseIconButton
                          onClick={(e) => {
                            if (!row.notePath) return;
                            e.stopPropagation();
                            handleOpenInSplit(row.notePath);
                          }}
                          className={`h-8 w-8 transition-opacity duration-120 ease-out ${
                            hoveredRow === row.id && row.notePath ? "opacity-100" : "pointer-events-none opacity-0"
                          }`}
                          tabIndex={hoveredRow === row.id && row.notePath ? 0 : -1}
                          aria-hidden={hoveredRow === row.id && row.notePath ? undefined : true}
                          aria-label={t.database.openInSplit}
                          title={t.database.openInSplit}
                        >
                          <FileText className="w-4 h-4" />
                        </DatabaseIconButton>
                      </div>
                    )}
                  </div>
                </td>
              ))}
              
              {/* 空列占位 */}
              <td className="w-10 border-b border-border" />
            </tr>
          ))}
          
          {/* 新增行按钮 */}
          <tr>
            <td colSpan={columns.length + 2} className="p-0">
              <button
                onClick={() => {
                  void handleAddRow();
                }}
                className="db-toggle-btn w-full h-9 justify-start rounded-none border-0 px-4"
              >
                <Plus className="w-4 h-4" />
                {t.database.newRow}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
