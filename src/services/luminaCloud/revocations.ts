import { getRevocations as defaultFetchRevocations } from './client';
import type { RevocationsResponse } from './types';

/**
 * Daily-refreshed local cache of revoked license ids per CONTRACT.md §2.5.
 *
 * The cache is intentionally fail-open: any storage or network failure
 * resolves to "not revoked" rather than blocking the user. Revocation is
 * a defense-in-depth signal layered on top of `expires_at`; a temporary
 * outage shouldn't lock people out of cloud features.
 */

export const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export interface RevocationCacheData {
  as_of: string;
  revoked_lids: string[];
}

export interface RevocationStorage {
  read(): Promise<RevocationCacheData | null>;
  write(cache: RevocationCacheData): Promise<void>;
}

export interface RevocationCacheOptions {
  storage: RevocationStorage;
  fetchFresh: (since?: string) => Promise<RevocationsResponse>;
  /** Override for tests; defaults to `Date.now`. */
  now?: () => number;
  /** Cache TTL in ms; defaults to 24h. */
  ttlMs?: number;
}

export interface RevocationCache {
  /** Returns true iff `lid` is in a fresh-or-stale-but-non-empty cache. */
  isRevoked(lid: string): Promise<boolean>;
  /** Force a refresh from the server, ignoring cache age. */
  refresh(): Promise<RevocationCacheData | null>;
}

export function createRevocationCache(opts: RevocationCacheOptions): RevocationCache {
  const now = opts.now ?? (() => Date.now());
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  let inFlight: Promise<RevocationCacheData | null> | null = null;

  async function getCurrent(): Promise<RevocationCacheData | null> {
    let stored: RevocationCacheData | null = null;
    try {
      stored = await opts.storage.read();
    } catch (err) {
      console.warn('[revocations] storage read failed', err);
      stored = null;
    }
    if (stored && isFresh(stored, now(), ttlMs)) return stored;
    return refreshCoalesced(stored);
  }

  function refreshCoalesced(stale: RevocationCacheData | null): Promise<RevocationCacheData | null> {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const fresh = await opts.fetchFresh(stale?.as_of);
        const next: RevocationCacheData = {
          as_of: fresh.as_of,
          revoked_lids: fresh.revoked_lids,
        };
        try {
          await opts.storage.write(next);
        } catch (err) {
          console.warn('[revocations] storage write failed; in-memory cache only', err);
        }
        return next;
      } catch (err) {
        console.warn('[revocations] refresh failed; using stale cache', err);
        return stale;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  return {
    async isRevoked(lid) {
      const cache = await getCurrent();
      if (!cache) return false;
      return cache.revoked_lids.includes(lid);
    },
    async refresh() {
      let stored: RevocationCacheData | null = null;
      try {
        stored = await opts.storage.read();
      } catch {
        stored = null;
      }
      return refreshCoalesced(stored);
    },
  };
}

function isFresh(cache: RevocationCacheData, nowMs: number, ttlMs: number): boolean {
  const asOf = Date.parse(cache.as_of);
  if (!Number.isFinite(asOf)) return false;
  return nowMs - asOf < ttlMs;
}

// ── Default singleton ──────────────────────────────────────────────────────
//
// Until persistent storage lands (pending the C3 IPC decision in PR #219), the
// default cache is in-memory only. It still de-dupes refresh calls inside a
// session and degrades to fail-open on network failure; persistence across
// restarts will follow when C3 unblocks.

const memory: { current: RevocationCacheData | null } = { current: null };

const memoryStorage: RevocationStorage = {
  async read() {
    return memory.current;
  },
  async write(cache) {
    memory.current = cache;
  },
};

const defaultCache = createRevocationCache({
  storage: memoryStorage,
  fetchFresh: (since) => defaultFetchRevocations(since),
});

export async function isRevoked(lid: string): Promise<boolean> {
  return defaultCache.isRevoked(lid);
}

export async function refreshRevocations(): Promise<RevocationCacheData | null> {
  return defaultCache.refresh();
}
