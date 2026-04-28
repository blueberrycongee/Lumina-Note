import { afterEach, describe, expect, it, vi } from 'vitest';

const fetchCloudModels = vi.hoisted(() => vi.fn());

vi.mock('@/services/luminaCloud', async () => {
  const actual = await vi.importActual<typeof import('@/services/luminaCloud')>(
    '@/services/luminaCloud'
  );
  return {
    ...actual,
    getModels: fetchCloudModels,
  };
});

import {
  fetchLuminaCloudModels,
  isLuminaCloudVisible,
  LUMINA_CLOUD_BASE_URL,
  LUMINA_CLOUD_PROVIDER,
  LUMINA_CLOUD_PROVIDER_ID,
  LUMINA_CLOUD_REQUIRED_FEATURE,
} from './luminaCloud';

describe('LUMINA_CLOUD_PROVIDER shape', () => {
  it('exposes the constants the consumer needs to render and resolve the provider', () => {
    expect(LUMINA_CLOUD_PROVIDER_ID).toBe('lumina-cloud');
    expect(LUMINA_CLOUD_REQUIRED_FEATURE).toBe('cloud_ai');
    expect(LUMINA_CLOUD_BASE_URL).toBe('https://api.lumina-note.com/v1/ai');
  });

  it('matches the ProviderMeta shape the AI settings list consumes', () => {
    expect(LUMINA_CLOUD_PROVIDER).toMatchObject({
      id: LUMINA_CLOUD_PROVIDER_ID,
      label: 'Lumina Cloud',
      defaultBaseUrl: LUMINA_CLOUD_BASE_URL,
      requiresApiKey: true,
      supportsBaseUrl: false,
      models: [],
    });
    expect(typeof LUMINA_CLOUD_PROVIDER.description).toBe('string');
    expect(LUMINA_CLOUD_PROVIDER.description.length).toBeGreaterThan(0);
  });
});

describe('isLuminaCloudVisible', () => {
  it('hides the provider when there is no payload', () => {
    expect(isLuminaCloudVisible(null)).toBe(false);
    expect(isLuminaCloudVisible(undefined)).toBe(false);
  });

  it('hides the provider when the license lacks cloud_ai', () => {
    expect(isLuminaCloudVisible([])).toBe(false);
    expect(isLuminaCloudVisible(['sync'])).toBe(false);
    expect(isLuminaCloudVisible(['lifetime'])).toBe(false);
  });

  it('shows the provider when the license includes cloud_ai', () => {
    expect(isLuminaCloudVisible(['cloud_ai'])).toBe(true);
    expect(isLuminaCloudVisible(['cloud_ai', 'sync'])).toBe(true);
    expect(isLuminaCloudVisible(['lifetime', 'cloud_ai', 'sync'])).toBe(true);
  });
});

describe('fetchLuminaCloudModels', () => {
  afterEach(() => {
    fetchCloudModels.mockReset();
  });

  it('maps server `{ id, upstream, context }` to `ModelMeta` rows', async () => {
    fetchCloudModels.mockResolvedValue({
      data: [
        { id: 'lumina:claude-opus-4-7', upstream: 'anthropic/claude-opus-4-7', context: 1_000_000 },
        { id: 'lumina:gpt-5', upstream: 'openai/gpt-5', context: 400_000 },
      ],
    });

    const models = await fetchLuminaCloudModels('LIC');

    expect(fetchCloudModels).toHaveBeenCalledWith('LIC');
    expect(models).toEqual([
      { id: 'lumina:claude-opus-4-7', name: 'lumina:claude-opus-4-7', contextWindow: 1_000_000 },
      { id: 'lumina:gpt-5', name: 'lumina:gpt-5', contextWindow: 400_000 },
    ]);
  });

  it('returns an empty list when the server reports no models', async () => {
    fetchCloudModels.mockResolvedValue({ data: [] });

    expect(await fetchLuminaCloudModels('LIC')).toEqual([]);
  });

  it('propagates client errors so the UI can render the empty / error state', async () => {
    fetchCloudModels.mockRejectedValue(new Error('boom'));

    await expect(fetchLuminaCloudModels('LIC')).rejects.toThrow('boom');
  });
});
