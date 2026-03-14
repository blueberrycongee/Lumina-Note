import { useState, useCallback } from 'react';
import { useTaskStore, type TaskViewType } from '@/stores/useTaskStore';
import { useLocaleStore } from '@/stores/useLocaleStore';
import { useShallow } from 'zustand/react/shallow';
import type { CreateTaskRequest } from '@/services/team/types';
import TaskTableView from './TaskTableView';
import TaskKanbanView from './TaskKanbanView';
import TaskCalendarView from './TaskCalendarView';
import TaskGanttView from './TaskGanttView';
import TaskDetailPanel from './TaskDetailPanel';
import { Table2, Columns3, Calendar, GanttChart, Plus, Filter, Search, X } from 'lucide-react';

// ── View tab config ──────────────────────────────────────────────

// ── Inline create-task form ──────────────────────────────────────

function CreateTaskForm({ onClose }: { onClose: () => void }) {
  const { t } = useLocaleStore();
  const createTask = useTaskStore((s) => s.createTask);

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

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('todo');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!title.trim()) return;
      setSubmitting(true);
      const req: CreateTaskRequest = {
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        due_date: dueDate ? new Date(dueDate + 'T00:00:00').getTime() : undefined,
      };
      try {
        await createTask(req);
        onClose();
      } catch {
        // error is surfaced via the store
      } finally {
        setSubmitting(false);
      }
    },
    [title, description, status, priority, dueDate, createTask, onClose]
  );

  const inputClass =
    'w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-gray-200 bg-white p-4 shadow-lg dark:border-gray-700 dark:bg-gray-900"
    >
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          {t.team.newTask}
        </h4>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        {/* Title */}
        <input
          type="text"
          className={inputClass}
          placeholder={t.team.taskTitleRequired}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          required
        />

        {/* Description */}
        <textarea
          className={`${inputClass} min-h-[60px] resize-y`}
          placeholder={t.team.descriptionPlaceholder}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {/* Status + Priority row */}
        <div className="grid grid-cols-2 gap-3">
          <select
            className={inputClass}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            className={inputClass}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            {PRIORITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Due date */}
        <input
          type="date"
          className={inputClass}
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            {t.common.cancel}
          </button>
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? t.team.creating : t.common.create}
          </button>
        </div>
      </div>
    </form>
  );
}

// ── Filter panel ─────────────────────────────────────────────────

function FilterPanel() {
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

  const { filters, setFilters } = useTaskStore(
    useShallow((s) => ({
      filters: s.filters,
      setFilters: s.setFilters,
    }))
  );

  const toggleFilter = (
    category: 'status' | 'priority',
    value: string
  ) => {
    const current = filters[category] ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setFilters({ ...filters, [category]: next.length ? next : undefined });
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {t.team.status}
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {STATUS_OPTIONS.map((o) => {
          const active = filters.status?.includes(o.value);
          return (
            <button
              key={o.value}
              onClick={() => toggleFilter('status', o.value)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {t.team.priority}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRIORITY_OPTIONS.map((o) => {
          const active = filters.priority?.includes(o.value);
          return (
            <button
              key={o.value}
              onClick={() => toggleFilter('priority', o.value)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main container ───────────────────────────────────────────────

export default function TaskViewContainer() {
  const { t } = useLocaleStore();

  const VIEW_TABS: { key: TaskViewType; label: string; Icon: typeof Table2 }[] = [
    { key: 'table', label: t.team.viewTable, Icon: Table2 },
    { key: 'kanban', label: t.team.viewKanban, Icon: Columns3 },
    { key: 'calendar', label: t.team.viewCalendar, Icon: Calendar },
    { key: 'gantt', label: t.team.viewGantt, Icon: GanttChart },
  ];

  const {
    currentView,
    setView,
    filters,
    setFilters,
    selectedTaskId,
    selectTask,
    loading,
    error,
  } = useTaskStore(
    useShallow((s) => ({
      currentView: s.currentView,
      setView: s.setView,
      filters: s.filters,
      setFilters: s.setFilters,
      selectedTaskId: s.selectedTaskId,
      selectTask: s.selectTask,
      loading: s.loading,
      error: s.error,
    }))
  );

  const [showCreate, setShowCreate] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [searchValue, setSearchValue] = useState(filters.search ?? '');

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchValue(value);
      setFilters({ ...filters, search: value || undefined });
    },
    [filters, setFilters]
  );

  const ViewComponent = {
    table: TaskTableView,
    kanban: TaskKanbanView,
    calendar: TaskCalendarView,
    gantt: TaskGanttView,
  }[currentView];

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-2 dark:border-gray-700">
        {/* View tabs */}
        <div className="flex rounded-md border border-gray-200 dark:border-gray-700">
          {VIEW_TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              title={label}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
                currentView === key
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={t.team.searchPlaceholder}
            className="rounded-md border border-gray-300 bg-white py-1.5 pl-7 pr-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            value={searchValue}
            onChange={handleSearchChange}
          />
        </div>

        {/* New task button */}
        <button
          onClick={() => setShowCreate((prev) => !prev)}
          className="flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t.team.newTask}</span>
        </button>

        {/* Filter button */}
        <button
          onClick={() => setShowFilter((prev) => !prev)}
          className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
            showFilter || filters.status?.length || filters.priority?.length
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
          }`}
        >
          <Filter className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t.team.filter}</span>
        </button>
      </div>

      {/* Create form overlay */}
      {showCreate && (
        <div className="px-4 pt-2">
          <CreateTaskForm onClose={() => setShowCreate(false)} />
        </div>
      )}

      {/* Filter panel */}
      {showFilter && (
        <div className="px-4 pt-2">
          <FilterPanel />
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Main area: view + detail panel */}
      <div className="relative flex min-h-0 flex-1">
        {/* View */}
        <div
          className={`flex-1 overflow-auto p-4 ${loading ? 'opacity-60' : ''}`}
        >
          <ViewComponent />
        </div>

        {/* Detail panel */}
        {selectedTaskId && (
          <div className="w-80 shrink-0 overflow-hidden">
            <TaskDetailPanel
              taskId={selectedTaskId}
              onClose={() => selectTask(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
