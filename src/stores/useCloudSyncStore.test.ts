import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWebDAVStore } from '@/stores/useWebDAVStore';
import { useCloudSyncStore } from '@/stores/useCloudSyncStore';

const tauriFetchJsonMock = vi.fn();

vi.mock('@/lib/tauriFetch', () => ({
  tauriFetchJson: (...args: unknown[]) => tauriFetchJsonMock(...args),
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
