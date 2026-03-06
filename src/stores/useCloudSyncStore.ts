import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthSession, WorkspaceSummary } from '@lumina/shared';
import { DEFAULT_SYNC_INTERVAL_SECS } from '@lumina/shared';
import { useWebDAVStore } from '@/stores/useWebDAVStore';
import {
  buildCloudWebDavConfig,
  createCloudWorkspace,
  listCloudWorkspaces,
  loginCloudAccount,
  normalizeCloudBaseUrl,
  refreshCloudToken,
  registerCloudAccount,
} from '@/services/cloudSync/client';

export type CloudAuthStatus = 'anonymous' | 'authenticating' | 'authenticated';

interface CloudSyncState {
  serverBaseUrl: string;
  email: string;
  password: string;
  autoSync: boolean;
  syncIntervalSecs: number;
  session: AuthSession | null;
  authStatus: CloudAuthStatus;
  isLoading: boolean;
  error: string | null;
  setServerBaseUrl: (value: string) => void;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  setSyncPreferences: (input: { autoSync?: boolean; syncIntervalSecs?: number }) => void;
  register: () => Promise<AuthSession | null>;
  login: () => Promise<AuthSession | null>;
  refreshSession: () => Promise<string | null>;
  loadWorkspaces: () => Promise<WorkspaceSummary[] | null>;
  createWorkspace: (name: string) => Promise<WorkspaceSummary | null>;
  selectWorkspace: (workspaceId: string) => void;
  logout: () => void;
}

function deriveNextSession(input: Omit<AuthSession, 'currentWorkspaceId'> & { currentWorkspaceId?: string | null }): AuthSession {
  return {
    ...input,
    currentWorkspaceId: input.currentWorkspaceId ?? input.workspaces[0]?.id ?? null,
  };
}

function syncDerivedWebDav(state: Pick<CloudSyncState, 'serverBaseUrl' | 'email' | 'password' | 'autoSync' | 'syncIntervalSecs' | 'session'>) {
  const workspaceId = state.session?.currentWorkspaceId;
  if (!workspaceId || !state.serverBaseUrl || !state.email || !state.password) {
    useWebDAVStore.getState().resetConfig();
    return;
  }

  useWebDAVStore.getState().setConfig(
    buildCloudWebDavConfig({
      baseUrl: state.serverBaseUrl,
      email: state.email,
      password: state.password,
      workspaceId,
      autoSync: state.autoSync,
      syncIntervalSecs: state.syncIntervalSecs,
    })
  );
}

async function authenticate(
  get: () => CloudSyncState,
  set: (partial: Partial<CloudSyncState>) => void,
  mode: 'register' | 'login'
): Promise<AuthSession | null> {
  const state = get();
  set({ isLoading: true, authStatus: 'authenticating', error: null });
  try {
    const credentials = {
      baseUrl: state.serverBaseUrl,
      email: state.email,
      password: state.password,
    };
    const response =
      mode === 'register'
        ? await registerCloudAccount(credentials)
        : await loginCloudAccount(credentials);
    const session = deriveNextSession(response);
    set({ session, authStatus: 'authenticated', isLoading: false, error: null });
    syncDerivedWebDav({ ...get(), session });
    return session;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    set({ isLoading: false, authStatus: 'anonymous', error: message, session: null });
    useWebDAVStore.getState().resetConfig();
    return null;
  }
}

export const useCloudSyncStore = create<CloudSyncState>()(
  persist(
    (set, get) => ({
      serverBaseUrl: '',
      email: '',
      password: '',
      autoSync: false,
      syncIntervalSecs: DEFAULT_SYNC_INTERVAL_SECS,
      session: null,
      authStatus: 'anonymous',
      isLoading: false,
      error: null,
      setServerBaseUrl: (value) => set({ serverBaseUrl: normalizeCloudBaseUrl(value) }),
      setEmail: (value) => set({ email: value }),
      setPassword: (value) => set({ password: value }),
      setSyncPreferences: (input) => {
        const next = {
          autoSync: input.autoSync ?? get().autoSync,
          syncIntervalSecs: input.syncIntervalSecs ?? get().syncIntervalSecs,
        };
        set(next);
        syncDerivedWebDav({ ...get(), ...next });
      },
      register: async () => authenticate(get, set, 'register'),
      login: async () => authenticate(get, set, 'login'),
      refreshSession: async () => {
        const { session, serverBaseUrl } = get();
        if (!session) return null;
        try {
          const response = await refreshCloudToken(serverBaseUrl, session.token);
          const nextSession = { ...session, token: response.token };
          set({ session: nextSession, authStatus: 'authenticated', error: null });
          return response.token;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set({ error: message, authStatus: 'anonymous', session: null });
          return null;
        }
      },
      loadWorkspaces: async () => {
        const { session, serverBaseUrl } = get();
        if (!session) return null;
        try {
          const workspaces = await listCloudWorkspaces(serverBaseUrl, session.token);
          const nextSession = deriveNextSession({ ...session, workspaces, currentWorkspaceId: session.currentWorkspaceId });
          set({ session: nextSession, error: null });
          syncDerivedWebDav({ ...get(), session: nextSession });
          return workspaces;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set({ error: message });
          return null;
        }
      },
      createWorkspace: async (name) => {
        const { session, serverBaseUrl } = get();
        if (!session) {
          set({ error: 'Please sign in first' });
          return null;
        }
        try {
          const workspace = await createCloudWorkspace(serverBaseUrl, session.token, { name });
          const nextSession = deriveNextSession({
            ...session,
            workspaces: [workspace, ...session.workspaces],
            currentWorkspaceId: workspace.id,
          });
          set({ session: nextSession, error: null });
          syncDerivedWebDav({ ...get(), session: nextSession });
          return workspace;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set({ error: message });
          return null;
        }
      },
      selectWorkspace: (workspaceId) => {
        const session = get().session;
        if (!session) return;
        const nextSession = { ...session, currentWorkspaceId: workspaceId };
        set({ session: nextSession, error: null });
        syncDerivedWebDav({ ...get(), session: nextSession });
      },
      logout: () => {
        set({ session: null, authStatus: 'anonymous', password: '', error: null });
        useWebDAVStore.getState().resetConfig();
      },
    }),
    {
      name: 'lumina-cloud-sync',
      partialize: (state) => ({
        serverBaseUrl: state.serverBaseUrl,
        email: state.email,
        password: '',
        autoSync: state.autoSync,
        syncIntervalSecs: state.syncIntervalSecs,
        session: state.session,
        authStatus: state.session ? 'authenticated' : 'anonymous',
        isLoading: false,
        error: null,
      }),
    }
  )
);
