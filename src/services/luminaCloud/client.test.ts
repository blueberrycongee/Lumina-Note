import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_BASE_URL,
  getBaseUrl,
  getModels,
  getRevocations,
  getUsage,
  LuminaCloudError,
  verifyLicenseOnline,
} from './client';
import type { LuminaCloudErrorCode } from './client';

type FetchMock = ReturnType<typeof vi.fn>;

function mockFetch(): FetchMock {
  const fn = vi.fn();
  vi.stubGlobal('fetch', fn);
  return fn;
}

function jsonOk(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

function jsonError(
  status: number,
  body: unknown = { error: { code: 'internal', message: 'oops' } },
  init: { headers?: Record<string, string> } = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

describe('luminaCloud client', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = mockFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('getBaseUrl', () => {
    it('defaults to https://api.lumina-note.com', () => {
      expect(getBaseUrl()).toBe(DEFAULT_BASE_URL);
    });

    it('uses VITE_LUMINA_CLOUD_BASE_URL when set, stripping trailing slash', () => {
      vi.stubEnv('VITE_LUMINA_CLOUD_BASE_URL', 'https://staging.lumina-note.com/');
      expect(getBaseUrl()).toBe('https://staging.lumina-note.com');
      vi.unstubAllEnvs();
    });

    it('falls back to default when env var is empty / whitespace', () => {
      vi.stubEnv('VITE_LUMINA_CLOUD_BASE_URL', '   ');
      expect(getBaseUrl()).toBe(DEFAULT_BASE_URL);
      vi.unstubAllEnvs();
    });
  });

  describe('verifyLicenseOnline', () => {
    it('POSTs to /v1/license/verify with the license body and no Authorization header', async () => {
      fetchMock.mockResolvedValue(jsonOk({ valid: false, reason: 'malformed' }));

      const result = await verifyLicenseOnline('some-token');

      expect(result).toEqual({ valid: false, reason: 'malformed' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${DEFAULT_BASE_URL}/v1/license/verify`);
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
      expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
      expect(JSON.parse(init.body as string)).toEqual({ license: 'some-token' });
    });

    it('returns the §2.1 valid:true response shape on 200', async () => {
      const payloadResponse = {
        valid: true,
        payload: { v: 1, lid: 'lic_x', email: 'a@b.c', sku: 'lumina-lifetime-founders', features: [], issued_at: '2026-04-28T00:00:00Z', expires_at: null, order_id: 'o', device_limit: 5 },
        revoked: false,
        usage: { period_start: '2026-04-01T00:00:00Z', period_end: '2026-04-30T23:59:59Z', tokens_used: 0, tokens_quota: 5_000_000, requests_count: 0 },
      };
      fetchMock.mockResolvedValue(jsonOk(payloadResponse));

      const result = await verifyLicenseOnline('token');

      expect(result).toEqual(payloadResponse);
    });
  });

  describe('getModels', () => {
    it('GETs /v1/ai/models with Bearer auth and returns the §2.3 shape', async () => {
      const body = {
        data: [
          { id: 'lumina:claude-opus-4-7', upstream: 'anthropic/claude-opus-4-7', context: 1_000_000 },
        ],
      };
      fetchMock.mockResolvedValue(jsonOk(body));

      const result = await getModels('LIC');

      expect(result).toEqual(body);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${DEFAULT_BASE_URL}/v1/ai/models`);
      expect(init.method).toBe('GET');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer LIC');
    });
  });

  describe('getUsage', () => {
    it('GETs /v1/account/usage with Bearer auth and returns the §2.4 shape', async () => {
      const body = {
        period_start: '2026-04-01T00:00:00Z',
        period_end: '2026-04-30T23:59:59Z',
        tokens_used: 12345,
        tokens_quota: 5_000_000,
        requests_count: 17,
      };
      fetchMock.mockResolvedValue(jsonOk(body));

      const result = await getUsage('LIC');

      expect(result).toEqual(body);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${DEFAULT_BASE_URL}/v1/account/usage`);
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer LIC');
    });
  });

  describe('getRevocations', () => {
    it('GETs without auth and without ?since when none provided', async () => {
      fetchMock.mockResolvedValue(jsonOk({ as_of: 't', revoked_lids: [] }));

      await getRevocations();

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${DEFAULT_BASE_URL}/v1/license/revocations`);
      expect((init.headers as Record<string, string> | undefined)?.Authorization).toBeUndefined();
    });

    it('appends ?since=<iso> when provided', async () => {
      fetchMock.mockResolvedValue(jsonOk({ as_of: 't', revoked_lids: [] }));

      await getRevocations('2026-04-28T00:00:00Z');

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe(`${DEFAULT_BASE_URL}/v1/license/revocations?since=2026-04-28T00%3A00%3A00Z`);
    });
  });

  describe('error mapping', () => {
    it.each([
      [400, 'bad_request'],
      [401, 'invalid_license'],
      [402, 'quota_exceeded'],
      [403, 'feature_disabled'],
      [404, 'not_found'],
      [429, 'rate_limit'],
      [500, 'internal'],
      [502, 'upstream_unavailable'],
    ])('maps HTTP %i to code %s when body is unparseable', async (status, expected) => {
      fetchMock.mockResolvedValue(new Response('not json', { status }));

      const err = await getUsage('LIC').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(LuminaCloudError);
      const e = err as LuminaCloudError;
      expect(e.code).toBe(expected as LuminaCloudErrorCode);
      expect(e.status).toBe(status);
    });

    it('uses the server-provided code when the error body parses', async () => {
      fetchMock.mockResolvedValue(
        jsonError(401, { error: { code: 'revoked_license', message: 'license is revoked' } })
      );

      const err = await getUsage('LIC').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(LuminaCloudError);
      const e = err as LuminaCloudError;
      expect(e.code).toBe('revoked_license');
      expect(e.message).toBe('license is revoked');
      expect(e.status).toBe(401);
    });

    it('exposes Retry-After on 429', async () => {
      fetchMock.mockResolvedValue(
        jsonError(429, { error: { code: 'rate_limit', message: 'slow down' } }, { headers: { 'Retry-After': '12' } })
      );

      const err = await getUsage('LIC').catch((e: unknown) => e);

      const e = err as LuminaCloudError;
      expect(e.code).toBe('rate_limit');
      expect(e.retryAfterSeconds).toBe(12);
    });

    it('translates fetch rejection into LuminaCloudError code=network', async () => {
      fetchMock.mockRejectedValue(new TypeError('failed to fetch'));

      const err = await getUsage('LIC').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(LuminaCloudError);
      const e = err as LuminaCloudError;
      expect(e.code).toBe('network');
      expect(e.status).toBeNull();
      expect(e.message).toBe('failed to fetch');
    });

    it('falls back to code=unknown for an unmapped 4xx without body', async () => {
      fetchMock.mockResolvedValue(new Response('', { status: 418 }));

      const err = await getUsage('LIC').catch((e: unknown) => e);

      expect((err as LuminaCloudError).code).toBe('unknown');
      expect((err as LuminaCloudError).status).toBe(418);
    });
  });
});
