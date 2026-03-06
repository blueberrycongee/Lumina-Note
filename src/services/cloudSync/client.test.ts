import { describe, expect, it } from 'vitest';
import {
  buildCloudWebDavConfig,
  normalizeCloudBaseUrl,
  parseCloudErrorMessage,
} from '@/services/cloudSync/client';

describe('cloudSync client helpers', () => {
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
      })
    ).toEqual({
      server_url: 'https://sync.example.com/dav',
      username: 'dev@example.com',
      password: 'secret',
      remote_base_path: '/workspace-1',
      auto_sync: false,
      sync_interval_secs: 300,
    });
  });

  it('extracts the user-facing message from structured cloud errors', () => {
    expect(parseCloudErrorMessage('{"code":"invalid_credentials","message":"Wrong password"}')).toBe(
      'Wrong password'
    );
  });
});
