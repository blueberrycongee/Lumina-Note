import { useEffect, useState } from 'react';

import { getUsage } from '@/services/luminaCloud';
import type { UsageResponse } from '@/services/luminaCloud';
import { useLicenseStore } from '@/stores/useLicenseStore';

const POLL_MS = 60_000;

/**
 * "X / Y tokens used this month, resets on …" panel. Renders nothing when
 * no valid license is present (no empty-state flash). On network failure,
 * keeps showing the last known good value with a quiet "Retrying…" hint.
 */
export function CloudUsagePanel(): JSX.Element | null {
  const license = useLicenseStore((s) => s.license);
  const status = useLicenseStore((s) => s.status);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (status !== 'valid' || !license) {
      setUsage(null);
      setRetrying(false);
      return;
    }

    let cancelled = false;

    async function tick(): Promise<void> {
      try {
        const next = await getUsage(license as string);
        if (cancelled) return;
        setUsage(next);
        setRetrying(false);
      } catch (err) {
        if (cancelled) return;
        setRetrying(true);
        console.warn('[cloud-usage] fetch failed', err);
      }
    }

    void tick();
    const interval = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [license, status]);

  if (status !== 'valid' || !license) return null;

  return (
    <section className="space-y-2" aria-label="Cloud usage">
      <h3 className="text-sm font-medium">Cloud usage this month</h3>

      {usage ? (
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          <span className="font-mono">{formatTokens(usage.tokens_used)}</span>
          {' / '}
          <span className="font-mono">{formatTokens(usage.tokens_quota)}</span>
          {' tokens used. Resets on '}
          {formatResetDate(usage.period_end)}.
          {retrying && (
            <span className="ml-2 text-xs text-neutral-500" role="status">
              Retrying…
            </span>
          )}
        </p>
      ) : retrying ? (
        <p className="text-sm text-neutral-500" role="status">
          Could not fetch usage. Retrying…
        </p>
      ) : (
        <p className="text-sm text-neutral-500" role="status">
          Loading usage…
        </p>
      )}
    </section>
  );
}

function formatTokens(n: number): string {
  return n.toLocaleString('en-US');
}

function formatResetDate(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms).toISOString().slice(0, 10);
}
