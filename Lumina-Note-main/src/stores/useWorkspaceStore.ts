import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface WorkspaceOption {
  id: string;
  name: string;
  path: string;
}

interface WorkspaceState {
  workspaces: WorkspaceOption[];
  currentWorkspaceId: string | null;
  registerWorkspace: (path: string, name?: string) => WorkspaceOption;
  setCurrentWorkspace: (id: string | null) => void;
  renameWorkspace: (id: string, name: string) => void;
  removeWorkspace: (id: string) => void;
  getWorkspaceById: (id: string) => WorkspaceOption | undefined;
}

function hashPath(path: string): string {
  let hash = 5381;
  for (let i = 0; i < path.length; i += 1) {
    hash = ((hash << 5) + hash) + path.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function deriveName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const name = parts[parts.length - 1] || "Workspace";
  return name;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      currentWorkspaceId: null,
      registerWorkspace: (path, name) => {
        const id = `workspace-${hashPath(path)}`;
        const existing = get().workspaces.find(w => w.id === id);
        if (existing) {
          set({ currentWorkspaceId: id });
          return existing;
        }
        const workspace: WorkspaceOption = {
          id,
          name: name?.trim() || deriveName(path),
          path,
        };
        set(state => ({
          workspaces: [...state.workspaces, workspace],
          currentWorkspaceId: id,
        }));
        return workspace;
      },
      setCurrentWorkspace: (id) => {
        set({ currentWorkspaceId: id });
      },
      renameWorkspace: (id, name) => {
        set(state => ({
          workspaces: state.workspaces.map(w => w.id === id ? { ...w, name } : w),
        }));
      },
      removeWorkspace: (id) => {
        set(state => {
          const next = state.workspaces.filter(w => w.id !== id);
          const currentWorkspaceId = state.currentWorkspaceId === id ? (next[0]?.id ?? null) : state.currentWorkspaceId;
          return { workspaces: next, currentWorkspaceId };
        });
      },
      getWorkspaceById: (id) => get().workspaces.find(w => w.id === id),
    }),
    {
      name: "lumina-workspaces",
      partialize: (state) => ({
        workspaces: state.workspaces,
        currentWorkspaceId: state.currentWorkspaceId,
      }),
    }
  )
);
