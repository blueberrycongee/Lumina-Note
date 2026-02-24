/**
 * 主题插件测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock themes.ts
vi.mock('./themes', () => ({
  OFFICIAL_THEMES: [
    {
      id: 'default',
      name: 'Default',
      description: 'Default theme',
      light: {
        background: '0 0% 100%',
        foreground: '0 0% 10%',
        muted: '0 0% 95%',
        mutedForeground: '0 0% 45%',
        accent: '0 0% 90%',
        accentForeground: '0 0% 15%',
        primary: '220 70% 50%',
        primaryForeground: '0 0% 98%',
        border: '0 0% 90%',
        heading: '220 70% 35%',
        link: '220 70% 45%',
        linkHover: '220 70% 40%',
        code: '30 50% 35%',
        codeBg: '0 0% 95%',
        codeBlock: '0 0% 20%',
        codeBlockBg: '0 0% 96%',
        blockquote: '0 0% 40%',
        blockquoteBorder: '220 60% 60%',
        hr: '0 0% 80%',
        tableBorder: '0 0% 85%',
        tableHeaderBg: '0 0% 95%',
        bold: '0 0% 15%',
        italic: '0 0% 25%',
        listMarker: '220 65% 50%',
        highlight: '50 80% 85%',
        tag: '250 70% 45%',
        diffAddBg: '160 40% 92%',
        diffAddText: '160 50% 30%',
        diffRemoveBg: '350 40% 94%',
        diffRemoveText: '350 50% 35%',
      },
      dark: {
        background: '0 0% 10%',
        foreground: '0 0% 90%',
        muted: '0 0% 15%',
        mutedForeground: '0 0% 55%',
        accent: '0 0% 18%',
        accentForeground: '0 0% 92%',
        primary: '220 70% 55%',
        primaryForeground: '0 0% 98%',
        border: '0 0% 20%',
        heading: '220 60% 70%',
        link: '220 70% 60%',
        linkHover: '220 70% 65%',
        code: '30 40% 70%',
        codeBg: '0 0% 18%',
        codeBlock: '0 0% 85%',
        codeBlockBg: '0 0% 14%',
        blockquote: '0 0% 60%',
        blockquoteBorder: '220 50% 50%',
        hr: '0 0% 25%',
        tableBorder: '0 0% 22%',
        tableHeaderBg: '0 0% 15%',
        bold: '0 0% 95%',
        italic: '0 0% 75%',
        listMarker: '220 60% 55%',
        highlight: '50 50% 25%',
        tag: '250 60% 65%',
        diffAddBg: '160 30% 18%',
        diffAddText: '160 40% 70%',
        diffRemoveBg: '350 30% 18%',
        diffRemoveText: '350 40% 70%',
      },
    },
  ],
  applyTheme: vi.fn(),
}));

import {
  getAllThemes,
  getUserThemes,
  getThemeById,
  exportTheme,
  importTheme,
  createThemeTemplate,
} from './themePlugin';
import { OFFICIAL_THEMES } from './themes';

describe('themePlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAllThemes', () => {
    it('should return official themes when no user themes loaded', () => {
      const themes = getAllThemes();
      expect(themes.length).toBe(OFFICIAL_THEMES.length);
    });
  });

  describe('getUserThemes', () => {
    it('should return empty array initially', () => {
      const themes = getUserThemes();
      expect(themes).toEqual([]);
    });
  });

  describe('getThemeById', () => {
    it('should find official theme by ID', () => {
      const theme = getThemeById('default');
      expect(theme).toBeDefined();
      expect(theme?.id).toBe('default');
    });

    it('should return undefined for non-existent theme', () => {
      const theme = getThemeById('non-existent');
      expect(theme).toBeUndefined();
    });
  });

  describe('exportTheme', () => {
    it('should export theme as JSON string', () => {
      const theme = OFFICIAL_THEMES[0];
      const exported = exportTheme(theme);
      
      expect(typeof exported).toBe('string');
      
      const parsed = JSON.parse(exported);
      expect(parsed.name).toBe(theme.name);
      expect(parsed._exportedFrom).toBe('Lumina Note');
      expect(parsed._exportedAt).toBeTruthy();
    });

    it('should remove user- prefix from ID', () => {
      const userTheme = { ...OFFICIAL_THEMES[0], id: 'user-custom' };
      const exported = exportTheme(userTheme);
      const parsed = JSON.parse(exported);
      
      expect(parsed.id).toBe('custom');
    });
  });

  describe('importTheme', () => {
    it('should import valid theme JSON', () => {
      const themeJson = JSON.stringify(OFFICIAL_THEMES[0]);
      const imported = importTheme(themeJson);
      
      expect(imported).not.toBeNull();
      expect(imported?.id).toBe('default');
    });

    it('should return null for invalid JSON', () => {
      const result = importTheme('not valid json');
      expect(result).toBeNull();
    });

    it('should return null for incomplete theme', () => {
      const incomplete = JSON.stringify({ id: 'test', name: 'Test' });
      const result = importTheme(incomplete);
      expect(result).toBeNull();
    });

    it('should remove export metadata', () => {
      const withMeta = JSON.stringify({
        ...OFFICIAL_THEMES[0],
        _exportedFrom: 'SomeApp',
        _exportedAt: '2024-01-01',
      });
      const imported = importTheme(withMeta);
      
      expect(imported).not.toBeNull();
      expect((imported as any)._exportedFrom).toBeUndefined();
      expect((imported as any)._exportedAt).toBeUndefined();
    });
  });

  describe('createThemeTemplate', () => {
    it('should create a new theme with unique ID', () => {
      const template = createThemeTemplate();
      
      expect(template.id).toContain('custom-');
      expect(template.name).toBeTruthy();
      expect(template.description).toBeTruthy();
      expect(template.light).toBeDefined();
      expect(template.dark).toBeDefined();
    });

    it('should base on provided theme', () => {
      const base = OFFICIAL_THEMES[0];
      const template = createThemeTemplate(base);
      
      expect(template.light.background).toBe(base.light.background);
      expect(template.dark.background).toBe(base.dark.background);
    });

    it('should create independent copy', () => {
      const base = OFFICIAL_THEMES[0];
      const template = createThemeTemplate(base);
      
      // Modify template should not affect base
      template.light.background = 'modified';
      expect(base.light.background).not.toBe('modified');
    });
  });
});
