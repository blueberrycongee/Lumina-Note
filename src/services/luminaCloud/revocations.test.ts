import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createRevocationCache,
  DEFAULT_TTL_MS,
  type RevocationCacheData,
  type RevocationStorage,
} from './revocations';
import type { RevocationsResponse } from './types';

function memoryStorage(initial: RevocationCacheData | null = null) {
  const slot: { current: RevocationCacheData | null } = { current: initial };
  const storage: RevocationStorage = {
    read: vi.fn(async () => slot.current),
    write: vi.fn(async (cache) => {
      slot.current = cache;
    }),
  };
  return { storage, slot };
}

function fixedNow(ms: number): () => number {
  return () => ms;
}

const T0 = Date.parse('2026-04-28T00:00:00Z');

describe('createRevocationCache', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('cold cache: fetches fresh, writes through storage, returns membership', async () => {
    const { storage } = memoryStorage(null);
    const fetchFresh = vi.fn<() => Promise<RevocationsResponse>>().mockResolvedValue({
      as_of: '2026-04-28T00:00:00Z',
      revoked_lids: ['lic_revoked_a'],
    });
    const cache = createRevocationCache({ storage, fetchFresh, now: fixedNow(T0 + 1000) });

    expect(await cache.isRevoked('lic_revoked_a')).toBe(true);
    expect(await cache.isRevoked('lic_clean')).toBe(false);
    expect(fetchFresh).toHaveBeenCalledTimes(1);
    expect(storage.write).toHaveBeenCalledWith({
      as_of: '2026-04-28T00:00:00Z',
      revoked_lids: ['lic_revoked_a'],
    });
  });

  it('warm cache: reads stored data without hitting the network', async () => {
    const stored: RevocationCacheData = {
      as_of: '2026-04-28T00:00:00Z',
      revoked_lids: ['lic_revoked_a'],
    };
    const { storage } = memoryStorage(stored);
    const fetchFresh = vi.fn<() => Promise<RevocationsResponse>>();
    // 12h after as_of — well within the 24h TTL
    const cache = createRevocationCache({
      storage,
      fetchFresh,
      now: fixedNow(T0 + 12 * 60 * 60 * 1000),
    });

    expect(await cache.isRevoked('lic_revoked_a')).toBe(true);
    expect(await cache.isRevoked('lic_clean')).toBe(false);
    expect(fetchFresh).not.toHaveBeenCalled();
  });

  it('expired cache: refreshes and replaces the stored data', async () => {
    const stored: RevocationCacheData = {
      as_of: '2026-04-28T00:00:00Z',
      revoked_lids: ['lic_old'],
    };
    const { storage, slot } = memoryStorage(stored);
    const fetchFresh = vi.fn<(since?: string) => Promise<RevocationsResponse>>().mockResolvedValue({
      as_of: '2026-04-29T00:00:00Z',
      revoked_lids: ['lic_old', 'lic_new'],
    });
    // 25h after as_of — past the 24h TTL
    const cache = createRevocationCache({
      storage,
      fetchFresh,
      now: fixedNow(T0 + 25 * 60 * 60 * 1000),
    });

    expect(await cache.isRevoked('lic_new')).toBe(true);
    expect(fetchFresh).toHaveBeenCalledTimes(1);
    // refresh should pass `since` from the previous as_of
    expect(fetchFresh).toHaveBeenCalledWith('2026-04-28T00:00:00Z');
    expect(slot.current?.as_of).toBe('2026-04-29T00:00:00Z');
  });

  it('network failure with stale cache: keeps serving the stale data', async () => {
    const stored: RevocationCacheData = {
      as_of: '2026-04-27T00:00:00Z',
      revoked_lids: ['lic_old'],
    };
    const { storage, slot } = memoryStorage(stored);
    const fetchFresh = vi
      .fn<() => Promise<RevocationsResponse>>()
      .mockRejectedValue(new Error('network down'));
    // 26h after as_of — expired
    const cache = createRevocationCache({
      storage,
      fetchFresh,
      now: fixedNow(Date.parse('2026-04-27T00:00:00Z') + 26 * 60 * 60 * 1000),
    });

    expect(await cache.isRevoked('lic_old')).toBe(true);
    expect(await cache.isRevoked('lic_new')).toBe(false);
    expect(fetchFresh).toHaveBeenCalled();
    // Storage should not have been overwritten with the failed refresh.
    expect(slot.current).toEqual(stored);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('cold cache + network failure: fails open (returns false)', async () => {
    const { storage } = memoryStorage(null);
    const fetchFresh = vi
      .fn<() => Promise<RevocationsResponse>>()
      .mockRejectedValue(new Error('network down'));
    const cache = createRevocationCache({ storage, fetchFresh, now: fixedNow(T0) });

    expect(await cache.isRevoked('lic_anything')).toBe(false);
    expect(storage.write).not.toHaveBeenCalled();
  });

  it('coalesces concurrent refreshes into a single fetch', async () => {
    const { storage } = memoryStorage(null);
    let resolveFetch!: (value: RevocationsResponse) => void;
    const fetchPromise = new Promise<RevocationsResponse>((r) => {
      resolveFetch = r;
    });
    const fetchFresh = vi.fn<() => Promise<RevocationsResponse>>(() => fetchPromise);
    const cache = createRevocationCache({ storage, fetchFresh, now: fixedNow(T0) });

    const a = cache.isRevoked('lic_a');
    const b = cache.isRevoked('lic_b');
    const c = cache.refresh();
    resolveFetch({ as_of: '2026-04-28T00:00:00Z', revoked_lids: ['lic_a'] });
    const [resA, resB] = await Promise.all([a, b, c]);

    expect(fetchFresh).toHaveBeenCalledTimes(1);
    expect(resA).toBe(true);
    expect(resB).toBe(false);
  });

  it('uses DEFAULT_TTL_MS when ttlMs is not provided', () => {
    expect(DEFAULT_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});
