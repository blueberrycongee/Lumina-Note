import type {
  CloudErrorBody,
  CloudErrorCode,
  LicenseVerifyResponse,
  ModelsResponse,
  RevocationsResponse,
  UsageResponse,
} from './types';

/**
 * Typed HTTP client for the Lumina Cloud REST surface (CONTRACT.md §2).
 *
 * Base URL is configurable via `VITE_LUMINA_CLOUD_BASE_URL` (Vite-style env);
 * default `https://api.lumina-note.com`.
 */

export const DEFAULT_BASE_URL = 'https://api.lumina-note.com';

/**
 * `code` is either a server-defined CONTRACT.md §6 value, or a client-side
 * label (`'network'` / `'unknown'`) for failures that never reached the wire
 * or arrived without a parseable error body.
 */
export type LuminaCloudErrorCode = CloudErrorCode | 'network' | 'unknown';

export class LuminaCloudError extends Error {
  readonly code: LuminaCloudErrorCode;
  readonly status: number | null;
  readonly retryAfterSeconds: number | null;

  constructor(opts: {
    code: LuminaCloudErrorCode;
    message: string;
    status: number | null;
    retryAfterSeconds?: number | null;
  }) {
    super(opts.message);
    this.name = 'LuminaCloudError';
    this.code = opts.code;
    this.status = opts.status;
    this.retryAfterSeconds = opts.retryAfterSeconds ?? null;
  }
}

export function getBaseUrl(): string {
  const raw = readEnv('VITE_LUMINA_CLOUD_BASE_URL');
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) return DEFAULT_BASE_URL;
  return trimmed.replace(/\/+$/, '');
}

function readEnv(name: string): string | undefined {
  // Vite renderer: `import.meta.env` is the canonical source. Some test
  // harnesses (vitest's `vi.stubEnv`) only mirror to `process.env`, so check
  // both. `import.meta` is always defined in this ESM file; the optional
  // chaining guards a hypothetical future CJS consumer.
  const fromMeta = (import.meta as ImportMeta | undefined)?.env?.[name as keyof ImportMetaEnv];
  if (typeof fromMeta === 'string' && fromMeta.length > 0) return fromMeta;
  if (typeof process !== 'undefined' && process.env) {
    const fromProcess = process.env[name];
    if (typeof fromProcess === 'string' && fromProcess.length > 0) return fromProcess;
  }
  return undefined;
}

export async function verifyLicenseOnline(license: string): Promise<LicenseVerifyResponse> {
  return fetchJson(`${getBaseUrl()}/v1/license/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ license }),
  });
}

export async function getModels(license: string): Promise<ModelsResponse> {
  return fetchJson(`${getBaseUrl()}/v1/ai/models`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${license}` },
  });
}

export async function getUsage(license: string): Promise<UsageResponse> {
  return fetchJson(`${getBaseUrl()}/v1/account/usage`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${license}` },
  });
}

export async function getRevocations(since?: string): Promise<RevocationsResponse> {
  const url = new URL(`${getBaseUrl()}/v1/license/revocations`);
  if (since) url.searchParams.set('since', since);
  return fetchJson(url.toString(), { method: 'GET' });
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    throw new LuminaCloudError({
      code: 'network',
      message: err instanceof Error ? err.message : 'Network failure',
      status: null,
    });
  }
  if (!response.ok) {
    throw await readError(response);
  }
  // Tolerate empty 204 etc., though the contract has no 2xx-without-body cases.
  return (await response.json()) as T;
}

async function readError(response: Response): Promise<LuminaCloudError> {
  const status = response.status;
  const retryAfterRaw = response.headers.get('Retry-After');
  const parsedRetry = retryAfterRaw !== null ? Number.parseInt(retryAfterRaw, 10) : NaN;
  const retryAfterSeconds = Number.isFinite(parsedRetry) ? parsedRetry : null;

  let body: Partial<CloudErrorBody> | null = null;
  try {
    body = (await response.json()) as Partial<CloudErrorBody>;
  } catch {
    body = null;
  }

  // Server-supplied code wins (per CONTRACT.md §6 — server is authoritative).
  const code = body?.error?.code ?? codeForStatus(status);
  const message = body?.error?.message ?? `HTTP ${status}`;
  return new LuminaCloudError({ code, message, status, retryAfterSeconds });
}

function codeForStatus(status: number): LuminaCloudErrorCode {
  switch (status) {
    case 400:
      return 'bad_request';
    case 401:
      return 'invalid_license';
    case 402:
      return 'quota_exceeded';
    case 403:
      return 'feature_disabled';
    case 404:
      return 'not_found';
    case 429:
      return 'rate_limit';
    case 502:
      return 'upstream_unavailable';
    default:
      return status >= 500 ? 'internal' : 'unknown';
  }
}
