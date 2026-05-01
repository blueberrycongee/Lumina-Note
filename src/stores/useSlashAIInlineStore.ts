import { create } from "zustand";
import type {
  SlashAIAction,
  SlashAIInlinePreview,
} from "@/editor/extensions/slashCommand";

export interface SlashAIInlineTask {
  id: string;
  tabId: string;
  filePath: string | null;
  action: SlashAIAction;
  request: string;
  slashRange: { from: number; to: number };
  preview: SlashAIInlinePreview;
}

interface SlashAIInlineState {
  tasks: Record<string, SlashAIInlineTask>;
  setTask: (task: SlashAIInlineTask) => void;
  removeTask: (id: string) => void;
  removeTasksForTabIds: (tabIds: Iterable<string>) => void;
}

const abortControllers = new Map<string, AbortController>();

export const useSlashAIInlineStore = create<SlashAIInlineState>((set) => ({
  tasks: {},
  setTask: (task) =>
    set((state) => ({
      tasks: {
        ...state.tasks,
        [task.id]: task,
      },
    })),
  removeTask: (id) =>
    set((state) => {
      const next = { ...state.tasks };
      delete next[id];
      return { tasks: next };
    }),
  removeTasksForTabIds: (tabIds) =>
    set((state) => {
      const ids = new Set(tabIds);
      const next = { ...state.tasks };
      for (const task of Object.values(state.tasks)) {
        if (ids.has(task.tabId)) {
          delete next[task.id];
        }
      }
      return { tasks: next };
    }),
}));

export function getSlashAIInlineTask(id: string): SlashAIInlineTask | null {
  return useSlashAIInlineStore.getState().tasks[id] ?? null;
}

export function getSlashAIInlineTaskForTab(tabId: string | null | undefined): SlashAIInlineTask | null {
  if (!tabId) return null;
  const tasks = Object.values(useSlashAIInlineStore.getState().tasks)
    .filter((task) => task.tabId === tabId)
    .sort((a, b) => (a.preview.startedAt ?? 0) - (b.preview.startedAt ?? 0));
  return tasks.at(-1) ?? null;
}

export function startSlashAIInlineTask(
  task: SlashAIInlineTask,
  controller: AbortController,
): void {
  for (const existing of Object.values(useSlashAIInlineStore.getState().tasks)) {
    if (existing.tabId === task.tabId && existing.id !== task.id) {
      cancelSlashAIInlineTask(existing.id);
    }
  }
  abortControllers.set(task.id, controller);
  useSlashAIInlineStore.getState().setTask(task);
}

export function updateSlashAIInlineTask(task: SlashAIInlineTask): void {
  if (!useSlashAIInlineStore.getState().tasks[task.id]) return;
  useSlashAIInlineStore.getState().setTask(task);
}

export function finishSlashAIInlineTask(id: string): void {
  abortControllers.delete(id);
}

export function removeSlashAIInlineTask(id: string): void {
  abortControllers.delete(id);
  useSlashAIInlineStore.getState().removeTask(id);
}

export function cancelSlashAIInlineTask(id: string): void {
  abortControllers.get(id)?.abort();
  abortControllers.delete(id);
  useSlashAIInlineStore.getState().removeTask(id);
}

export function cancelSlashAIInlineTasksForTabIds(tabIds: Iterable<string>): void {
  const ids = new Set(tabIds);
  const taskIds = Object.values(useSlashAIInlineStore.getState().tasks)
    .filter((task) => ids.has(task.tabId))
    .map((task) => task.id);
  for (const taskId of taskIds) {
    abortControllers.get(taskId)?.abort();
    abortControllers.delete(taskId);
  }
  useSlashAIInlineStore.getState().removeTasksForTabIds(ids);
}

