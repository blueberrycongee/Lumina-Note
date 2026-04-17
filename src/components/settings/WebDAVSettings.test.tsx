import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WebDAVSettings } from '@/components/settings/WebDAVSettings';
import { useCloudSyncStore } from '@/stores/useCloudSyncStore';
import { useFileStore } from '@/stores/useFileStore';
import { useWebDAVStore } from '@/stores/useWebDAVStore';

const resetStores = () => {
  useCloudSyncStore.persist?.clearStorage?.();
  useWebDAVStore.persist?.clearStorage?.();

  useFileStore.setState({ vaultPath: '/vault' });
  useCloudSyncStore.setState({
    serverBaseUrl: '',
    email: '',
    password: '',
    autoSync: false,
    syncIntervalSecs: 300,
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

describe('WebDAVSettings cloud sync flow', () => {
  beforeEach(() => {
    resetStores();
  });

  it('shows cloud auth actions before the user signs in', () => {
    render(<WebDAVSettings compact />);

    expect(screen.getByRole('button', { name: '注册' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
    expect(screen.getByLabelText('云服务器')).toBeInTheDocument();
  });

  it('switches the selected cloud workspace and updates the derived sync path', () => {
    useCloudSyncStore.setState({
      serverBaseUrl: 'https://sync.example.com',
      email: 'dev@example.com',
      password: 'secret',
      session: {
        token: 'token-1',
        user: { id: 'user-1', email: 'dev@example.com' },
        workspaces: [
          { id: 'workspace-1', name: 'Personal' },
          { id: 'workspace-2', name: 'Research' },
        ],
        currentWorkspaceId: 'workspace-1',
      },
      authStatus: 'authenticated',
    });
    useWebDAVStore.setState({
      config: {
        server_url: 'https://sync.example.com/dav',
        username: 'dev@example.com',
        password: 'secret',
        remote_base_path: '/workspace-1',
        auto_sync: false,
        sync_interval_secs: 300,
      },
      isConfigured: true,
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

    render(<WebDAVSettings compact />);

    fireEvent.change(screen.getByLabelText('云工作区'), { target: { value: 'workspace-2' } });

    expect(useCloudSyncStore.getState().session?.currentWorkspaceId).toBe('workspace-2');
    expect(useWebDAVStore.getState().config.remote_base_path).toBe('/workspace-2');
    expect(screen.getByDisplayValue('https://sync.example.com/dav')).toBeDisabled();
  });

  it('dismisses cloud auth errors from the shared banner', () => {
    useCloudSyncStore.setState({ error: 'Wrong password' });
    useWebDAVStore.setState({ connectionError: 'Connection failed' });

    const { container } = render(<WebDAVSettings compact />);

    const alert = screen.getByText('Wrong password').closest('div');
    const closeButton = alert?.querySelector('button');

    expect(closeButton).not.toBeNull();
    fireEvent.click(closeButton!);

    expect(useCloudSyncStore.getState().error).toBeNull();
    expect(container).not.toHaveTextContent('Wrong password');
  });
});
