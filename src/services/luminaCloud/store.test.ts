import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());

vi.mock('@/lib/hostBridge', () => ({
  invoke,
}));

import { loadLicense, removeLicense, saveLicense } from './store';

beforeEach(() => {
  invoke.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('luminaCloud renderer-side store bridge', () => {
  it('saveLicense forwards to lumina_cloud_save_license', async () => {
    invoke.mockResolvedValue(null);

    await saveLicense('fixture-token');

    expect(invoke).toHaveBeenCalledWith('lumina_cloud_save_license', { license: 'fixture-token' });
  });

  it('loadLicense returns the string when invoke yields one', async () => {
    invoke.mockResolvedValue('fixture-token');

    expect(await loadLicense()).toBe('fixture-token');
    expect(invoke).toHaveBeenCalledWith('lumina_cloud_load_license');
  });

  it('loadLicense returns null when invoke yields null or non-string', async () => {
    invoke.mockResolvedValue(null);
    expect(await loadLicense()).toBeNull();

    invoke.mockResolvedValue(42);
    expect(await loadLicense()).toBeNull();
  });

  it('removeLicense forwards to lumina_cloud_remove_license', async () => {
    invoke.mockResolvedValue(null);

    await removeLicense();

    expect(invoke).toHaveBeenCalledWith('lumina_cloud_remove_license');
  });

  it('saveLicense propagates IPC errors', async () => {
    invoke.mockRejectedValue(new Error('IPC bridge unavailable'));
    await expect(saveLicense('fixture-token')).rejects.toThrow('IPC bridge unavailable');
  });
});
