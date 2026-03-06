import { describe, expect, it, vi } from 'vitest';

vi.mock('@/stores/useLocaleStore', () => ({
  getCurrentTranslations: () => ({
    ai: {
      apiKeyRequired: 'Please configure your API key in AI settings',
    },
  }),
}));

import { formatUserFriendlyError } from './aiErrorFormatting';

describe('formatUserFriendlyError', () => {
  it('preserves provider model-not-found messages instead of returning hardcoded Chinese', () => {
    expect(
      formatUserFriendlyError('HTTP 404 error: {"error":{"message":"model \'gpt-4.1\' does not exist"}}')
    ).toBe("model 'gpt-4.1' does not exist");
  });

  it('translates missing API key errors via i18n', () => {
    expect(
      formatUserFriendlyError('HTTP 401 error: {"error":{"message":"You did not provide an API key."}}')
    ).toBe('Please configure your API key in AI settings');
  });

  it('preserves generic network errors instead of returning hardcoded Chinese', () => {
    expect(formatUserFriendlyError('Network connection failed')).toBe('Network connection failed');
  });
});
