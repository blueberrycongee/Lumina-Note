import { create } from 'zustand';
import type { TaskDetail, CreateTaskRequest, UpdateTaskRequest } from '@/services/team/types';
import * as teamApi from '@/services/team/client';

export type TaskViewType = 'table' | 'kanban' | 'calendar' | 'gantt';

interface TaskFilters {
  status?: string[];
  priority?: string[];
  assigneeId?: string | null;
  search?: string;
}

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const STATUS_ORDER: Record<string, number> = {
  todo: 0,
  in_progress: 1,
  done: 2,
  cancelled: 3,
};

const KANBAN_STATUSES = ['todo', 'in_progress', 'done', 'cancelled'] as const;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface TaskState {
  // State
  tasks: TaskDetail[];
  currentView: TaskViewType;
  filters: TaskFilters;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  groupBy: string | null;
  selectedTaskId: string | null;
  loading: boolean;
  error: string | null;

  // Connection
  baseUrl: string;
  token: string;
  currentProjectId: string | null;

  // Actions
  setConnection: (baseUrl: string, token: string) => void;
  setProjectId: (projectId: string | null) => void;
  fetchTasks: () => Promise<void>;
  createTask: (req: CreateTaskRequest) => Promise<TaskDetail>;
  updateTask: (taskId: string, req: UpdateTaskRequest) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;

  // View controls
  setView: (view: TaskViewType) => void;
  setFilters: (filters: TaskFilters) => void;
  setSortBy: (field: string) => void;
  toggleSortOrder: () => void;
  setGroupBy: (field: string | null) => void;
  selectTask: (taskId: string | null) => void;

  // Derived data getters
  getFilteredTasks: () => TaskDetail[];
  getKanbanColumns: () => Record<string, TaskDetail[]>;
  getCalendarEvents: () => Array<{
    id: string;
    title: string;
    start: number;
    end: number;
    task: TaskDetail;
  }>;
  getGanttItems: () => Array<{
    id: string;
    name: string;
    start: Date;
    end: Date;
    progress: number;
    task: TaskDetail;
  }>;
}

function compareTasks(a: TaskDetail, b: TaskDetail, sortBy: string): number {
  switch (sortBy) {
    case 'position':
      return a.position - b.position;
    case 'title':
      return a.title.localeCompare(b.title);
    case 'priority':
      return (PRIORITY_ORDER[a.priority] ?? 0) - (PRIORITY_ORDER[b.priority] ?? 0);
    case 'due_date': {
      if (a.due_date == null && b.due_date == null) return 0;
      if (a.due_date == null) return 1;
      if (b.due_date == null) return -1;
      return a.due_date - b.due_date;
    }
    case 'status':
      return (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0);
    case 'created_at':
      return a.created_at - b.created_at;
    default:
      return 0;
  }
}

export const useTaskStore = create<TaskState>((set, get) => ({
  // State
  tasks: [],
  currentView: 'table',
  filters: {},
  sortBy: 'position',
  sortOrder: 'asc',
  groupBy: null,
  selectedTaskId: null,
  loading: false,
  error: null,

  // Connection
  baseUrl: '',
  token: '',
  currentProjectId: null,

  // Actions

  setConnection: (baseUrl: string, token: string) => {
    set({ baseUrl, token });
  },

  setProjectId: (projectId: string | null) => {
    set({ currentProjectId: projectId, tasks: [], selectedTaskId: null });
  },

  fetchTasks: async () => {
    const { baseUrl, token, currentProjectId } = get();
    if (!currentProjectId) {
      set({ tasks: [], error: null });
      return;
    }
    set({ loading: true, error: null });
    try {
      const tasks = await teamApi.listTasks(baseUrl, token, currentProjectId);
      set({ tasks, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message, loading: false });
    }
  },

  createTask: async (req: CreateTaskRequest) => {
    const { baseUrl, token, currentProjectId } = get();
    if (!currentProjectId) {
      const msg = 'No project selected';
      set({ error: msg });
      throw new Error(msg);
    }
    set({ error: null });
    try {
      const task = await teamApi.createTask(baseUrl, token, currentProjectId, req);
      // Refresh task list
      const tasks = await teamApi.listTasks(baseUrl, token, currentProjectId);
      set({ tasks });
      return task;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      throw err;
    }
  },

  updateTask: async (taskId: string, req: UpdateTaskRequest) => {
    const { baseUrl, token, currentProjectId } = get();
    set({ error: null });
    try {
      await teamApi.updateTask(baseUrl, token, taskId, req);
      // Refresh task list if we have a project
      if (currentProjectId) {
        const tasks = await teamApi.listTasks(baseUrl, token, currentProjectId);
        set({ tasks });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      throw err;
    }
  },

  deleteTask: async (taskId: string) => {
    const { baseUrl, token, currentProjectId } = get();
    set({ error: null });
    try {
      await teamApi.deleteTask(baseUrl, token, taskId);
      // Refresh task list if we have a project
      if (currentProjectId) {
        const tasks = await teamApi.listTasks(baseUrl, token, currentProjectId);
        set({ tasks });
      }
      // Clear selection if the deleted task was selected
      if (get().selectedTaskId === taskId) {
        set({ selectedTaskId: null });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      throw err;
    }
  },

  // View controls

  setView: (view: TaskViewType) => {
    set({ currentView: view });
  },

  setFilters: (filters: TaskFilters) => {
    set({ filters });
  },

  setSortBy: (field: string) => {
    set({ sortBy: field });
  },

  toggleSortOrder: () => {
    set((state) => ({ sortOrder: state.sortOrder === 'asc' ? 'desc' : 'asc' }));
  },

  setGroupBy: (field: string | null) => {
    set({ groupBy: field });
  },

  selectTask: (taskId: string | null) => {
    set({ selectedTaskId: taskId });
  },

  // Derived data getters

  getFilteredTasks: () => {
    const { tasks, filters, sortBy, sortOrder } = get();
    let filtered = [...tasks];

    if (filters.status?.length) {
      filtered = filtered.filter((t) => filters.status!.includes(t.status));
    }
    if (filters.priority?.length) {
      filtered = filtered.filter((t) => filters.priority!.includes(t.priority));
    }
    if (filters.assigneeId !== undefined) {
      filtered = filtered.filter((t) => t.assignee_id === filters.assigneeId);
    }
    if (filters.search) {
      const s = filters.search.toLowerCase();
      filtered = filtered.filter(
        (t) => t.title.toLowerCase().includes(s) || t.description.toLowerCase().includes(s)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      const cmp = compareTasks(a, b, sortBy);
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return filtered;
  },

  getKanbanColumns: () => {
    const filtered = get().getFilteredTasks();
    const columns: Record<string, TaskDetail[]> = {};
    for (const status of KANBAN_STATUSES) {
      columns[status] = [];
    }
    for (const task of filtered) {
      const key = (KANBAN_STATUSES as readonly string[]).includes(task.status)
        ? task.status
        : 'todo';
      columns[key].push(task);
    }
    // Sort each column by position
    for (const status of KANBAN_STATUSES) {
      columns[status].sort((a, b) => a.position - b.position);
    }
    return columns;
  },

  getCalendarEvents: () => {
    const filtered = get().getFilteredTasks();
    return filtered
      .filter((t) => t.due_date != null)
      .map((t) => ({
        id: t.id,
        title: t.title,
        start: t.due_date!,
        end: t.due_date!,
        task: t,
      }));
  },

  getGanttItems: () => {
    const filtered = get().getFilteredTasks();
    return filtered
      .filter((t) => t.start_date != null)
      .map((t) => {
        let progress = 0;
        if (t.status === 'done') progress = 100;
        else if (t.status === 'in_progress') progress = 50;

        const startMs = t.start_date!;
        const endMs = t.due_date ?? startMs + ONE_DAY_MS;

        return {
          id: t.id,
          name: t.title,
          start: new Date(startMs),
          end: new Date(endMs),
          progress,
          task: t,
        };
      });
  },
}));
