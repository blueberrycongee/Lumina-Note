import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  discoverSystemOpenClawPath,
  inspectOpenClawWorkspace,
  inspectOpenClawWorkspaceTree,
  type OpenClawWorkspaceSnapshot,
} from "@/services/openclaw/workspace";
import { listDirectory, type FileEntry } from "@/lib/host";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";
import type { OpenClawConflictState, OpenClawWorkspaceAttachment } from "@/types/openclaw";

export const OPENCLAW_WORKSPACE_RELEASE_ENABLED =
  (import.meta.env.VITE_ENABLE_OPENCLAW_WORKSPACE ?? "1") !== "0";

const EMPTY_FILE_TREE: FileEntry[] = [];

type AttachWorkspaceInput = {
  hostWorkspacePath: string;
  workspacePath: string;
  gateway?: Partial<OpenClawWorkspaceAttachment["gateway"]>;
};

interface OpenClawWorkspaceState {
  integrationEnabled: boolean;
  snapshotsByHostPath: Record<string, OpenClawWorkspaceSnapshot>;
  mountedFileTreesByHostPath: Record<string, FileEntry[]>;
  attachmentsByHostPath: Record<string, OpenClawWorkspaceAttachment>;
  conflictsByHostPath: Record<string, OpenClawConflictState>;
  activeHostWorkspacePath: string | null;
  isRefreshing: boolean;
  lastError: string | null;
  setIntegrationEnabled: (enabled: boolean) => void;
  refreshWorkspace: (
    hostWorkspacePath?: string | null,
    options?: { workspacePath?: string; fileTree?: FileEntry[] },
  ) => Promise<OpenClawWorkspaceSnapshot | null>;
  refreshMountedFileTree: (
    hostWorkspacePath: string,
    workspacePath?: string,
  ) => Promise<FileEntry[]>;
  getMountedFileTree: (hostWorkspacePath?: string | null) => FileEntry[];
  getSnapshot: (hostWorkspacePath?: string | null) => OpenClawWorkspaceSnapshot | null;
  clearSnapshot: (hostWorkspacePath: string) => void;
  getAttachment: (hostWorkspacePath?: string | null) => OpenClawWorkspaceAttachment | null;
  getMountedWorkspacePath: (hostWorkspacePath?: string | null) => string | null;
  attachWorkspace: (input: AttachWorkspaceInput) => Promise<OpenClawWorkspaceAttachment>;
  detachWorkspace: (hostWorkspacePath: string) => void;
  updateGateway: (
    hostWorkspacePath: string,
    gateway: Partial<OpenClawWorkspaceAttachment["gateway"]>,
  ) => OpenClawWorkspaceAttachment | null;
  refreshAttachmentScan: (
    hostWorkspacePath: string,
    fileTree?: FileEntry[],
    workspacePath?: string,
  ) => OpenClawWorkspaceAttachment | null;
  recordExternalChange: (hostWorkspacePath: string, paths: string[], dirtyPaths?: string[]) => void;
  getConflictState: (hostWorkspacePath?: string | null) => OpenClawConflictState | null;
  clearConflictState: (hostWorkspacePath: string) => void;
  markUnavailable: (hostWorkspacePath: string) => void;
}

function toIsoString(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function applySnapshotToAttachment(
  attachment: OpenClawWorkspaceAttachment,
  snapshot: OpenClawWorkspaceSnapshot,
): OpenClawWorkspaceAttachment {
  return {
    ...attachment,
    status: snapshot.status === "error" ? "unavailable" : "attached",
    lastValidatedAt: toIsoString(snapshot.checkedAt),
    detectedFiles: snapshot.editablePriorityFiles,
    detectedFolders: snapshot.matchedDirectories,
  };
}

function normalizeAttachment(
  hostWorkspacePath: string,
  attachment: OpenClawWorkspaceAttachment | undefined,
): OpenClawWorkspaceAttachment | null {
  if (!attachment) return null;
  return {
    ...attachment,
    hostWorkspacePath: attachment.hostWorkspacePath || hostWorkspacePath,
  };
}

function normalizeAttachmentRecord(
  attachments:
    | Record<string, OpenClawWorkspaceAttachment>
    | undefined,
): Record<string, OpenClawWorkspaceAttachment> {
  if (!attachments) return {};
  const entries = Object.entries(attachments)
    .map(([hostWorkspacePath, attachment]) => [
      hostWorkspacePath,
      normalizeAttachment(hostWorkspacePath, attachment),
    ] as const)
    .filter((entry): entry is [string, OpenClawWorkspaceAttachment] => entry[1] !== null);
  return Object.fromEntries(entries);
}

async function syncWorkspaceAccessRoots(paths: string[]): Promise<void> {
  for (const path of paths) {
    useWorkspaceStore.getState().registerWorkspace(path);
  }
  const roots = Array.from(
    new Set(useWorkspaceStore.getState().workspaces.map((workspace) => workspace.path)),
  );
  if (roots.length === 0) return;
  await invoke("fs_set_allowed_roots", { roots });
}

function resolveTargetWorkspacePath(
  state: Pick<OpenClawWorkspaceState, "attachmentsByHostPath">,
  hostWorkspacePath: string,
  explicitWorkspacePath?: string,
): string {
  return explicitWorkspacePath ?? state.attachmentsByHostPath[hostWorkspacePath]?.workspacePath ?? hostWorkspacePath;
}

type PersistedOpenClawWorkspaceState = Partial<OpenClawWorkspaceState> & {
  snapshotsByPath?: Record<string, OpenClawWorkspaceSnapshot>;
  attachmentsByPath?: Record<string, OpenClawWorkspaceAttachment>;
  conflictsByPath?: Record<string, OpenClawConflictState>;
  activeWorkspacePath?: string | null;
};

export const useOpenClawWorkspaceStore = create<OpenClawWorkspaceState>()(
  persist(
    (set, get) => ({
      integrationEnabled: OPENCLAW_WORKSPACE_RELEASE_ENABLED,
      snapshotsByHostPath: {},
      mountedFileTreesByHostPath: {},
      attachmentsByHostPath: {},
      conflictsByHostPath: {},
      activeHostWorkspacePath: null,
      isRefreshing: false,
      lastError: null,
      setIntegrationEnabled: (enabled) => {
        if (!OPENCLAW_WORKSPACE_RELEASE_ENABLED) {
          set({ integrationEnabled: false, activeHostWorkspacePath: null });
          return;
        }
        set((state) => ({
          integrationEnabled: enabled,
          activeHostWorkspacePath: enabled ? state.activeHostWorkspacePath : null,
        }));
      },
      refreshWorkspace: async (hostWorkspacePath, options) => {
        if (!OPENCLAW_WORKSPACE_RELEASE_ENABLED || !get().integrationEnabled) {
          return null;
        }
        if (!hostWorkspacePath) {
          set({ activeHostWorkspacePath: null, isRefreshing: false, lastError: null });
          return null;
        }

        const targetWorkspacePath = resolveTargetWorkspacePath(
          get(),
          hostWorkspacePath,
          options?.workspacePath,
        );

        set({ activeHostWorkspacePath: hostWorkspacePath, isRefreshing: true, lastError: null });
        try {
          let snapshot = options?.fileTree
            ? inspectOpenClawWorkspaceTree(targetWorkspacePath, options.fileTree)
            : await inspectOpenClawWorkspace(targetWorkspacePath);

          // Fallback: if vault itself has no OpenClaw markers and no external
          // workspace is mounted, probe the system-standard install path.
          if (snapshot.status === "not-detected" && targetWorkspacePath === hostWorkspacePath) {
            const systemPath = await discoverSystemOpenClawPath();
            if (systemPath) {
              await syncWorkspaceAccessRoots([systemPath]);
              snapshot = await inspectOpenClawWorkspace(systemPath);
            }
          }

          set((state) => ({
            snapshotsByHostPath: {
              ...state.snapshotsByHostPath,
              [hostWorkspacePath]: snapshot,
            },
            attachmentsByHostPath: state.attachmentsByHostPath[hostWorkspacePath]
              ? {
                  ...state.attachmentsByHostPath,
                  [hostWorkspacePath]: applySnapshotToAttachment(
                    normalizeAttachment(
                      hostWorkspacePath,
                      state.attachmentsByHostPath[hostWorkspacePath],
                    ) as OpenClawWorkspaceAttachment,
                    snapshot,
                  ),
                }
              : state.attachmentsByHostPath,
            activeHostWorkspacePath: hostWorkspacePath,
            isRefreshing: false,
            lastError: snapshot.status === "error" ? snapshot.error : null,
          }));
          return snapshot;
        } catch (error) {
          set({ isRefreshing: false, lastError: error instanceof Error ? error.message : String(error) });
          return null;
        }
      },
      refreshMountedFileTree: async (hostWorkspacePath, workspacePath) => {
        const targetWorkspacePath = resolveTargetWorkspacePath(get(), hostWorkspacePath, workspacePath);
        const tree = await listDirectory(targetWorkspacePath);
        set((state) => ({
          mountedFileTreesByHostPath: {
            ...state.mountedFileTreesByHostPath,
            [hostWorkspacePath]: tree,
          },
        }));
        return tree;
      },
      getMountedFileTree: (hostWorkspacePath) => {
        const targetHostPath = hostWorkspacePath ?? get().activeHostWorkspacePath;
        if (!targetHostPath) return EMPTY_FILE_TREE;
        return get().mountedFileTreesByHostPath[targetHostPath] ?? EMPTY_FILE_TREE;
      },
      getSnapshot: (hostWorkspacePath) => {
        if (!OPENCLAW_WORKSPACE_RELEASE_ENABLED || !get().integrationEnabled) return null;
        const targetHostPath = hostWorkspacePath ?? get().activeHostWorkspacePath;
        if (!targetHostPath) return null;
        return get().snapshotsByHostPath[targetHostPath] ?? null;
      },
      clearSnapshot: (hostWorkspacePath) =>
        set((state) => {
          const next = { ...state.snapshotsByHostPath };
          delete next[hostWorkspacePath];
          return {
            snapshotsByHostPath: next,
            activeHostWorkspacePath:
              state.activeHostWorkspacePath === hostWorkspacePath
                ? null
                : state.activeHostWorkspacePath,
          };
        }),
      getAttachment: (hostWorkspacePath) => {
        if (!OPENCLAW_WORKSPACE_RELEASE_ENABLED || !get().integrationEnabled) return null;
        const targetHostPath = hostWorkspacePath ?? get().activeHostWorkspacePath;
        if (!targetHostPath) return null;
        return get().attachmentsByHostPath[targetHostPath] ?? null;
      },
      getMountedWorkspacePath: (hostWorkspacePath) => {
        const targetHostPath = hostWorkspacePath ?? get().activeHostWorkspacePath;
        if (!targetHostPath) return null;
        return get().attachmentsByHostPath[targetHostPath]?.workspacePath ?? null;
      },
      attachWorkspace: async ({ hostWorkspacePath, workspacePath, gateway }) => {
        if (!OPENCLAW_WORKSPACE_RELEASE_ENABLED || !get().integrationEnabled) {
          throw new Error("OpenClaw integration is disabled.");
        }
        await syncWorkspaceAccessRoots([hostWorkspacePath, workspacePath]);
        const nowIso = new Date().toISOString();
        const existing = normalizeAttachment(hostWorkspacePath, get().attachmentsByHostPath[hostWorkspacePath]);
        const attachment: OpenClawWorkspaceAttachment = existing
          ? {
              ...existing,
              hostWorkspacePath,
              workspacePath,
              gateway: {
                ...existing.gateway,
                ...gateway,
              },
            }
          : {
              kind: "openclaw",
              hostWorkspacePath,
              workspacePath,
              status: "attached",
              attachedAt: nowIso,
              lastValidatedAt: null,
              detectedFiles: [],
              detectedFolders: [],
              gateway: {
                enabled: gateway?.enabled ?? false,
                endpoint: gateway?.endpoint ?? null,
              },
              unavailableReason: null,
            };
        set((state) => ({
          attachmentsByHostPath: {
            ...state.attachmentsByHostPath,
            [hostWorkspacePath]: attachment,
          },
          activeHostWorkspacePath: hostWorkspacePath,
        }));
        await get().refreshWorkspace(hostWorkspacePath, { workspacePath });
        const fileTree = await get().refreshMountedFileTree(hostWorkspacePath, workspacePath);
        return (
          get().refreshAttachmentScan(hostWorkspacePath, fileTree, workspacePath) ??
          get().getAttachment(hostWorkspacePath) ??
          attachment
        );
      },
      detachWorkspace: (hostWorkspacePath) =>
        set((state) => {
          const nextAttachments = { ...state.attachmentsByHostPath };
          const nextConflicts = { ...state.conflictsByHostPath };
          const nextSnapshots = { ...state.snapshotsByHostPath };
          const nextTrees = { ...state.mountedFileTreesByHostPath };
          delete nextAttachments[hostWorkspacePath];
          delete nextConflicts[hostWorkspacePath];
          delete nextSnapshots[hostWorkspacePath];
          delete nextTrees[hostWorkspacePath];
          return {
            attachmentsByHostPath: nextAttachments,
            conflictsByHostPath: nextConflicts,
            snapshotsByHostPath: nextSnapshots,
            mountedFileTreesByHostPath: nextTrees,
          };
        }),
      updateGateway: (hostWorkspacePath, gateway) => {
        if (!OPENCLAW_WORKSPACE_RELEASE_ENABLED || !get().integrationEnabled) return null;
        const current = normalizeAttachment(hostWorkspacePath, get().attachmentsByHostPath[hostWorkspacePath]);
        if (!current) return null;
        const next = {
          ...current,
          gateway: {
            ...current.gateway,
            ...gateway,
          },
        };
        set((state) => ({
          attachmentsByHostPath: {
            ...state.attachmentsByHostPath,
            [hostWorkspacePath]: next,
          },
        }));
        return next;
      },
      refreshAttachmentScan: (hostWorkspacePath, fileTree, workspacePath) => {
        if (!OPENCLAW_WORKSPACE_RELEASE_ENABLED || !get().integrationEnabled) {
          return null;
        }
        const targetWorkspacePath = resolveTargetWorkspacePath(
          get(),
          hostWorkspacePath,
          workspacePath,
        );
        const snapshot = fileTree
          ? inspectOpenClawWorkspaceTree(targetWorkspacePath, fileTree)
          : get().getSnapshot(hostWorkspacePath);
        if (!snapshot) {
          return get().getAttachment(hostWorkspacePath);
        }
        const existingAttachment = normalizeAttachment(
          hostWorkspacePath,
          get().attachmentsByHostPath[hostWorkspacePath],
        );
        set((state) => ({
          snapshotsByHostPath: {
            ...state.snapshotsByHostPath,
            [hostWorkspacePath]: snapshot,
          },
          attachmentsByHostPath: existingAttachment
            ? {
                ...state.attachmentsByHostPath,
                [hostWorkspacePath]: applySnapshotToAttachment(existingAttachment, snapshot),
              }
            : state.attachmentsByHostPath,
          mountedFileTreesByHostPath: fileTree
            ? {
                ...state.mountedFileTreesByHostPath,
                [hostWorkspacePath]: fileTree,
              }
            : state.mountedFileTreesByHostPath,
          activeHostWorkspacePath: hostWorkspacePath,
          lastError: snapshot.status === "error" ? snapshot.error : null,
        }));
        return existingAttachment
          ? applySnapshotToAttachment(existingAttachment, snapshot)
          : null;
      },
      recordExternalChange: (hostWorkspacePath, paths, dirtyPaths = []) => {
        const attachment = normalizeAttachment(
          hostWorkspacePath,
          get().attachmentsByHostPath[hostWorkspacePath],
        );
        if (!attachment || attachment.status !== "attached") {
          return;
        }
        const toForwardSlash = (p: string) => p.replace(/\\/g, "/");
        const normalizedDirty = new Set(dirtyPaths.map(toForwardSlash));
        const conflictingPaths = paths.filter((p) => normalizedDirty.has(toForwardSlash(p)));
        if (conflictingPaths.length === 0) {
          return;
        }
        set((state) => ({
          conflictsByHostPath: {
            ...state.conflictsByHostPath,
            [hostWorkspacePath]: {
              workspacePath: attachment.workspacePath,
              status: "warning",
              files: Array.from(new Set(conflictingPaths)),
              lastDetectedAt: new Date().toISOString(),
              message: `OpenClaw updated ${conflictingPaths.length} file(s) that also have unsaved edits in Lumina.`,
            },
          },
        }));
      },
      getConflictState: (hostWorkspacePath) => {
        if (!OPENCLAW_WORKSPACE_RELEASE_ENABLED || !get().integrationEnabled) return null;
        const targetHostPath = hostWorkspacePath ?? get().activeHostWorkspacePath;
        if (!targetHostPath) return null;
        return get().conflictsByHostPath[targetHostPath] ?? null;
      },
      clearConflictState: (hostWorkspacePath) =>
        set((state) => {
          const next = { ...state.conflictsByHostPath };
          delete next[hostWorkspacePath];
          return { conflictsByHostPath: next };
        }),
      markUnavailable: (hostWorkspacePath) =>
        set((state) => ({
          attachmentsByHostPath: state.attachmentsByHostPath[hostWorkspacePath]
            ? {
                ...state.attachmentsByHostPath,
                [hostWorkspacePath]: {
                  ...normalizeAttachment(
                    hostWorkspacePath,
                    state.attachmentsByHostPath[hostWorkspacePath],
                  )!,
                  status: "unavailable",
                  lastValidatedAt: new Date().toISOString(),
                  unavailableReason: "Workspace path is unavailable or could not be refreshed.",
                },
              }
            : state.attachmentsByHostPath,
          conflictsByHostPath: state.conflictsByHostPath[hostWorkspacePath]
            ? {
                ...state.conflictsByHostPath,
                [hostWorkspacePath]: {
                  ...state.conflictsByHostPath[hostWorkspacePath],
                  status: "warning",
                  lastDetectedAt: new Date().toISOString(),
                  message: "Workspace path is unavailable or could not be refreshed.",
                },
              }
            : state.conflictsByHostPath,
        })),
    }),
    {
      name: "lumina-openclaw-workspaces",
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as PersistedOpenClawWorkspaceState;
        const snapshotsByHostPath =
          persisted.snapshotsByHostPath ?? persisted.snapshotsByPath ?? currentState.snapshotsByHostPath;
        const attachmentsByHostPath = normalizeAttachmentRecord(
          persisted.attachmentsByHostPath ?? persisted.attachmentsByPath,
        );
        const conflictsByHostPath =
          persisted.conflictsByHostPath ?? persisted.conflictsByPath ?? currentState.conflictsByHostPath;
        return {
          ...currentState,
          ...persisted,
          snapshotsByHostPath,
          mountedFileTreesByHostPath: currentState.mountedFileTreesByHostPath,
          attachmentsByHostPath,
          conflictsByHostPath,
          activeHostWorkspacePath:
            persisted.activeHostWorkspacePath ?? persisted.activeWorkspacePath ?? null,
          isRefreshing: false,
          lastError: null,
        };
      },
      partialize: (state) => ({
        integrationEnabled: state.integrationEnabled,
        snapshotsByHostPath: state.snapshotsByHostPath,
        attachmentsByHostPath: state.attachmentsByHostPath,
        conflictsByHostPath: state.conflictsByHostPath,
        activeHostWorkspacePath: state.activeHostWorkspacePath,
      }),
    },
  ),
);
