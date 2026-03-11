import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriFetchJsonMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/tauriFetch', () => ({
  tauriFetchJson: tauriFetchJsonMock,
}));

import {
  buildCloudWebDavConfig,
  createCloudWorkspace,
  listCloudWorkspaces,
  loginCloudAccount,
  normalizeCloudBaseUrl,
  parseCloudErrorMessage,
  refreshCloudToken,
  registerCloudAccount,
} from '@/services/cloudSync/client';

describe('cloudSync client helpers', () => {
  beforeEach(() => {
    tauriFetchJsonMock.mockReset();
  });

  it('normalizes server base urls without trailing slashes', () => {
    expect(normalizeCloudBaseUrl(' https://sync.example.com/// ')).toBe('https://sync.example.com');
  });

  it('derives webdav config from the selected cloud workspace', () => {
    expect(
      buildCloudWebDavConfig({
        baseUrl: 'https://sync.example.com/',
        email: 'dev@example.com',
        password: 'secret',
        workspaceId: 'workspace-1',
      }),
    ).toEqual({
      server_url: 'https://sync.example.com/dav',
      username: 'dev@example.com',
      password: 'secret',
      remote_base_path: '/workspace-1',
      auto_sync: false,
      sync_interval_secs: 300,
    });
  });

  it('extracts the user-facing message from structured cloud errors and falls back to raw text', () => {
    expect(parseCloudErrorMessage('{"code":"invalid_credentials","message":"Wrong password"}')).toBe(
      'Wrong password',
    );
    expect(parseCloudErrorMessage('plain error')).toBe('plain error');
  });

  it('posts auth requests with normalized urls', async () => {
    tauriFetchJsonMock
      .mockResolvedValueOnce({ ok: true, data: { token: 'register-token' } })
      .mockResolvedValueOnce({ ok: true, data: { token: 'login-token' } });

    await expect(
      registerCloudAccount({
        baseUrl: 'https://sync.example.com/',
        email: 'dev@example.com',
        password: 'secret',
      }),
    ).resolves.toEqual({ token: 'register-token' });
    await expect(
      loginCloudAccount({
        baseUrl: 'https://sync.example.com',
        email: 'dev@example.com',
        password: 'secret',
      }),
    ).resolves.toEqual({ token: 'login-token' });

    expect(tauriFetchJsonMock).toHaveBeenNthCalledWith(
      1,
      'https://sync.example.com/auth/register',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(tauriFetchJsonMock).toHaveBeenNthCalledWith(
      2,
      'https://sync.example.com/auth/login',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sends bearer token headers for refresh, listing, and workspace creation', async () => {
    tauriFetchJsonMock
      .mockResolvedValueOnce({ ok: true, data: { token: 'next-token' } })
      .mockResolvedValueOnce({ ok: true, data: [{ id: 'w1', name: 'Workspace' }] })
      .mockResolvedValueOnce({ ok: true, data: { id: 'w2', name: 'New Workspace' } });

    await refreshCloudToken('https://sync.example.com/', 'abc');
    await listCloudWorkspaces('https://sync.example.com', 'abc');
    await createCloudWorkspace('https://sync.example.com', 'abc', { name: 'New Workspace' } as never);

    expect(tauriFetchJsonMock).toHaveBeenNthCalledWith(
      1,
      'https://sync.example.com/auth/refresh',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer abc' }) }),
    );
    expect(tauriFetchJsonMock).toHaveBeenNthCalledWith(
      2,
      'https://sync.example.com/workspaces',
      expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer abc' } }),
    );
    expect(tauriFetchJsonMock).toHaveBeenNthCalledWith(
      3,
      'https://sync.example.com/workspaces',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer abc' }) }),
    );
  });

  it('throws parsed error messages when cloud requests fail', async () => {
    tauriFetchJsonMock.mockResolvedValueOnce({
      ok: false,
      error: '{"message":"Wrong password"}',
      data: null,
    });

    await expect(
      loginCloudAccount({
        baseUrl: 'https://sync.example.com',
        email: 'dev@example.com',
        password: 'wrong',
      }),
    ).rejects.toThrow('Wrong password');
  });
});
