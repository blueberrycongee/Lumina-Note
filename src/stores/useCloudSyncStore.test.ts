import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWebDAVStore } from '@/stores/useWebDAVStore';
import { useCloudSyncStore } from '@/stores/useCloudSyncStore';

const tauriFetchJsonMock = vi.fn();

vi.mock('@/lib/tauriFetch', () => ({
  tauriFetchJson: (...args: unknown[]) => tauriFetchJsonMock(...args),
}));

const setSecureTokenMock = vi.fn().mockResolvedValue(undefined);
const getSecureTokenMock = vi.fn().mockResolvedValue('mock-token');
const deleteSecureTokenMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/secureStore', () => ({
  getSecureToken: (...args: unknown[]) => getSecureTokenMock(...args),
  setSecureToken: (...args: unknown[]) => setSecureTokenMock(...args),
  deleteSecureToken: (...args: unknown[]) => deleteSecureTokenMock(...args),
}));

const resetStores = () => {
  useCloudSyncStore.persist?.clearStorage?.();
  useWebDAVStore.persist?.clearStorage?.();

  useCloudSyncStore.setState({
    serverBaseUrl: '',
    email: '',
    password: '',
    session: null,
    authStatus: 'anonymous',
    isLoading: false,
    error: null,
  });

  useWebDAVStore.setState({
    config: {
      server_url: '',
      username: '',
      password: '',
      remote_base_path: '/',
      auto_sync: false,
      sync_interval_secs: 300,
    },
    isConfigured: false,
    isConnected: false,
    connectionError: null,
    syncProgress: {
      stage: 'Idle',
      total: 0,
      processed: 0,
      current_file: null,
      error: null,
    },
    lastSyncResult: null,
    lastSyncTime: null,
    pendingSyncPlan: null,
  });
};

describe('useCloudSyncStore', () => {
  beforeEach(() => {
    tauriFetchJsonMock.mockReset();
    setSecureTokenMock.mockReset().mockResolvedValue(undefined);
    getSecureTokenMock.mockReset().mockResolvedValue('mock-token');
    deleteSecureTokenMock.mockReset().mockResolvedValue(undefined);
    resetStores();
  });

  it('logs in and derives a workspace-bound webdav config', async () => {
    tauriFetchJsonMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        token: 'token-1',
        user: { id: 'user-1', email: 'dev@example.com' },
        workspaces: [{ id: 'workspace-1', name: 'Personal' }],
      },
    });

    useCloudSyncStore.setState({
      serverBaseUrl: 'https://sync.example.com/',
      email: 'dev@example.com',
      password: 'secret',
    });

    const result = await useCloudSyncStore.getState().login();

    expect(result?.currentWorkspaceId).toBe('workspace-1');
    expect(useWebDAVStore.getState().config).toEqual({
      server_url: 'https://sync.example.com/dav',
      username: 'dev@example.com',
      password: 'secret',
      remote_base_path: '/workspace-1',
      auto_sync: false,
      sync_interval_secs: 300,
    });
    expect(useWebDAVStore.getState().isConfigured).toBe(true);
  });

  it('creates a workspace and rebinds sync to the new remote path', async () => {
    useCloudSyncStore.setState({
      serverBaseUrl: 'https://sync.example.com',
      email: 'dev@example.com',
      password: 'secret',
      session: {
        token: 'token-1',
        user: { id: 'user-1', email: 'dev@example.com' },
        workspaces: [{ id: 'workspace-1', name: 'Personal' }],
        currentWorkspaceId: 'workspace-1',
      },
      authStatus: 'authenticated',
    });

    tauriFetchJsonMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { id: 'workspace-2', name: 'Team Notes' },
    });

    const workspace = await useCloudSyncStore.getState().createWorkspace('Team Notes');

    expect(workspace?.id).toBe('workspace-2');
    expect(useCloudSyncStore.getState().session?.currentWorkspaceId).toBe('workspace-2');
    expect(useWebDAVStore.getState().config.remote_base_path).toBe('/workspace-2');
  });

  it('login saves token to keychain', async () => {
    tauriFetchJsonMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        token: 'secure-token',
        user: { id: 'user-1', email: 'dev@example.com' },
        workspaces: [{ id: 'ws-1', name: 'Personal' }],
      },
    });

    useCloudSyncStore.setState({
      serverBaseUrl: 'https://sync.example.com',
      email: 'dev@example.com',
      password: 'secret',
    });

    await useCloudSyncStore.getState().login();

    expect(setSecureTokenMock).toHaveBeenCalledWith('secure-token');
  });

  it('logout deletes token from keychain', () => {
    useCloudSyncStore.setState({
      session: {
        token: 'some-token',
        user: { id: 'u1', email: 'test@example.com' },
        workspaces: [],
        currentWorkspaceId: null,
      },
      authStatus: 'authenticated',
    });

    useCloudSyncStore.getState().logout();

    expect(deleteSecureTokenMock).toHaveBeenCalled();
    expect(useCloudSyncStore.getState().session).toBeNull();
  });

  it('rehydrateToken restores token from keychain', async () => {
    getSecureTokenMock.mockResolvedValue('keychain-token');

    useCloudSyncStore.setState({
      session: {
        token: '',
        user: { id: 'u1', email: 'test@example.com' },
        workspaces: [],
        currentWorkspaceId: null,
      },
      authStatus: 'authenticated',
    });

    await useCloudSyncStore.getState().rehydrateToken();

    expect(useCloudSyncStore.getState().session?.token).toBe('keychain-token');
    expect(useCloudSyncStore.getState().authStatus).toBe('authenticated');
  });

  it('rehydrateToken forces re-login when keychain has no token', async () => {
    getSecureTokenMock.mockResolvedValue(null);

    useCloudSyncStore.setState({
      session: {
        token: '',
        user: { id: 'u1', email: 'test@example.com' },
        workspaces: [],
        currentWorkspaceId: null,
      },
      authStatus: 'authenticated',
    });

    await useCloudSyncStore.getState().rehydrateToken();

    expect(useCloudSyncStore.getState().session).toBeNull();
    expect(useCloudSyncStore.getState().authStatus).toBe('anonymous');
  });

  it('logs out and clears cloud-derived webdav credentials', async () => {
    useCloudSyncStore.setState({
      serverBaseUrl: 'https://sync.example.com',
      email: 'dev@example.com',
      password: 'secret',
      session: {
        token: 'token-1',
        user: { id: 'user-1', email: 'dev@example.com' },
        workspaces: [{ id: 'workspace-1', name: 'Personal' }],
        currentWorkspaceId: 'workspace-1',
      },
      authStatus: 'authenticated',
    });

    useCloudSyncStore.getState().logout();

    expect(useCloudSyncStore.getState().session).toBeNull();
    expect(useCloudSyncStore.getState().password).toBe('');
    expect(useWebDAVStore.getState().config.server_url).toBe('');
    expect(useWebDAVStore.getState().isConfigured).toBe(false);
  });
});
