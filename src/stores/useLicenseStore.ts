import { create } from 'zustand';

import {
  loadLicense,
  removeLicense,
  saveLicense,
  verifyLicense,
} from '@/services/luminaCloud';
import type { LicensePayload, LicenseStatus } from '@/services/luminaCloud';

interface LicenseStoreState {
  license: string | null;
  payload: LicensePayload | null;
  status: LicenseStatus;
  /**
   * Verify a freshly-pasted license, persist it to the OS keychain on success,
   * and update in-memory state. Persistence failure does not flip status away
   * from `valid` — the in-memory token is still useable for the rest of the
   * session, just not across restarts.
   */
  setLicense: (token: string) => Promise<void>;
  /**
   * Wipe the in-memory license + payload, then remove from the keychain.
   * `idle` (not `invalid`) — the user explicitly cleared.
   */
  clearLicense: () => Promise<void>;
  /**
   * Read the keychain on app start. If the stored token still verifies, lift
   * it into memory; otherwise discard. Call once at boot.
   */
  refreshFromKeychain: () => Promise<void>;
}

export const useLicenseStore = create<LicenseStoreState>((set) => ({
  license: null,
  payload: null,
  status: 'idle',

  async setLicense(token) {
    set({ status: 'loading' });
    const payload = verifyLicense(token);
    if (!payload) {
      set({ license: null, payload: null, status: 'invalid' });
      return;
    }
    try {
      await saveLicense(token);
    } catch (err) {
      console.error('[license] saveLicense failed; in-memory only', err);
    }
    set({ license: token, payload, status: 'valid' });
  },

  async clearLicense() {
    try {
      await removeLicense();
    } catch (err) {
      console.error('[license] removeLicense failed', err);
    }
    set({ license: null, payload: null, status: 'idle' });
  },

  async refreshFromKeychain() {
    set({ status: 'loading' });
    let token: string | null = null;
    try {
      token = await loadLicense();
    } catch (err) {
      console.error('[license] loadLicense failed', err);
    }
    if (!token) {
      set({ license: null, payload: null, status: 'idle' });
      return;
    }
    const payload = verifyLicense(token);
    if (!payload) {
      set({ license: null, payload: null, status: 'invalid' });
      return;
    }
    set({ license: token, payload, status: 'valid' });
  },
}));
