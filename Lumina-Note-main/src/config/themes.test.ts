/**
 * 主题配置测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OFFICIAL_THEMES, getThemeById, applyTheme } from './themes';
import type { Theme, ThemeColors } from './themes';

// 保留类型引用以确保类型正确
void (0 as unknown as Theme);
void (0 as unknown as ThemeColors);

// Mock document
const mockSetProperty = vi.fn();
vi.stubGlobal('document', {
  documentElement: {
    style: {
      setProperty: mockSetProperty,
    },
  },
});

describe('OFFICIAL_THEMES', () => {
  it('should have at least 10 themes', () => {
    expect(OFFICIAL_THEMES.length).toBeGreaterThanOrEqual(10);
  });

  it('should have unique IDs', () => {
    const ids = OFFICIAL_THEMES.map(t => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have default theme', () => {
    const defaultTheme = OFFICIAL_THEMES.find(t => t.id === 'default');
    expect(defaultTheme).toBeDefined();
    expect(defaultTheme?.name).toBeTruthy();
  });

  describe('each theme', () => {
    const requiredColorKeys: (keyof ThemeColors)[] = [
      'background', 'foreground', 'muted', 'mutedForeground',
      'accent', 'accentForeground', 'primary', 'primaryForeground', 'border',
      'heading', 'link', 'linkHover', 'code', 'codeBg',
      'codeBlock', 'codeBlockBg', 'blockquote', 'blockquoteBorder',
      'hr', 'tableBorder', 'tableHeaderBg', 'bold', 'italic',
      'listMarker', 'highlight', 'tag',
      'diffAddBg', 'diffAddText', 'diffRemoveBg', 'diffRemoveText'
    ];

    it.each(OFFICIAL_THEMES)('$id should have valid structure', (theme) => {
      expect(theme.id).toBeTruthy();
      expect(theme.name).toBeTruthy();
      expect(typeof theme.description).toBe('string');
      expect(theme.light).toBeDefined();
      expect(theme.dark).toBeDefined();
    });

    it.each(OFFICIAL_THEMES)('$id light colors should be complete', (theme) => {
      requiredColorKeys.forEach(key => {
        expect(theme.light[key]).toBeDefined();
        expect(typeof theme.light[key]).toBe('string');
      });
    });

    it.each(OFFICIAL_THEMES)('$id dark colors should be complete', (theme) => {
      requiredColorKeys.forEach(key => {
        expect(theme.dark[key]).toBeDefined();
        expect(typeof theme.dark[key]).toBe('string');
      });
    });
  });
});

describe('getThemeById', () => {
  it('should return theme by ID', () => {
    const theme = getThemeById('default');
    expect(theme).toBeDefined();
    expect(theme?.id).toBe('default');
  });

  it('should return undefined for non-existent ID', () => {
    const theme = getThemeById('non-existent-theme');
    expect(theme).toBeUndefined();
  });

  it('should return correct theme for each official theme', () => {
    OFFICIAL_THEMES.forEach(t => {
      const found = getThemeById(t.id);
      expect(found).toBe(t);
    });
  });
});

describe('applyTheme', () => {
  beforeEach(() => {
    mockSetProperty.mockClear();
  });

  it('should apply light theme colors to CSS variables', () => {
    const theme = OFFICIAL_THEMES[0];
    applyTheme(theme, false);

    // Should set all CSS variables
    expect(mockSetProperty).toHaveBeenCalled();
    
    // Check specific variables
    expect(mockSetProperty).toHaveBeenCalledWith('--background', theme.light.background);
    expect(mockSetProperty).toHaveBeenCalledWith('--foreground', theme.light.foreground);
    expect(mockSetProperty).toHaveBeenCalledWith('--primary', theme.light.primary);
  });

  it('should apply dark theme colors when isDark is true', () => {
    const theme = OFFICIAL_THEMES[0];
    applyTheme(theme, true);

    expect(mockSetProperty).toHaveBeenCalledWith('--background', theme.dark.background);
    expect(mockSetProperty).toHaveBeenCalledWith('--foreground', theme.dark.foreground);
  });

  it('should apply markdown-specific colors', () => {
    const theme = OFFICIAL_THEMES[0];
    applyTheme(theme, false);

    expect(mockSetProperty).toHaveBeenCalledWith('--md-heading', theme.light.heading);
    expect(mockSetProperty).toHaveBeenCalledWith('--md-link', theme.light.link);
    expect(mockSetProperty).toHaveBeenCalledWith('--md-code', theme.light.code);
  });

  it('should apply diff colors', () => {
    const theme = OFFICIAL_THEMES[0];
    applyTheme(theme, false);

    expect(mockSetProperty).toHaveBeenCalledWith('--diff-add-bg', theme.light.diffAddBg);
    expect(mockSetProperty).toHaveBeenCalledWith('--diff-remove-bg', theme.light.diffRemoveBg);
  });
});
