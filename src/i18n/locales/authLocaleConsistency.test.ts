import { describe, expect, it } from 'vitest';

import en from '@/i18n/locales/en';
import ja from '@/i18n/locales/ja';
import zhCN from '@/i18n/locales/zh-CN';
import zhTW from '@/i18n/locales/zh-TW';

const locales = [
  ['en', en],
  ['zh-CN', zhCN],
  ['zh-TW', zhTW],
  ['ja', ja],
] as const;

describe('auth locale consistency', () => {
  it('uses an 8-character minimum in placeholders and validation messages', () => {
    for (const [locale, messages] of locales) {
      expect(messages.auth.passwordPlaceholder, `${locale} placeholder`).toContain('8');
      expect(messages.auth.passwordTooShort, `${locale} error`).toContain('8');
    }
  });
});
