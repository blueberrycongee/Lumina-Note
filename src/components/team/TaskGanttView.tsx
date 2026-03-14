import { useMemo, useState, useCallback } from 'react';
import { Gantt, ViewMode, type Task } from 'gantt-task-react';
import 'gantt-task-react/dist/index.css';
import { useTaskStore } from '@/stores/useTaskStore';
import { useShallow } from 'zustand/react/shallow';

// ===== ViewMode button config =====

const VIEW_MODES: { mode: ViewMode; label: string }[] = [
  { mode: ViewMode.Day, label: 'Day' },
  { mode: ViewMode.Week, label: 'Week' },
  { mode: ViewMode.Month, label: 'Month' },
];

// ===== Main Component =====

export default function TaskGanttView() {
  const { selectTask, getGanttItems } = useTaskStore(
    useShallow((s) => ({
      selectTask: s.selectTask,
      getGanttItems: s.getGanttItems,
    }))
  );

  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Week);

  const ganttItems = useMemo(() => getGanttItems(), [getGanttItems]);

  const ganttTasks: Task[] = useMemo(
    () =>
      ganttItems.map((item) => ({
        id: item.id,
        name: item.name,
        start: item.start,
        end: item.end,
        progress: item.progress,
        type: 'task' as const,
        styles: {
          progressColor: item.progress === 100 ? '#22c55e' : '#3b82f6',
          progressSelectedColor: item.progress === 100 ? '#16a34a' : '#2563eb',
        },
      })),
    [ganttItems]
  );

  const handleClick = useCallback(
    (task: Task) => {
      selectTask(task.id);
    },
    [selectTask]
  );

  // Empty state: no tasks with start_date
  if (ganttTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500 dark:text-gray-400">
        <svg
          className="mb-3 h-12 w-12 opacity-40"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
          />
        </svg>
        <p className="text-sm font-medium">No tasks with start dates</p>
        <p className="mt-1 text-xs">
          Add a start date to your tasks to see them on the Gantt chart.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* ViewMode toolbar */}
      <div className="flex gap-1">
        {VIEW_MODES.map(({ mode, label }) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={[
              'rounded px-3 py-1 text-xs font-medium transition-colors',
              viewMode === mode
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Gantt chart */}
      <div className="overflow-auto rounded-lg border border-gray-200 dark:border-zinc-700">
        <Gantt
          tasks={ganttTasks}
          viewMode={viewMode}
          onClick={handleClick}
          listCellWidth=""
          columnWidth={viewMode === ViewMode.Month ? 300 : viewMode === ViewMode.Week ? 250 : 65}
          ganttHeight={400}
          barCornerRadius={4}
          fontSize="12px"
          todayColor="rgba(59, 130, 246, 0.08)"
        />
      </div>
    </div>
  );
}
