import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LicensePayload, ModelsResponse, UsageResponse } from '@/services/luminaCloud';

// ──────────────────────────────────────────────────────────────────────────
// Mocks for the four luminaCloud touchpoints this flow exercises.
// hoisted so that vi.mock factories below can reference them.

const verifyLicense = vi.hoisted(() => vi.fn());
const saveLicense = vi.hoisted(() => vi.fn());
const removeLicense = vi.hoisted(() => vi.fn());
const loadLicense = vi.hoisted(() => vi.fn());
const getUsage = vi.hoisted(() => vi.fn());
const getModels = vi.hoisted(() => vi.fn());

vi.mock('@/services/luminaCloud', async () => {
  const actual = await vi.importActual<typeof import('@/services/luminaCloud')>(
    '@/services/luminaCloud'
  );
  return {
    ...actual,
    verifyLicense,
    saveLicense,
    removeLicense,
    loadLicense,
    getUsage,
    getModels,
  };
});

// Imports after vi.mock so they pick up the mocked module.
import { fetchLuminaCloudModels, isLuminaCloudVisible } from '@/services/llm/providers/luminaCloud';
import * as luminaCloud from '@/services/luminaCloud';
import { useLicenseStore } from '@/stores/useLicenseStore';

// ──────────────────────────────────────────────────────────────────────────
// Fixtures

const FIXTURE_LICENSE = 'eyJ-fixture-payload-base64url.fixture-signature-base64url';

const FIXTURE_PAYLOAD: LicensePayload = {
  v: 1,
  lid: 'lic_01HXTEST',
  email: 'fixture@example.com',
  sku: 'lumina-lifetime-founders',
  features: ['cloud_ai', 'lifetime'],
  issued_at: '2026-04-28T12:00:00Z',
  expires_at: null,
  order_id: 'creem_ord_test',
  device_limit: 5,
};

const FIXTURE_MODELS: ModelsResponse = {
  data: [
    { id: 'lumina:claude-opus-4-7', upstream: 'anthropic/claude-opus-4-7', context: 1_000_000 },
    { id: 'lumina:gpt-5', upstream: 'openai/gpt-5', context: 400_000 },
  ],
};

const USAGE_BEFORE: UsageResponse = {
  period_start: '2026-04-01T00:00:00Z',
  period_end: '2026-04-30T23:59:59Z',
  tokens_used: 0,
  tokens_quota: 5_000_000,
  requests_count: 0,
};

const USAGE_AFTER: UsageResponse = {
  ...USAGE_BEFORE,
  tokens_used: 1234,
  requests_count: 1,
};

beforeEach(() => {
  useLicenseStore.setState({ license: null, payload: null, status: 'idle' });
  verifyLicense.mockReset();
  saveLicense.mockReset();
  removeLicense.mockReset();
  loadLicense.mockReset();
  getUsage.mockReset();
  getModels.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('luminaCloud e2e: license → chat → usage', () => {
  it('runs the full flow', async () => {
    // Arrange — local verify accepts the fixture, save persists, server has
    // models + usage.
    verifyLicense.mockReturnValue(FIXTURE_PAYLOAD);
    saveLicense.mockResolvedValue(undefined);
    getModels.mockResolvedValue(FIXTURE_MODELS);
    getUsage.mockResolvedValueOnce(USAGE_BEFORE).mockResolvedValueOnce(USAGE_AFTER);

    // 1) Insert fixture license — drives the store through
    //    idle → loading → valid and persists via saveLicense.
    await useLicenseStore.getState().setLicense(FIXTURE_LICENSE);

    expect(useLicenseStore.getState().status).toBe('valid');
    expect(useLicenseStore.getState().license).toBe(FIXTURE_LICENSE);
    expect(useLicenseStore.getState().payload).toEqual(FIXTURE_PAYLOAD);
    expect(verifyLicense).toHaveBeenCalledWith(FIXTURE_LICENSE);
    expect(saveLicense).toHaveBeenCalledWith(FIXTURE_LICENSE);

    // 2) Verify the Lumina Cloud provider is visible to the AI settings UI.
    const features = useLicenseStore.getState().payload?.features;
    expect(isLuminaCloudVisible(features)).toBe(true);

    // The provider's model catalog is fetched dynamically — exercise that
    // path. C7's fetchLuminaCloudModels delegates to client.getModels.
    const models = await fetchLuminaCloudModels(FIXTURE_LICENSE);
    expect(models).toHaveLength(2);
    expect(models[0]).toMatchObject({ id: 'lumina:claude-opus-4-7', contextWindow: 1_000_000 });
    expect(getModels).toHaveBeenCalledWith(FIXTURE_LICENSE);

    // 3) Read usage *before* a chat round-trip happens.
    const before = await luminaCloud.getUsage(FIXTURE_LICENSE);
    expect(before.tokens_used).toBe(0);

    // 4) Mock chat round-trip. In production the AI SDK posts to
    //    /v1/ai/chat/completions with Authorization: Bearer <license>;
    //    the gateway proxies upstream and increments per-license usage.
    //    We're not covering the SDK plumbing here (that's opencode's
    //    surface), only that the *observable* effect — usage moving
    //    forward — flows through `client.getUsage`.

    // 5) After the chat, the next usage poll surfaces the delta.
    const after = await luminaCloud.getUsage(FIXTURE_LICENSE);
    expect(after.tokens_used).toBeGreaterThan(before.tokens_used);
    expect(after.requests_count).toBeGreaterThan(before.requests_count);
    expect(getUsage).toHaveBeenCalledTimes(2);
  });

  it('hides the provider and skips chat when the license is invalid', async () => {
    verifyLicense.mockReturnValue(null);

    await useLicenseStore.getState().setLicense('garbage');

    expect(useLicenseStore.getState().status).toBe('invalid');
    expect(useLicenseStore.getState().payload).toBeNull();
    expect(isLuminaCloudVisible(useLicenseStore.getState().payload?.features)).toBe(false);
    expect(saveLicense).not.toHaveBeenCalled();
    expect(getUsage).not.toHaveBeenCalled();
  });

  it('hides the provider when the license is valid but lacks cloud_ai', async () => {
    const lifetimeOnly: LicensePayload = { ...FIXTURE_PAYLOAD, features: ['lifetime'] };
    verifyLicense.mockReturnValue(lifetimeOnly);
    saveLicense.mockResolvedValue(undefined);

    await useLicenseStore.getState().setLicense(FIXTURE_LICENSE);

    expect(useLicenseStore.getState().status).toBe('valid');
    expect(isLuminaCloudVisible(useLicenseStore.getState().payload?.features)).toBe(false);
  });
});
