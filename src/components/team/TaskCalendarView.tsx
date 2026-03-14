import { useMemo, useState, useCallback } from 'react';
import { useTaskStore } from '@/stores/useTaskStore';
import { useShallow } from 'zustand/react/shallow';
import type { TaskDetail } from '@/services/team/types';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// ===== Constants =====

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const STATUS_DOT: Record<string, string> = {
  todo: 'bg-gray-400',
  in_progress: 'bg-blue-500',
  done: 'bg-green-500',
  cancelled: 'bg-red-400',
};

const PRIORITY_BORDER: Record<string, string> = {
  urgent: 'border-l-red-500',
  high: 'border-l-orange-500',
  medium: 'border-l-yellow-500',
  low: 'border-l-gray-400',
};

// ===== Helpers =====

/** Get the month grid: 5-6 weeks of dates covering the given month, including trailing/leading days. */
function getMonthGrid(year: number, month: number): Date[][] {
  const firstDay = new Date(year, month, 1);
  const startDow = firstDay.getDay(); // 0=Sun
  const startDate = new Date(year, month, 1 - startDow);

  const weeks: Date[][] = [];
  const cursor = new Date(startDate);

  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    // Stop after 5 weeks if the 6th week is entirely in the next month
    if (w >= 4 && week[0].getMonth() !== month) break;
  }

  return weeks;
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function timestampToDateKey(ts: number): string {
  return toDateKey(new Date(ts));
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

// ===== Task Chip =====

interface TaskChipProps {
  task: TaskDetail;
  isSelected: boolean;
  onSelect: (taskId: string) => void;
}

function TaskChip({ task, isSelected, onSelect }: TaskChipProps) {
  const dotColor = STATUS_DOT[task.status] ?? 'bg-gray-400';
  const borderColor = PRIORITY_BORDER[task.priority] ?? 'border-l-gray-400';

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(task.id);
      }}
      className={[
        'flex w-full items-center gap-1 truncate rounded border-l-2 px-1.5 py-0.5 text-left text-xs transition-colors',
        borderColor,
        'bg-white dark:bg-zinc-800',
        'hover:bg-gray-100 dark:hover:bg-zinc-700',
        isSelected && 'ring-1 ring-blue-500',
      ]
        .filter(Boolean)
        .join(' ')}
      title={task.title}
    >
      <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
      <span className="truncate text-gray-800 dark:text-gray-200">{task.title}</span>
    </button>
  );
}

// ===== Day Cell =====

interface DayCellProps {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  tasks: TaskDetail[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
}

function DayCell({ date, isCurrentMonth, isToday, tasks, selectedTaskId, onSelectTask }: DayCellProps) {
  return (
    <div
      className={[
        'flex min-h-[90px] flex-col border-b border-r border-gray-200 p-1 dark:border-zinc-700',
        isCurrentMonth ? 'bg-white dark:bg-zinc-900' : 'bg-gray-50 dark:bg-zinc-950',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Day number */}
      <div className="mb-0.5 flex items-center justify-end">
        <span
          className={[
            'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
            isToday && 'bg-blue-600 text-white',
            !isToday && isCurrentMonth && 'text-gray-700 dark:text-gray-300',
            !isToday && !isCurrentMonth && 'text-gray-400 dark:text-gray-600',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {date.getDate()}
        </span>
      </div>

      {/* Task chips */}
      <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
        {tasks.slice(0, 3).map((task) => (
          <TaskChip
            key={task.id}
            task={task}
            isSelected={task.id === selectedTaskId}
            onSelect={onSelectTask}
          />
        ))}
        {tasks.length > 3 && (
          <span className="px-1 text-[10px] font-medium text-gray-500 dark:text-gray-400">
            +{tasks.length - 3} more
          </span>
        )}
      </div>
    </div>
  );
}

// ===== Main Component =====

export default function TaskCalendarView() {
  const { selectedTaskId, selectTask, getCalendarEvents } = useTaskStore(
    useShallow((s) => ({
      selectedTaskId: s.selectedTaskId,
      selectTask: s.selectTask,
      getCalendarEvents: s.getCalendarEvents,
    }))
  );

  const today = useMemo(() => new Date(), []);
  const [currentMonth, setCurrentMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  // Build a map of dateKey -> tasks
  const events = useMemo(() => getCalendarEvents(), [getCalendarEvents]);
  const tasksByDate = useMemo(() => {
    const map: Record<string, TaskDetail[]> = {};
    for (const ev of events) {
      const key = timestampToDateKey(ev.start);
      if (!map[key]) map[key] = [];
      map[key].push(ev.task);
    }
    return map;
  }, [events]);

  const weeks = useMemo(() => getMonthGrid(year, month), [year, month]);

  const goToPrevMonth = useCallback(() => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }, []);

  const goToNextMonth = useCallback(() => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }, []);

  const goToToday = useCallback(() => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Header / navigation */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2 dark:border-zinc-700">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {MONTH_NAMES[month]} {year}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goToToday}
            className="rounded px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800"
          >
            Today
          </button>
          <button
            type="button"
            onClick={goToPrevMonth}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800"
            aria-label="Previous month"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={goToNextMonth}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800"
            aria-label="Next month"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-gray-200 dark:border-zinc-700">
        {DAY_LABELS.map((label) => (
          <div
            key={label}
            className="border-r border-gray-200 px-2 py-1.5 text-center text-xs font-medium text-gray-500 dark:border-zinc-700 dark:text-gray-400"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Month grid */}
      <div className="flex-1 overflow-y-auto">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((date) => {
              const key = toDateKey(date);
              return (
                <DayCell
                  key={key}
                  date={date}
                  isCurrentMonth={date.getMonth() === month}
                  isToday={isSameDay(date, today)}
                  tasks={tasksByDate[key] ?? []}
                  selectedTaskId={selectedTaskId}
                  onSelectTask={selectTask}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
