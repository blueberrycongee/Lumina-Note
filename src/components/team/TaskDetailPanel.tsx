import { useState, useEffect, useCallback } from 'react';
import { useTaskStore } from '@/stores/useTaskStore';
import { useLocaleStore } from '@/stores/useLocaleStore';
import { useShallow } from 'zustand/react/shallow';
import type { UpdateTaskRequest } from '@/services/team/types';
import { X, Trash2 } from 'lucide-react';

interface TaskDetailPanelProps {
  taskId: string;
  onClose: () => void;
}


function timestampToDateStr(ts: number | null): string {
  if (ts == null) return '';
  const d = new Date(ts);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateStrToTimestamp(str: string): number | null {
  if (!str) return null;
  return new Date(str + 'T00:00:00').getTime();
}

const labelClass =
  'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1';
const inputClass =
  'w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

export default function TaskDetailPanel({ taskId, onClose }: TaskDetailPanelProps) {
  const { t } = useLocaleStore();

  const STATUS_OPTIONS = [
    { value: 'todo', label: t.team.statusTodo },
    { value: 'in_progress', label: t.team.statusInProgress },
    { value: 'done', label: t.team.statusDone },
    { value: 'cancelled', label: t.team.statusCancelled },
  ];

  const PRIORITY_OPTIONS = [
    { value: 'low', label: t.team.priorityLow },
    { value: 'medium', label: t.team.priorityMedium },
    { value: 'high', label: t.team.priorityHigh },
    { value: 'urgent', label: t.team.priorityUrgent },
  ];

  const { tasks, updateTask, deleteTask } = useTaskStore(
    useShallow((s) => ({
      tasks: s.tasks,
      updateTask: s.updateTask,
      deleteTask: s.deleteTask,
    }))
  );

  const task = tasks.find((t) => t.id === taskId);

  // Local editable state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('todo');
  const [priority, setPriority] = useState('medium');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sync local state when task changes
  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description);
    setStatus(task.status);
    setPriority(task.priority);
    setAssigneeId(task.assignee_id ?? '');
    setDueDate(timestampToDateStr(task.due_date));
    setStartDate(timestampToDateStr(task.start_date));
    setConfirmDelete(false);
  }, [task]);

  const save = useCallback(
    (changes: UpdateTaskRequest) => {
      updateTask(taskId, changes).catch(() => {
        // error is set in the store
      });
    },
    [taskId, updateTask]
  );

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await deleteTask(taskId);
      onClose();
    } catch {
      // error is set in the store
    }
  }, [confirmDelete, deleteTask, taskId, onClose]);

  if (!task) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-gray-400">
        {t.team.taskNotFound}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          {t.team.taskDetails}
        </h3>
        <button
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Title */}
        <div>
          <label className={labelClass}>{t.team.title}</label>
          <input
            type="text"
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title.trim() && title !== task.title) {
                save({ title: title.trim() });
              }
            }}
          />
        </div>

        {/* Description */}
        <div>
          <label className={labelClass}>{t.team.description}</label>
          <textarea
            className={`${inputClass} min-h-[80px] resize-y`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => {
              if (description !== task.description) {
                save({ description });
              }
            }}
          />
        </div>

        {/* Status */}
        <div>
          <label className={labelClass}>{t.team.status}</label>
          <select
            className={inputClass}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              save({ status: e.target.value });
            }}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Priority */}
        <div>
          <label className={labelClass}>{t.team.priority}</label>
          <select
            className={inputClass}
            value={priority}
            onChange={(e) => {
              setPriority(e.target.value);
              save({ priority: e.target.value });
            }}
          >
            {PRIORITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Assignee */}
        <div>
          <label className={labelClass}>{t.team.assigneeId}</label>
          <input
            type="text"
            className={inputClass}
            placeholder={t.team.userIdPlaceholder}
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            onBlur={() => {
              const newVal = assigneeId.trim() || null;
              if (newVal !== (task.assignee_id ?? '')) {
                save({ assignee_id: newVal });
              }
            }}
          />
        </div>

        {/* Start Date */}
        <div>
          <label className={labelClass}>{t.team.startDate}</label>
          <input
            type="date"
            className={inputClass}
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              save({ start_date: dateStrToTimestamp(e.target.value) });
            }}
          />
        </div>

        {/* Due Date */}
        <div>
          <label className={labelClass}>{t.team.dueDate}</label>
          <input
            type="date"
            className={inputClass}
            value={dueDate}
            onChange={(e) => {
              setDueDate(e.target.value);
              save({ due_date: dateStrToTimestamp(e.target.value) });
            }}
          />
        </div>

        {/* Metadata */}
        <div className="space-y-1 border-t border-gray-200 pt-3 text-xs text-gray-400 dark:border-gray-700 dark:text-gray-500">
          <p>{t.team.created}: {new Date(task.created_at).toLocaleString()}</p>
          <p>{t.team.updated}: {new Date(task.updated_at).toLocaleString()}</p>
          <p className="truncate">{t.team.taskId}: {task.id}</p>
        </div>
      </div>

      {/* Footer — delete */}
      <div className="border-t border-gray-200 p-4 dark:border-gray-700">
        <button
          onClick={handleDelete}
          className={`flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            confirmDelete
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40'
          }`}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {confirmDelete ? t.team.confirmDelete : t.team.deleteTask}
        </button>
      </div>
    </div>
  );
}
