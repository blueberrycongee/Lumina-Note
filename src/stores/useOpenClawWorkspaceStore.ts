import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FileEntry } from "@/lib/tauri";
import {
  OPENCLAW_ROOT_MEMORY_FILES,
  OPENCLAW_ROOT_MEMORY_FOLDERS,
  type OpenClawWorkspaceAttachment,
} from "@/types/openclaw";

type AttachOpenClawWorkspaceInput = {
  workspacePath: string;
  gateway?: Partial<OpenClawWorkspaceAttachment["gateway"]>;
  detectedFiles?: string[];
  detectedFolders?: string[];
};

interface OpenClawWorkspaceState {
  attachmentsByPath: Record<string, OpenClawWorkspaceAttachment>;
  attachWorkspace: (input: AttachOpenClawWorkspaceInput) => OpenClawWorkspaceAttachment;
  detachWorkspace: (workspacePath: string) => void;
  markUnavailable: (workspacePath: string) => void;
  refreshAttachmentScan: (workspacePath: string, fileTree: FileEntry[]) => void;
  getAttachment: (workspacePath?: string | null) => OpenClawWorkspaceAttachment | null;
  isAttached: (workspacePath?: string | null) => boolean;
}

const detectOpenClawEntries = (fileTree: FileEntry[]) => {
  const rootFiles = new Set<string>();
  const rootFolders = new Set<string>();

  for (const entry of fileTree) {
    if (entry.is_dir) {
      if (OPENCLAW_ROOT_MEMORY_FOLDERS.includes(entry.name as (typeof OPENCLAW_ROOT_MEMORY_FOLDERS)[number])) {
        rootFolders.add(entry.name);
      }
      continue;
    }

    if (OPENCLAW_ROOT_MEMORY_FILES.includes(entry.name as (typeof OPENCLAW_ROOT_MEMORY_FILES)[number])) {
      rootFiles.add(entry.name);
    }
  }

  return {
    detectedFiles: Array.from(rootFiles).sort(),
    detectedFolders: Array.from(rootFolders).sort(),
  };
};

const buildAttachment = (
  workspacePath: string,
  current: OpenClawWorkspaceAttachment | null,
  input: AttachOpenClawWorkspaceInput,
): OpenClawWorkspaceAttachment => ({
  kind: "openclaw",
  workspacePath,
  status: "attached",
  attachedAt: current?.attachedAt ?? new Date().toISOString(),
  lastValidatedAt: new Date().toISOString(),
  detectedFiles: [...(input.detectedFiles ?? current?.detectedFiles ?? [])].sort(),
  detectedFolders: [...(input.detectedFolders ?? current?.detectedFolders ?? [])].sort(),
  gateway: {
    enabled: input.gateway?.enabled ?? current?.gateway.enabled ?? false,
    endpoint: input.gateway?.endpoint ?? current?.gateway.endpoint ?? null,
  },
});

export const useOpenClawWorkspaceStore = create<OpenClawWorkspaceState>()(
  persist(
    (set, get) => ({
      attachmentsByPath: {},
      attachWorkspace: (input) => {
        const workspacePath = input.workspacePath.trim();
        const current = get().attachmentsByPath[workspacePath] ?? null;
        const next = buildAttachment(workspacePath, current, input);
        set((state) => ({
          attachmentsByPath: {
            ...state.attachmentsByPath,
            [workspacePath]: next,
          },
        }));
        return next;
      },
      detachWorkspace: (workspacePath) =>
        set((state) => {
          const next = { ...state.attachmentsByPath };
          delete next[workspacePath];
          return { attachmentsByPath: next };
        }),
      markUnavailable: (workspacePath) =>
        set((state) => {
          const current = state.attachmentsByPath[workspacePath];
          if (!current) {
            return state;
          }
          return {
            attachmentsByPath: {
              ...state.attachmentsByPath,
              [workspacePath]: {
                ...current,
                status: "unavailable",
              },
            },
          };
        }),
      refreshAttachmentScan: (workspacePath, fileTree) => {
        const current = get().attachmentsByPath[workspacePath];
        if (!current) {
          return;
        }
        const detected = detectOpenClawEntries(fileTree);
        get().attachWorkspace({
          workspacePath,
          detectedFiles: detected.detectedFiles,
          detectedFolders: detected.detectedFolders,
          gateway: current.gateway,
        });
      },
      getAttachment: (workspacePath) => {
        if (!workspacePath) return null;
        return get().attachmentsByPath[workspacePath] ?? null;
      },
      isAttached: (workspacePath) => {
        if (!workspacePath) return false;
        return Boolean(get().attachmentsByPath[workspacePath]);
      },
    }),
    {
      name: "lumina-openclaw-workspaces",
      partialize: (state) => ({
        attachmentsByPath: state.attachmentsByPath,
      }),
    },
  ),
);

export const getDetectedOpenClawEntries = detectOpenClawEntries;
