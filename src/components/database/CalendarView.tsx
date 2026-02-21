import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDatabaseStore } from "@/stores/useDatabaseStore";
import { useLocaleStore } from "@/stores/useLocaleStore";
import { useFileStore } from "@/stores/useFileStore";
import type { DatabaseRow } from "@/types/database";
import { AlertCircle, CalendarDays, Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { DatabaseIconButton, DatabasePanel } from "./primitives";
import { DatabaseScaledContent } from "./ViewScaleControl";
import {
  addMonths,
  buildMonthGrid,
  extractDateKey,
  resolveCalendarDateColumnId,
  splitRowsByCalendarDate,
  toDateKey,
} from "./calendarUtils";
import { normalizeDatabaseViewScale } from "./viewScale";

interface CalendarViewProps {
  dbId: string;
}

type RowInteractionStatus = "opening" | "rescheduling" | "saved" | "error";

export function CalendarView({ dbId }: CalendarViewProps) {
  const { t, locale } = useLocaleStore();
  const { databases, getFilteredSortedRows, updateView, updateCell } = useDatabaseStore();
  const openFile = useFileStore((state) => state.openFile);
  const db = databases[dbId];
  const rows = useMemo(() => getFilteredSortedRows(dbId), [dbId, getFilteredSortedRows, db?.rows, db?.views]);
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [draggedRowId, setDraggedRowId] = useState<string | null>(null);
  const [dragOverDateKey, setDragOverDateKey] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rowStatus, setRowStatus] = useState<Record<string, RowInteractionStatus>>({});
  const statusTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const activeView = db?.views.find((view) => view.id === db.activeViewId);
  const dateColumns = db ? db.columns.filter((column) => column.type === "date") : [];
  const activeDateColumnId = db && activeView ? resolveCalendarDateColumnId(db.columns, activeView.dateColumn) : undefined;

  useEffect(() => {
    if (!activeView || activeView.type !== "calendar") return;
    if (!activeDateColumnId) return;
    if (activeView.dateColumn === activeDateColumnId) return;
    updateView(dbId, activeView.id, { dateColumn: activeDateColumnId });
  }, [activeDateColumnId, activeView, dbId, updateView]);

  useEffect(() => {
    return () => {
      Object.values(statusTimersRef.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  if (!db || !activeView) return null;

  const setRowInteractionStatus = useCallback(
    (rowId: string, status: RowInteractionStatus | "idle", timeoutMs?: number) => {
      const timers = statusTimersRef.current;
      if (timers[rowId]) {
        clearTimeout(timers[rowId]);
        delete timers[rowId];
      }

      if (status === "idle") {
        setRowStatus((prev) => {
          const { [rowId]: _, ...rest } = prev;
          return rest;
        });
        return;
      }

      setRowStatus((prev) => ({ ...prev, [rowId]: status }));

      if (timeoutMs) {
        timers[rowId] = setTimeout(() => {
          setRowStatus((prev) => {
            const { [rowId]: _, ...rest } = prev;
            return rest;
          });
          delete timers[rowId];
        }, timeoutMs);
      }
    },
    [],
  );

  const monthGrid = useMemo(() => buildMonthGrid(currentMonth), [currentMonth]);
  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(currentMonth),
    [currentMonth, locale],
  );
  const weekdayLabels = useMemo(() => {
    const base = new Date(Date.UTC(2026, 0, 4)); // Sunday
    const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
    return Array.from({ length: 7 }, (_, index) => formatter.format(new Date(base.getTime() + index * 86400000)));
  }, [locale]);

  const dateGroups = useMemo(
    () =>
      activeDateColumnId
        ? splitRowsByCalendarDate(rows, activeDateColumnId)
        : { grouped: {}, undated: rows },
    [activeDateColumnId, rows],
  );
  const rowMap = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const todayKey = toDateKey(new Date());
  const emptyDateStrategy = activeView.calendarEmptyDateStrategy ?? "show";
  const viewScale = normalizeDatabaseViewScale(activeView.scale);

  const handleOpenNote = useCallback(
    async (row: DatabaseRow) => {
      setErrorMessage(null);
      setLiveMessage(t.database.calendar.openingNote);
      setRowInteractionStatus(row.id, "opening");
      try {
        await openFile(row.notePath);
        setRowInteractionStatus(row.id, "saved", 1200);
        setLiveMessage(t.database.calendar.openNoteSuccess);
      } catch (error) {
        console.error("[Calendar] Failed to open note:", error);
        setRowInteractionStatus(row.id, "error", 2200);
        setErrorMessage(t.database.calendar.openNoteError);
        setLiveMessage(t.database.calendar.openNoteError);
      }
    },
    [openFile, setRowInteractionStatus, t.database.calendar.openNoteError, t.database.calendar.openNoteSuccess, t.database.calendar.openingNote],
  );

  const handleDragStart = useCallback((event: React.DragEvent<HTMLElement>, rowId: string) => {
    setDraggedRowId(rowId);
    setErrorMessage(null);
    setLiveMessage(t.database.calendar.dragHint);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", rowId);
  }, [t.database.calendar.dragHint]);

  const handleDragEnd = useCallback(() => {
    setDraggedRowId(null);
    setDragOverDateKey(null);
  }, []);

  const handleDayDragOver = useCallback((event: React.DragEvent<HTMLElement>, dayKey: string) => {
    if (!activeDateColumnId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverDateKey(dayKey);
  }, [activeDateColumnId]);

  const handleDayDrop = useCallback(
    async (event: React.DragEvent<HTMLElement>, dayKey: string) => {
      event.preventDefault();
      if (!activeDateColumnId) return;

      const droppedRowId = draggedRowId || event.dataTransfer.getData("text/plain");
      setDraggedRowId(null);
      setDragOverDateKey(null);
      if (!droppedRowId) return;

      const row = rowMap.get(droppedRowId);
      if (!row) return;

      const currentDateKey = extractDateKey(row.cells[activeDateColumnId]);
      if (currentDateKey === dayKey) return;

      setErrorMessage(null);
      setLiveMessage(t.database.calendar.rescheduling);
      setRowInteractionStatus(droppedRowId, "rescheduling");
      const ok = await updateCell(dbId, droppedRowId, activeDateColumnId, { start: dayKey });
      if (ok) {
        setRowInteractionStatus(droppedRowId, "saved", 1200);
        setLiveMessage(t.database.calendar.rescheduleSuccess);
      } else {
        setRowInteractionStatus(droppedRowId, "error", 2200);
        setErrorMessage(t.database.calendar.rescheduleError);
        setLiveMessage(t.database.calendar.rescheduleError);
      }
    },
    [
      activeDateColumnId,
      dbId,
      draggedRowId,
      rowMap,
      setRowInteractionStatus,
      t.database.calendar.rescheduleError,
      t.database.calendar.rescheduleSuccess,
      t.database.calendar.rescheduling,
      updateCell,
    ],
  );

  if (dateColumns.length === 0) {
    return (
      <div className="h-full p-6">
        <div className="db-empty-state h-full flex flex-col items-center justify-center gap-2">
          <CalendarDays className="w-5 h-5 text-muted-foreground" />
          <p>{t.database.calendar.noDateColumnTitle}</p>
          <p className="text-xs text-muted-foreground">{t.database.calendar.noDateColumnDesc}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      <p className="sr-only" aria-live="polite">
        {liveMessage}
      </p>
      <DatabasePanel className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <DatabaseIconButton
              onClick={() => setCurrentMonth((prev) => addMonths(prev, -1))}
              aria-label={t.database.calendar.prevMonth}
              title={t.database.calendar.prevMonth}
            >
              <ChevronLeft className="w-4 h-4" />
            </DatabaseIconButton>
            <button
              className="db-toggle-btn h-8 px-3"
              onClick={() => setCurrentMonth(new Date())}
            >
              {t.database.calendar.today}
            </button>
            <DatabaseIconButton
              onClick={() => setCurrentMonth((prev) => addMonths(prev, 1))}
              aria-label={t.database.calendar.nextMonth}
              title={t.database.calendar.nextMonth}
            >
              <ChevronRight className="w-4 h-4" />
            </DatabaseIconButton>
          </div>
          <p className="text-sm font-semibold">{monthLabel}</p>
        </div>
      </DatabasePanel>
      {errorMessage && (
        <DatabasePanel
          className="mt-3 flex items-start gap-2 border-red-500/30 bg-red-500/[0.08] p-2.5 text-xs text-red-600 dark:text-red-300"
          role="status"
          aria-live="polite"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <p>{errorMessage}</p>
        </DatabasePanel>
      )}

      <DatabaseScaledContent scale={viewScale} className="mt-3">
        <div className="grid grid-cols-7 gap-2" role="grid" aria-label={monthLabel}>
          {weekdayLabels.map((label) => (
            <div key={label} className="px-2 text-xs text-muted-foreground">
              {label}
            </div>
          ))}
          {monthGrid.map((day) => {
            const dayRows = dateGroups.grouped[day.key] || [];
            return (
              <DatabasePanel
                key={day.key}
                className={`min-h-[120px] p-2 ${
                  day.key === todayKey ? "ring-1 ring-primary/55 bg-primary/[0.06]" : ""
                } ${dragOverDateKey === day.key ? "ring-2 ring-primary/55 bg-primary/[0.1]" : ""} ${
                  !day.inCurrentMonth ? "opacity-60" : ""
                } transition-[opacity,background-color,box-shadow,transform] duration-180 ease-out motion-reduce:transition-none`}
                onDragOver={(event) => handleDayDragOver(event, day.key)}
                onDragLeave={() => setDragOverDateKey(null)}
                onDrop={(event) => void handleDayDrop(event, day.key)}
                role="gridcell"
                aria-label={day.key}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{day.date.getDate()}</span>
                  {dayRows.length > 0 && <span className="db-count-badge">{dayRows.length}</span>}
                </div>
                <div className="mt-1.5 space-y-1">
                  {dayRows.slice(0, 3).map((row) => (
                    <CalendarNoteCard
                      key={row.id}
                      row={row}
                      status={rowStatus[row.id]}
                      isDragging={draggedRowId === row.id}
                      openNoteLabel={t.database.calendar.openNote}
                      onOpenNote={() => void handleOpenNote(row)}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                    />
                  ))}
                  {dayRows.length > 3 && (
                    <p className="text-[11px] text-muted-foreground">+{dayRows.length - 3} {t.database.calendar.more}</p>
                  )}
                </div>
              </DatabasePanel>
            );
          })}
        </div>

        {emptyDateStrategy === "show" && dateGroups.undated.length > 0 && (
          <DatabasePanel className="mt-3 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{t.database.calendar.noDateBucket}</p>
              <span className="db-count-badge">{dateGroups.undated.length}</span>
            </div>
            <div className="mt-2 grid gap-1">
              {dateGroups.undated.slice(0, 8).map((row) => (
                <CalendarNoteCard
                  key={row.id}
                  row={row}
                  status={rowStatus[row.id]}
                  isDragging={draggedRowId === row.id}
                  openNoteLabel={t.database.calendar.openNote}
                  onOpenNote={() => void handleOpenNote(row)}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              ))}
              {dateGroups.undated.length > 8 && (
                <p className="text-xs text-muted-foreground">
                  +{dateGroups.undated.length - 8} {t.database.calendar.more}
                </p>
              )}
            </div>
          </DatabasePanel>
        )}
      </DatabaseScaledContent>
    </div>
  );
}

interface CalendarNoteCardProps {
  row: DatabaseRow;
  status?: RowInteractionStatus;
  isDragging: boolean;
  openNoteLabel: string;
  onOpenNote: () => void;
  onDragStart: (event: React.DragEvent<HTMLElement>, rowId: string) => void;
  onDragEnd: () => void;
}

function CalendarNoteCard({
  row,
  status,
  isDragging,
  openNoteLabel,
  onOpenNote,
  onDragStart,
  onDragEnd,
}: CalendarNoteCardProps) {
  const statusClass = status === "error"
    ? "ring-1 ring-red-500/50 bg-red-500/[0.08]"
    : status === "saved"
      ? "bg-primary/[0.1]"
      : status === "opening" || status === "rescheduling"
        ? "ring-1 ring-primary/50 bg-primary/[0.08]"
        : "";

  return (
    <button
      type="button"
      draggable
      onClick={onOpenNote}
      onDragStart={(event) => onDragStart(event, row.id)}
      onDragEnd={onDragEnd}
      className={`db-focus-ring group w-full rounded-ui-sm border border-border/60 bg-background px-1.5 py-1 text-left text-xs transition-[transform,opacity,background-color,border-color] duration-120 ease-out motion-reduce:transform-none motion-reduce:transition-none ${
        isDragging ? "scale-[0.99] opacity-55" : "hover:-translate-y-[1px] hover:border-border/80 motion-reduce:hover:translate-y-0"
      } ${statusClass}`}
      aria-label={`${openNoteLabel}: ${row.noteTitle}`}
      title={openNoteLabel}
    >
      <div className="flex items-start gap-1.5">
        <p className="min-w-0 flex-1 truncate">{row.noteTitle}</p>
        {(status === "opening" || status === "rescheduling") && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden />
        )}
        {status === "saved" && <Check className="h-3.5 w-3.5 text-primary" aria-hidden />}
        {status === "error" && <AlertCircle className="h-3.5 w-3.5 text-red-500" aria-hidden />}
      </div>
    </button>
  );
}
