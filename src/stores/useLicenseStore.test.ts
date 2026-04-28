import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LicensePayload } from '@/services/luminaCloud';

const verifyLicense = vi.hoisted(() => vi.fn());
const saveLicense = vi.hoisted(() => vi.fn());
const loadLicense = vi.hoisted(() => vi.fn());
const removeLicense = vi.hoisted(() => vi.fn());

vi.mock('@/services/luminaCloud', async () => {
  const actual = await vi.importActual<typeof import('@/services/luminaCloud')>(
    '@/services/luminaCloud'
  );
  return {
    ...actual,
    verifyLicense,
    saveLicense,
    loadLicense,
    removeLicense,
  };
});

import { useLicenseStore } from './useLicenseStore';

const VALID_PAYLOAD: LicensePayload = {
  v: 1,
  lid: 'lic_01HXTEST',
  email: 'fixture@example.com',
  sku: 'lumina-lifetime-founders',
  features: ['cloud_ai', 'sync'],
  issued_at: '2026-04-28T12:00:00Z',
  expires_at: null,
  order_id: 'creem_ord_test',
  device_limit: 5,
};

describe('useLicenseStore', () => {
  beforeEach(() => {
    useLicenseStore.setState({ license: null, payload: null, status: 'idle' });
    verifyLicense.mockReset();
    saveLicense.mockReset();
    loadLicense.mockReset();
    removeLicense.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('setLicense', () => {
    it('idle → loading → valid for a verified token', async () => {
      verifyLicense.mockReturnValue(VALID_PAYLOAD);
      saveLicense.mockResolvedValue(undefined);

      const transitions: string[] = [];
      const unsubscribe = useLicenseStore.subscribe((state, prev) => {
        if (state.status !== prev.status) transitions.push(state.status);
      });

      await useLicenseStore.getState().setLicense('valid-token');
      unsubscribe();

      expect(transitions).toEqual(['loading', 'valid']);
      const after = useLicenseStore.getState();
      expect(after.status).toBe('valid');
      expect(after.license).toBe('valid-token');
      expect(after.payload).toEqual(VALID_PAYLOAD);
      expect(saveLicense).toHaveBeenCalledWith('valid-token');
    });

    it('idle → loading → invalid for a token that fails verification', async () => {
      verifyLicense.mockReturnValue(null);

      const transitions: string[] = [];
      const unsubscribe = useLicenseStore.subscribe((state, prev) => {
        if (state.status !== prev.status) transitions.push(state.status);
      });

      await useLicenseStore.getState().setLicense('garbage');
      unsubscribe();

      expect(transitions).toEqual(['loading', 'invalid']);
      const after = useLicenseStore.getState();
      expect(after.status).toBe('invalid');
      expect(after.license).toBeNull();
      expect(after.payload).toBeNull();
      expect(saveLicense).not.toHaveBeenCalled();
    });

    it('keeps in-memory state valid even when keychain save throws', async () => {
      verifyLicense.mockReturnValue(VALID_PAYLOAD);
      saveLicense.mockRejectedValue(new Error('keychain unavailable'));
      const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});

      await useLicenseStore.getState().setLicense('valid-token');

      const after = useLicenseStore.getState();
      expect(after.status).toBe('valid');
      expect(after.license).toBe('valid-token');
      expect(consoleErr).toHaveBeenCalled();
    });
  });

  describe('clearLicense', () => {
    it('valid → idle and removes from keychain', async () => {
      useLicenseStore.setState({
        license: 'valid-token',
        payload: VALID_PAYLOAD,
        status: 'valid',
      });
      removeLicense.mockResolvedValue(undefined);

      await useLicenseStore.getState().clearLicense();

      const after = useLicenseStore.getState();
      expect(after.status).toBe('idle');
      expect(after.license).toBeNull();
      expect(after.payload).toBeNull();
      expect(removeLicense).toHaveBeenCalledTimes(1);
    });

    it('still clears in-memory state when keychain remove throws', async () => {
      useLicenseStore.setState({
        license: 'valid-token',
        payload: VALID_PAYLOAD,
        status: 'valid',
      });
      removeLicense.mockRejectedValue(new Error('keychain unavailable'));
      vi.spyOn(console, 'error').mockImplementation(() => {});

      await useLicenseStore.getState().clearLicense();

      expect(useLicenseStore.getState().status).toBe('idle');
    });
  });

  describe('refreshFromKeychain', () => {
    it('idle → loading → valid when keychain holds a verifying token', async () => {
      loadLicense.mockResolvedValue('stored-token');
      verifyLicense.mockReturnValue(VALID_PAYLOAD);

      const transitions: string[] = [];
      const unsubscribe = useLicenseStore.subscribe((state, prev) => {
        if (state.status !== prev.status) transitions.push(state.status);
      });

      await useLicenseStore.getState().refreshFromKeychain();
      unsubscribe();

      expect(transitions).toEqual(['loading', 'valid']);
      expect(useLicenseStore.getState().license).toBe('stored-token');
    });

    it('idle → loading → idle when keychain is empty', async () => {
      loadLicense.mockResolvedValue(null);

      const transitions: string[] = [];
      const unsubscribe = useLicenseStore.subscribe((state, prev) => {
        if (state.status !== prev.status) transitions.push(state.status);
      });

      await useLicenseStore.getState().refreshFromKeychain();
      unsubscribe();

      expect(transitions).toEqual(['loading', 'idle']);
      expect(useLicenseStore.getState().license).toBeNull();
      expect(verifyLicense).not.toHaveBeenCalled();
    });

    it('idle → loading → invalid when stored token no longer verifies', async () => {
      loadLicense.mockResolvedValue('stale-token');
      verifyLicense.mockReturnValue(null);

      const transitions: string[] = [];
      const unsubscribe = useLicenseStore.subscribe((state, prev) => {
        if (state.status !== prev.status) transitions.push(state.status);
      });

      await useLicenseStore.getState().refreshFromKeychain();
      unsubscribe();

      expect(transitions).toEqual(['loading', 'invalid']);
      expect(useLicenseStore.getState().license).toBeNull();
    });

    it('treats a keychain failure like an empty keychain (idle)', async () => {
      loadLicense.mockRejectedValue(new Error('keychain unavailable'));
      vi.spyOn(console, 'error').mockImplementation(() => {});

      await useLicenseStore.getState().refreshFromKeychain();

      expect(useLicenseStore.getState().status).toBe('idle');
    });
  });
});
