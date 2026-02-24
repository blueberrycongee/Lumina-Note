/**
 * i18n 模块测试
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getTranslations, detectSystemLocale, SUPPORTED_LOCALES, Locale } from './index';

describe('i18n', () => {
  describe('SUPPORTED_LOCALES', () => {
    it('should have 4 supported locales', () => {
      expect(SUPPORTED_LOCALES.length).toBe(4);
    });

    it('should include zh-CN, zh-TW, en, ja', () => {
      const codes = SUPPORTED_LOCALES.map(l => l.code);
      expect(codes).toContain('zh-CN');
      expect(codes).toContain('zh-TW');
      expect(codes).toContain('en');
      expect(codes).toContain('ja');
    });

    it('should have name and nativeName for each locale', () => {
      SUPPORTED_LOCALES.forEach(locale => {
        expect(locale.name).toBeTruthy();
        expect(locale.nativeName).toBeTruthy();
      });
    });
  });

  describe('getTranslations', () => {
    it('should return translations for zh-CN', () => {
      const t = getTranslations('zh-CN');
      expect(t).toBeDefined();
      expect(t.common).toBeDefined();
    });

    it('should return translations for en', () => {
      const t = getTranslations('en');
      expect(t).toBeDefined();
      expect(t.common).toBeDefined();
    });

    it('should return translations for zh-TW', () => {
      const t = getTranslations('zh-TW');
      expect(t).toBeDefined();
    });

    it('should return translations for ja', () => {
      const t = getTranslations('ja');
      expect(t).toBeDefined();
    });

    it('should fallback to zh-CN for unknown locale', () => {
      const t = getTranslations('unknown' as Locale);
      const zhCN = getTranslations('zh-CN');
      expect(t).toEqual(zhCN);
    });
  });

  describe('detectSystemLocale', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should detect zh-CN for Chinese Simplified', () => {
      vi.stubGlobal('navigator', { language: 'zh-CN' });
      expect(detectSystemLocale()).toBe('zh-CN');
    });

    it('should detect zh-TW for Chinese Traditional', () => {
      vi.stubGlobal('navigator', { language: 'zh-TW' });
      expect(detectSystemLocale()).toBe('zh-TW');
    });

    it('should detect zh-TW for Hong Kong Chinese', () => {
      vi.stubGlobal('navigator', { language: 'zh-HK' });
      expect(detectSystemLocale()).toBe('zh-TW');
    });

    it('should detect en for English', () => {
      vi.stubGlobal('navigator', { language: 'en-US' });
      expect(detectSystemLocale()).toBe('en');
    });

    it('should detect ja for Japanese', () => {
      vi.stubGlobal('navigator', { language: 'ja-JP' });
      expect(detectSystemLocale()).toBe('ja');
    });

    it('should default to zh-CN for unknown languages', () => {
      vi.stubGlobal('navigator', { language: 'de-DE' });
      expect(detectSystemLocale()).toBe('zh-CN');
    });
  });
});
