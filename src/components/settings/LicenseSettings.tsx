import { useState } from 'react';

import type { LicensePayload } from '@/services/luminaCloud';
import { useLicenseStore } from '@/stores/useLicenseStore';

/**
 * License paste / view / remove panel. Standalone — no dependency on
 * AISettingsModal. Mounted by C10 (Account tab).
 */
export function LicenseSettings(): JSX.Element {
  const status = useLicenseStore((s) => s.status);
  const payload = useLicenseStore((s) => s.payload);
  const setLicense = useLicenseStore((s) => s.setLicense);
  const clearLicense = useLicenseStore((s) => s.clearLicense);

  const [draft, setDraft] = useState('');
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  async function handleVerify() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    await setLicense(trimmed);
  }

  async function handleRemove() {
    await clearLicense();
    setConfirmingRemove(false);
    setDraft('');
  }

  if (status === 'valid' && payload) {
    return (
      <section className="space-y-4" aria-labelledby="license-heading">
        <header>
          <h2 id="license-heading" className="text-base font-medium">
            Lumina Cloud license
          </h2>
        </header>

        <ValidLicenseSummary payload={payload} />

        {confirmingRemove ? (
          <div className="flex items-center gap-2 text-sm" role="alertdialog" aria-label="Confirm remove">
            <span className="text-neutral-600 dark:text-neutral-300">
              Remove this license? Cloud features will stop working until you paste it again.
            </span>
            <button
              type="button"
              onClick={handleRemove}
              className="rounded border border-red-400 px-2 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            >
              Remove
            </button>
            <button
              type="button"
              onClick={() => setConfirmingRemove(false)}
              className="rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingRemove(true)}
            className="text-sm text-neutral-600 underline-offset-4 hover:underline dark:text-neutral-400"
          >
            Remove license
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-4" aria-labelledby="license-heading">
      <header className="space-y-1">
        <h2 id="license-heading" className="text-base font-medium">
          Lumina Cloud license
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Paste the license you received by email. Verification happens locally — no network call required.
        </p>
      </header>

      <label className="block space-y-2">
        <span className="text-sm font-medium">License token</span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="eyJ…(payload).…(signature)"
          rows={3}
          spellCheck={false}
          autoComplete="off"
          aria-label="License token"
          className="w-full rounded border border-neutral-300 bg-white p-2 font-mono text-xs focus:border-neutral-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-900"
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleVerify}
          disabled={status === 'loading' || draft.trim().length === 0}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {status === 'loading' ? 'Verifying…' : 'Verify'}
        </button>

        <StatusLine status={status} />
      </div>
    </section>
  );
}

function StatusLine({ status }: { status: ReturnType<typeof useLicenseStore.getState>['status'] }): JSX.Element | null {
  if (status === 'loading') {
    return (
      <span role="status" className="text-sm text-neutral-500">
        Verifying…
      </span>
    );
  }
  if (status === 'invalid') {
    return (
      <span role="alert" className="text-sm text-red-600 dark:text-red-400">
        Could not verify this license. Check the token and try again.
      </span>
    );
  }
  return null;
}

function ValidLicenseSummary({ payload }: { payload: LicensePayload }): JSX.Element {
  return (
    <dl className="space-y-2 text-sm">
      <Row label="Email" value={payload.email} />
      <Row label="SKU" value={payload.sku} />
      <Row label="Expires" value={formatExpiry(payload.expires_at)} />
      {payload.features.length > 0 && (
        <div className="flex items-baseline gap-3">
          <dt className="w-20 shrink-0 text-neutral-500">Features</dt>
          <dd className="flex flex-wrap gap-1.5">
            {payload.features.map((flag) => (
              <span
                key={flag}
                className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
              >
                {flag}
              </span>
            ))}
          </dd>
        </div>
      )}
    </dl>
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-20 shrink-0 text-neutral-500">{label}</dt>
      <dd className="font-mono text-xs">{value}</dd>
    </div>
  );
}

function formatExpiry(expiresAt: string | null): string {
  if (expiresAt === null) return 'Lifetime';
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms)) return expiresAt;
  return new Date(ms).toISOString().slice(0, 10);
}
