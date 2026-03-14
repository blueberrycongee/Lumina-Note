import { useMemo, useCallback } from 'react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import { useTaskStore } from '@/stores/useTaskStore';
import { useShallow } from 'zustand/react/shallow';
import type { TaskDetail } from '@/services/team/types';

// ===== Column configuration =====

interface ColumnConfig {
  id: string;
  label: string;
  headerColor: string;
  dotColor: string;
}

const COLUMNS: ColumnConfig[] = [
  {
    id: 'todo',
    label: 'Todo',
    headerColor: 'text-gray-600 dark:text-gray-400',
    dotColor: 'bg-gray-400',
  },
  {
    id: 'in_progress',
    label: 'In Progress',
    headerColor: 'text-blue-600 dark:text-blue-400',
    dotColor: 'bg-blue-500',
  },
  {
    id: 'done',
    label: 'Done',
    headerColor: 'text-green-600 dark:text-green-400',
    dotColor: 'bg-green-500',
  },
  {
    id: 'cancelled',
    label: 'Cancelled',
    headerColor: 'text-red-600 dark:text-red-400',
    dotColor: 'bg-red-500',
  },
];

// ===== Priority badge config =====

const PRIORITY_BADGE: Record<string, { label: string; className: string }> = {
  urgent: {
    label: 'Urgent',
    className: 'bg-red-200 text-red-800 dark:bg-red-700 dark:text-red-100',
  },
  high: {
    label: 'High',
    className: 'bg-orange-200 text-orange-800 dark:bg-orange-700 dark:text-orange-100',
  },
  medium: {
    label: 'Medium',
    className: 'bg-yellow-200 text-yellow-800 dark:bg-yellow-700 dark:text-yellow-100',
  },
  low: {
    label: 'Low',
    className: 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200',
  },
};

// ===== Helpers =====

function formatShortDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ===== Task Card =====

interface TaskCardProps {
  task: TaskDetail;
  index: number;
  isSelected: boolean;
  onSelect: (taskId: string) => void;
}

function TaskCard({ task, index, isSelected, onSelect }: TaskCardProps) {
  const badge = PRIORITY_BADGE[task.priority];

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onSelect(task.id)}
          className={[
            'mb-2 cursor-pointer rounded-lg border p-3 shadow-sm transition-shadow',
            'bg-white dark:bg-zinc-800',
            'border-gray-200 dark:border-zinc-700',
            snapshot.isDragging && 'scale-[1.03] shadow-lg ring-2 ring-blue-400/50',
            isSelected && 'ring-2 ring-blue-500',
            !snapshot.isDragging && !isSelected && 'hover:shadow-md',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{
            ...provided.draggableProps.style,
            // Preserve transform from dnd but add our own transition for non-drag states
            transition: snapshot.isDragging
              ? provided.draggableProps.style?.transition
              : 'box-shadow 150ms ease, transform 150ms ease',
          }}
        >
          {/* Title */}
          <div className="mb-1.5 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            {task.title}
          </div>

          {/* Priority badge + Due date */}
          <div className="mb-1 flex items-center gap-2 text-xs">
            {badge && (
              <span
                className={`inline-block rounded-full px-1.5 py-0.5 font-medium ${badge.className}`}
              >
                {badge.label}
              </span>
            )}
            {task.due_date != null && (
              <span className="text-gray-500 dark:text-gray-400">
                {formatShortDate(task.due_date)}
              </span>
            )}
          </div>

          {/* Assignee */}
          {task.assignee_id && (
            <div className="truncate text-xs text-gray-500 dark:text-gray-400">
              @{task.assignee_id}
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
}

// ===== Kanban Column =====

interface KanbanColumnProps {
  config: ColumnConfig;
  tasks: TaskDetail[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
}

function KanbanColumn({ config, tasks, selectedTaskId, onSelectTask }: KanbanColumnProps) {
  return (
    <div className="flex w-[280px] shrink-0 flex-col rounded-lg bg-gray-100 dark:bg-zinc-900">
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className={`h-2.5 w-2.5 rounded-full ${config.dotColor}`} />
        <span className={`text-sm font-semibold ${config.headerColor}`}>{config.label}</span>
        <span className="ml-auto rounded-full bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-zinc-700 dark:text-gray-300">
          {tasks.length}
        </span>
      </div>

      {/* Droppable area */}
      <Droppable droppableId={config.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={[
              'flex-1 overflow-y-auto px-2 pb-2',
              'min-h-[120px]',
              snapshot.isDraggingOver && 'rounded-b-lg bg-blue-50/50 dark:bg-blue-900/10',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {tasks.map((task, idx) => (
              <TaskCard
                key={task.id}
                task={task}
                index={idx}
                isSelected={task.id === selectedTaskId}
                onSelect={onSelectTask}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}

// ===== Main Component =====

export default function TaskKanbanView() {
  const { selectedTaskId, selectTask, updateTask, getKanbanColumns } = useTaskStore(
    useShallow((s) => ({
      selectedTaskId: s.selectedTaskId,
      selectTask: s.selectTask,
      updateTask: s.updateTask,
      getKanbanColumns: s.getKanbanColumns,
    }))
  );

  const columns = useMemo(() => getKanbanColumns(), [getKanbanColumns]);

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { draggableId, destination } = result;

      // Dropped outside a column
      if (!destination) return;

      const newStatus = destination.droppableId;

      // Find the task to check if status actually changed
      for (const col of COLUMNS) {
        const task = columns[col.id]?.find((t) => t.id === draggableId);
        if (task) {
          if (task.status !== newStatus) {
            updateTask(draggableId, { status: newStatus });
          }
          break;
        }
      }
    },
    [columns, updateTask]
  );

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto p-1">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            config={col}
            tasks={columns[col.id] ?? []}
            selectedTaskId={selectedTaskId}
            onSelectTask={selectTask}
          />
        ))}
      </div>
    </DragDropContext>
  );
}
