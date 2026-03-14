import { useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { useTaskStore } from '@/stores/useTaskStore';
import { useShallow } from 'zustand/react/shallow';
import type { TaskDetail } from '@/services/team/types';
import { ArrowUpDown } from 'lucide-react';

const columnHelper = createColumnHelper<TaskDetail>();

const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200',
  in_progress: 'bg-blue-200 text-blue-800 dark:bg-blue-700 dark:text-blue-100',
  done: 'bg-green-200 text-green-800 dark:bg-green-700 dark:text-green-100',
  cancelled: 'bg-red-200 text-red-800 dark:bg-red-700 dark:text-red-100',
};

const STATUS_LABELS: Record<string, string> = {
  todo: 'Todo',
  in_progress: 'In Progress',
  done: 'Done',
  cancelled: 'Cancelled',
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-200 text-red-800 dark:bg-red-700 dark:text-red-100',
  high: 'bg-orange-200 text-orange-800 dark:bg-orange-700 dark:text-orange-100',
  medium: 'bg-yellow-200 text-yellow-800 dark:bg-yellow-700 dark:text-yellow-100',
  low: 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200',
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

function formatDate(timestamp: number | null): string {
  if (timestamp == null) return '\u2014';
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const columns = [
  columnHelper.accessor('title', {
    header: 'Title',
    size: 999,
    enableSorting: true,
    cell: (info) => (
      <span className="truncate font-medium text-gray-900 dark:text-gray-100">
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    size: 100,
    enableSorting: true,
    cell: (info) => {
      const val = info.getValue();
      return (
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[val] ?? STATUS_COLORS.todo}`}
        >
          {STATUS_LABELS[val] ?? val}
        </span>
      );
    },
  }),
  columnHelper.accessor('priority', {
    header: 'Priority',
    size: 100,
    enableSorting: true,
    cell: (info) => {
      const val = info.getValue();
      return (
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[val] ?? PRIORITY_COLORS.low}`}
        >
          {PRIORITY_LABELS[val] ?? val}
        </span>
      );
    },
  }),
  columnHelper.accessor('assignee_id', {
    header: 'Assignee',
    size: 120,
    enableSorting: true,
    cell: (info) => {
      const val = info.getValue();
      return (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {val ?? 'Unassigned'}
        </span>
      );
    },
  }),
  columnHelper.accessor('due_date', {
    header: 'Due Date',
    size: 120,
    enableSorting: true,
    cell: (info) => (
      <span className="text-sm text-gray-600 dark:text-gray-400">
        {formatDate(info.getValue())}
      </span>
    ),
  }),
];

export default function TaskTableView() {
  const { selectedTaskId, selectTask, setSortBy, getFilteredTasks } = useTaskStore(
    useShallow((s) => ({
      selectedTaskId: s.selectedTaskId,
      selectTask: s.selectTask,
      setSortBy: s.setSortBy,
      getFilteredTasks: s.getFilteredTasks,
    }))
  );

  const data = useMemo(() => getFilteredTasks(), [getFilteredTasks]);

  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      setSorting(next);
      if (next.length > 0) {
        setSortBy(next[0].id);
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="w-full min-w-[600px] text-left text-sm">
        <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="select-none whitespace-nowrap border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:text-gray-400"
                  style={{
                    width: header.column.getSize() === 999 ? undefined : header.column.getSize(),
                    cursor: header.column.getCanSort() ? 'pointer' : undefined,
                  }}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  <span className="inline-flex items-center gap-1">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getCanSort() && (
                      <ArrowUpDown className="h-3 w-3 opacity-50" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-8 text-center text-gray-400 dark:text-gray-500"
              >
                No tasks found
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row, idx) => {
              const isSelected = row.original.id === selectedTaskId;
              return (
                <tr
                  key={row.id}
                  onClick={() => selectTask(row.original.id)}
                  className={[
                    'cursor-pointer border-b border-gray-100 transition-colors dark:border-gray-800',
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/30'
                      : idx % 2 === 0
                        ? 'bg-white dark:bg-gray-900'
                        : 'bg-gray-50/50 dark:bg-gray-800/50',
                    !isSelected && 'hover:bg-gray-100 dark:hover:bg-gray-800',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-1.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
